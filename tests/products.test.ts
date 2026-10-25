import { describe, expect, it } from "vitest";
import { upsertProduct, replaceProduct } from "../src/domain/products.js";
import { handleGetCatalogue, handleUpsertProduct } from "../src/tools/products.js";
import { PersistentStorage } from "../src/services/storage.js";
import type { Product } from "../src/schemas/product.js";

describe("Products Domain & Tools", () => {
  const sampleProducts: Product[] = [
    {
      productId: "wigs-bone-straight-18-inch",
      name: "Bone Straight Wig",
      category: "wigs",
      description: "100% human hair.",
      variant: "18-inch",
      priceNgn: 85000,
      stockQuantity: 3,
      status: "active",
      createdAt: "2026-10-19T10:00:00.000Z",
      updatedAt: "2026-10-19T10:00:00.000Z"
    }
  ];

  it("creates a new product with slugified ID and active status", () => {
    const newProduct = upsertProduct(sampleProducts, {
      name: "Body Wave Wig",
      category: "wigs",
      variant: "22-inch",
      priceNgn: 95000,
      stockQuantity: 2
    });

    expect(newProduct.productId).toBe("wigs-body-wave-wig-22-inch");
    expect(newProduct.status).toBe("active");
    expect(newProduct.priceNgn).toBe(95000);
    expect(newProduct.stockQuantity).toBe(2);
  });

  it("updates existing product while preserving productId and createdAt", () => {
    const updated = upsertProduct(sampleProducts, {
      existingProductId: "wigs-bone-straight-18-inch",
      name: "Bone Straight Wig Updated",
      category: "wigs",
      priceNgn: 90000,
      stockQuantity: 5
    });

    expect(updated.productId).toBe("wigs-bone-straight-18-inch");
    expect(updated.priceNgn).toBe(90000);
    expect(updated.stockQuantity).toBe(5);
    expect(updated.createdAt).toBe("2026-10-19T10:00:00.000Z");

    const catalogue = replaceProduct(sampleProducts, updated);
    expect(catalogue.length).toBe(1);
    expect(catalogue[0].priceNgn).toBe(90000);
  });

  it("rejects negative price via handleUpsertProduct tool", async () => {
    const storage = new PersistentStorage("", true);
    const result = await handleUpsertProduct(
      {
        name: "Invalid Wig",
        category: "wigs",
        priceNgn: -5000,
        stockQuantity: 2
      },
      storage
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Validation failed/i);
  });

  it("rejects negative stock quantity", async () => {
    const storage = new PersistentStorage("", true);
    const result = await handleUpsertProduct(
      {
        name: "Invalid Stock",
        category: "skincare",
        priceNgn: 15000,
        stockQuantity: -1
      },
      storage
    );

    expect(result.success).toBe(false);
  });

  it("retrieves active products via handleGetCatalogue", async () => {
    const storage = new PersistentStorage("", true);
    const result = await handleGetCatalogue(storage);

    expect(result.success).toBe(true);
    expect(result.data.products.length).toBeGreaterThan(0);
    expect(result.data.products[0]).toHaveProperty("productId");
  });
});
