import { createOrderInputSchema, orderSchema, type CreateOrderInput, type Order } from "../schemas/order.js";
import type { Product } from "../schemas/product.js";

function buildOrderId(now: Date): string {
  return `ord_${now.getTime()}`;
}

export function createOrder(catalogue: Product[], rawInput: CreateOrderInput, now = new Date()): Order {
  const input = createOrderInputSchema.parse(rawInput);

  const items = input.lines.map((line) => {
    const product = catalogue.find((entry) => entry.productId === line.productId && entry.status === "active");

    if (!product) {
      throw new Error(`Product ${line.productId} was not found in the active catalogue.`);
    }

    if (product.stockQuantity < line.quantity) {
      throw new Error(`Product ${line.productId} has insufficient stock for quantity ${line.quantity}.`);
    }

    return {
      productId: product.productId,
      nameSnapshot: product.name,
      variantSnapshot: product.variant,
      unitPriceNgn: product.priceNgn,
      quantity: line.quantity,
      lineTotalNgn: product.priceNgn * line.quantity
    };
  });

  const subtotalNgn = items.reduce((total, item) => total + item.lineTotalNgn, 0);
  const timestamp = now.toISOString();

  return orderSchema.parse({
    orderId: buildOrderId(now),
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    items,
    subtotalNgn,
    totalNgn: subtotalNgn,
    paymentStatus: "not_started",
    status: "pending_payment",
    createdAt: timestamp,
    updatedAt: timestamp
  });
}
