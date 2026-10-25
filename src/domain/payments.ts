import { toKobo } from "../lib/money.js";
import {
  paymentInitializationInputSchema,
  paymentInitializationPayloadSchema,
  paymentVerificationSchema,
  type PaymentInitializationInput,
  type PaymentInitializationPayload,
  type PaymentVerification
} from "../schemas/payment.js";
import { orderSchema, type Order } from "../schemas/order.js";

export function buildPaymentInitializationPayload(
  rawInput: PaymentInitializationInput
): PaymentInitializationPayload {
  const input = paymentInitializationInputSchema.parse(rawInput);

  return paymentInitializationPayloadSchema.parse({
    email: input.customerEmail,
    amount: toKobo(input.amountNgn),
    currency: "NGN",
    callback_url: input.callbackUrl,
    metadata: {
      orderId: input.orderId,
      source: "sellora"
    }
  });
}

export function markPaymentPending(order: Order, now = new Date()): Order {
  return orderSchema.parse({
    ...order,
    paymentStatus: "pending",
    updatedAt: now.toISOString()
  });
}

export function applyPaymentVerification(
  order: Order,
  rawVerification: PaymentVerification,
  now = new Date()
): Order {
  const verification = paymentVerificationSchema.parse(rawVerification);

  if (verification.orderId !== order.orderId) {
    throw new Error("Verification order ID does not match the current order.");
  }

  if (verification.verified) {
    return orderSchema.parse({
      ...order,
      paymentStatus: "verified",
      status: "paid",
      updatedAt: now.toISOString()
    });
  }

  return orderSchema.parse({
    ...order,
    paymentStatus: "unverified",
    status: "payment_unverified",
    updatedAt: now.toISOString()
  });
}
