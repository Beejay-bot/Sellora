import { describe, expect, it } from "vitest";
import { PersistentStorage } from "../src/services/storage.js";
import { handleGetCatalogue, handleUpsertProduct } from "../src/tools/products.js";
import { handleCreateOrder } from "../src/tools/orders.js";
import { createServer } from "../src/server.js";
import http from "node:http";

describe("Multi-tenant Merchant Isolation", () => {
  it("isolates products between different merchants in storage", async () => {
    const storage = new PersistentStorage(":memory:", true);

    // Initial check: Jola and Bolaji have 0 products (default seed is on 'default')
    const jolaProductsInitial = await storage.getProducts("jola");
    const bolajiProductsInitial = await storage.getProducts("bolaji");
    expect(jolaProductsInitial.length).toBe(0);
    expect(bolajiProductsInitial.length).toBe(0);

    // Jola adds a wig
    await storage.saveProduct({
      productId: "jola-silk-wig-18",
      name: "Jola Silk Wig",
      category: "wigs",
      priceNgn: 95000,
      stockQuantity: 4,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, "jola");

    // Bolaji adds a different product
    await storage.saveProduct({
      productId: "bolaji-afro-kinky-14",
      name: "Bolaji Afro Kinky Wig",
      category: "wigs",
      priceNgn: 70000,
      stockQuantity: 2,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, "bolaji");

    // Verify Jola only sees Jola's product
    const jolaProducts = await storage.getProducts("jola");
    expect(jolaProducts.length).toBe(1);
    expect(jolaProducts[0].productId).toBe("jola-silk-wig-18");
    expect(jolaProducts[0].merchantId).toBe("jola");

    // Verify Bolaji only sees Bolaji's product
    const bolajiProducts = await storage.getProducts("bolaji");
    expect(bolajiProducts.length).toBe(1);
    expect(bolajiProducts[0].productId).toBe("bolaji-afro-kinky-14");
    expect(bolajiProducts[0].merchantId).toBe("bolaji");

    // Product lookup by ID is isolated
    const jolaLookupInBolaji = await storage.getProductById("jola-silk-wig-18", "bolaji");
    expect(jolaLookupInBolaji).toBeUndefined();

    const jolaLookupInJola = await storage.getProductById("jola-silk-wig-18", "jola");
    expect(jolaLookupInJola?.name).toBe("Jola Silk Wig");
  });

  it("isolates tool execution (upsert_product and get_catalogue) per merchant", async () => {
    const storage = new PersistentStorage(":memory:", true);

    // Upsert product for Jola
    const upsertRes = await handleUpsertProduct({
      merchantId: "All-thingz beauty",
      name: "HD Lace Closure Wig",
      category: "wigs",
      variant: "20-inch",
      priceNgn: 110000,
      stockQuantity: 5
    }, storage);

    expect(upsertRes.success).toBe(true);
    expect(upsertRes.data.merchantId).toBe("all-thingz-beauty");

    // Jola queries catalogue
    const jolaCat = await handleGetCatalogue(storage, "All-thingz beauty");
    expect(jolaCat.success).toBe(true);
    expect(jolaCat.data.total).toBe(1);
    expect(jolaCat.data.products[0].name).toBe("HD Lace Closure Wig");

    // Bolaji queries catalogue - should be empty
    const bolajiCat = await handleGetCatalogue(storage, "bolaji");
    expect(bolajiCat.success).toBe(true);
    expect(bolajiCat.data.total).toBe(0);
    expect(bolajiCat.data.products.length).toBe(0);
  });

  it("isolates orders and stock deductions per merchant", async () => {
    const storage = new PersistentStorage(":memory:", true);

    // Add product to Jola's catalogue
    await handleUpsertProduct({
      merchantId: "jola",
      name: "Bone Straight 22-inch",
      category: "wigs",
      priceNgn: 120000,
      stockQuantity: 3
    }, storage);

    // Create order for Jola
    const orderRes = await handleCreateOrder({
      merchantId: "jola",
      customerName: "Chioma Obi",
      customerPhone: "08012345678",
      lines: [
        {
          productId: "wigs-bone-straight-22-inch",
          quantity: 1
        }
      ]
    }, storage);

    expect(orderRes.success).toBe(true);
    expect(orderRes.data.merchantId).toBe("jola");

    // Stock for Jola should be decremented from 3 to 2
    const product = await storage.getProductById("wigs-bone-straight-22-inch", "jola");
    expect(product?.stockQuantity).toBe(2);

    // Orders for Jola should have 1 order
    const jolaOrders = await storage.getOrders("jola");
    expect(jolaOrders.length).toBe(1);

    // Orders for Bolaji should have 0 orders
    const bolajiOrders = await storage.getOrders("bolaji");
    expect(bolajiOrders.length).toBe(0);
  });

  it("handles multi-tenant isolation over HTTP via header and request body", async () => {
    const storage = new PersistentStorage(":memory:", true);
    const server = createServer(storage);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const authHeaders: Record<string, string> = process.env.CHORD_TOOL_TOKEN
      ? { Authorization: `Bearer ${process.env.CHORD_TOOL_TOKEN}` }
      : {};

    try {
      // 1. Post product for merchant 'jola' via /tools/upsert_product
      const postProduct = await fetch(`http://127.0.0.1:${port}/tools/upsert_product`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          merchantId: "jola",
          name: "Deep Wave Wig",
          category: "wigs",
          priceNgn: 90000,
          stockQuantity: 5
        })
      });
      const postProductData = await postProduct.json();
      expect(postProductData.success).toBe(true);

      // 2. Query /catalogue with X-Merchant-Id: jola
      const jolaRes = await fetch(`http://127.0.0.1:${port}/catalogue`, {
        headers: {
          ...authHeaders,
          "X-Merchant-Id": "jola"
        }
      });
      const jolaData = await jolaRes.json();
      expect(jolaData.data.total).toBe(1);
      expect(jolaData.data.products[0].name).toBe("Deep Wave Wig");

      // 3. Query /catalogue with X-Merchant-Id: bolaji -> empty
      const bolajiRes = await fetch(`http://127.0.0.1:${port}/catalogue`, {
        headers: {
          ...authHeaders,
          "X-Merchant-Id": "bolaji"
        }
      });
      const bolajiData = await bolajiRes.json();
      expect(bolajiData.data.total).toBe(0);
      expect(bolajiData.data.products.length).toBe(0);
    } finally {
      server.close();
    }
  });
});
