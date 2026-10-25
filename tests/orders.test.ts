import { describe, expect, it } from "vitest";
import { createOrder } from "../src/domain/orders.js";
import { handleCreateOrder, handleGetOrder } from "../src/tools/orders.js";
import { PersistentStorage } from "../src/services/storage.js";
import type { Product } from "../src/schemas/product.js";

describe("Orders Domain & Tools", () => {
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

  it("creates an order and accurately computes totals based on catalogue prices", () => {
    const order = createOrder(sampleProducts, {
      customerName: "Amaka Bello",
      customerPhone: "+2348012345678",
      lines: [
        {
          productId: "wigs-bone-straight-18-inch",
          quantity: 2
        }
      ]
    });

    expect(order.orderId).toMatch(/^ord_/);
    expect(order.customerName).toBe("Amaka Bello");
    expect(order.items[0].lineTotalNgn).toBe(170000);
    expect(order.totalNgn).toBe(170000);
    expect(order.status).toBe("pending_payment");
    expect(order.paymentStatus).toBe("not_started");
  });

  it("throws error when ordered product is not in the active catalogue", () => {
    expect(() =>
      createOrder(sampleProducts, {
        customerName: "Chioma",
        customerPhone: "+2348099999999",
        lines: [{ productId: "non-existent-wig", quantity: 1 }]
      })
    ).toThrow(/not found in the active catalogue/i);
  });

  it("throws error when requested quantity exceeds available stock", () => {
    expect(() =>
      createOrder(sampleProducts, {
        customerName: "Chioma",
        customerPhone: "+2348099999999",
        lines: [{ productId: "wigs-bone-straight-18-inch", quantity: 5 }]
      })
    ).toThrow(/insufficient stock/i);
  });

  it("decrements stock in storage upon successful order creation", async () => {
    const storage = new PersistentStorage("", true);
    const initialProducts = await storage.getProducts();
    const targetProduct = initialProducts[0];
    const initialStock = targetProduct.stockQuantity;

    const result = await handleCreateOrder(
      {
        customerName: "Zainab Ahmed",
        customerPhone: "+2348033333333",
        lines: [{ productId: targetProduct.productId, quantity: 1 }]
      },
      storage
    );

    expect(result.success).toBe(true);
    expect(result.data.order.orderId).toBeDefined();

    const updatedProduct = await storage.getProductById(targetProduct.productId);
    expect(updatedProduct?.stockQuantity).toBe(initialStock - 1);

    const fetchOrder = await handleGetOrder(result.data.order.orderId, storage);
    expect(fetchOrder.success).toBe(true);
    expect(fetchOrder.data.order.customerName).toBe("Zainab Ahmed");
  });
});
