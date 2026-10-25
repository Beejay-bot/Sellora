import { createOrder } from "../domain/orders.js";
import { createOrderInputSchema, type CreateOrderInput } from "../schemas/order.js";
import { defaultStorage, PersistentStorage } from "../services/storage.js";
import type { ToolResult } from "./products.js";

export async function handleCreateOrder(
  input: unknown,
  storage: PersistentStorage = defaultStorage
): Promise<ToolResult> {
  try {
    const parsed = createOrderInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        success: false,
        error: `Validation failed on ${issue.path.join(".")}: ${issue.message}`
      };
    }

    const currentCatalogue = await storage.getProducts();
    const order = createOrder(currentCatalogue, parsed.data);

    await storage.saveOrder(order);

    for (const item of order.items) {
      const product = await storage.getProductById(item.productId);
      if (product) {
        product.stockQuantity = Math.max(0, product.stockQuantity - item.quantity);
        product.updatedAt = new Date().toISOString();
        await storage.saveProduct(product);
      }
    }

    return {
      success: true,
      data: {
        order,
        message: `Order ${order.orderId} created successfully for ${order.customerName}. Subtotal: ₦${order.totalNgn.toLocaleString()}. Status: ${order.status}.`
      }
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Failed to create order."
    };
  }
}

export async function handleGetOrder(
  orderId: string,
  storage: PersistentStorage = defaultStorage
): Promise<ToolResult> {
  try {
    if (!orderId || typeof orderId !== "string") {
      return {
        success: false,
        error: "Missing or invalid orderId."
      };
    }

    const order = await storage.getOrderById(orderId);
    if (!order) {
      return {
        success: false,
        error: `Order with ID '${orderId}' not found.`
      };
    }

    return {
      success: true,
      data: { order }
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Failed to retrieve order."
    };
  }
}
