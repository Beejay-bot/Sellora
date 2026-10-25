import { createOrder } from "../domain/orders.js";
import { createOrderInputSchema, type CreateOrderInput } from "../schemas/order.js";
import { defaultStorage, normalizeMerchantId, PersistentStorage } from "../services/storage.js";
import type { ToolResult } from "./products.js";

export async function handleCreateOrder(
  input: unknown,
  storage: PersistentStorage = defaultStorage,
  defaultMerchantId?: string
): Promise<ToolResult> {
  try {
    const rawInput = typeof input === "object" && input !== null ? input : {};
    const merchantId = normalizeMerchantId((rawInput as any).merchantId || defaultMerchantId);

    const parsed = createOrderInputSchema.safeParse({
      ...rawInput,
      merchantId
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        success: false,
        error: `Validation failed on ${issue.path.join(".")}: ${issue.message}`
      };
    }

    const currentCatalogue = await storage.getProducts(merchantId);
    const order = createOrder(currentCatalogue, parsed.data);

    await storage.saveOrder(order, merchantId);

    for (const item of order.items) {
      const product = await storage.getProductById(item.productId, merchantId);
      if (product) {
        product.stockQuantity = Math.max(0, product.stockQuantity - item.quantity);
        product.updatedAt = new Date().toISOString();
        await storage.saveProduct(product, merchantId);
      }
    }

    return {
      success: true,
      data: {
        order,
        merchantId,
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
  storage: PersistentStorage = defaultStorage,
  merchantIdInput?: string
): Promise<ToolResult> {
  try {
    if (!orderId || typeof orderId !== "string") {
      return {
        success: false,
        error: "Missing or invalid orderId."
      };
    }

    const merchantId = merchantIdInput ? normalizeMerchantId(merchantIdInput) : undefined;
    const order = await storage.getOrderById(orderId, merchantId);
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
