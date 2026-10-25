import { describe, expect, it } from "vitest";
import { toKobo, formatNaira } from "../src/lib/money.js";
import { applyPaymentVerification, buildPaymentInitializationPayload } from "../src/domain/payments.js";
import { handleInitializePayment, handleVerifyPayment } from "../src/tools/payments.js";
import { PersistentStorage } from "../src/services/storage.js";
import { PaystackService } from "../src/services/paystack.js";
import type { Order } from "../src/schemas/order.js";

describe("Payments Domain & Tools", () => {
  const sampleOrder: Order = {
    orderId: "ord_123456789",
    customerName: "Kemi Adeleke",
    customerPhone: "+2348011223344",
    items: [
      {
        productId: "wigs-bone-straight-18-inch",
        nameSnapshot: "Bone Straight Wig",
        unitPriceNgn: 85000,
        quantity: 1,
        lineTotalNgn: 85000
      }
    ],
    subtotalNgn: 85000,
    totalNgn: 85000,
    paymentStatus: "not_started",
    status: "pending_payment",
    createdAt: "2026-10-20T10:00:00.000Z",
    updatedAt: "2026-10-20T10:00:00.000Z"
  };

  it("converts Naira to Kobo accurately", () => {
    expect(toKobo(85000)).toBe(8500000);
    expect(() => toKobo(-100)).toThrow(/positive integer/i);
    expect(() => toKobo(0)).toThrow(/positive integer/i);
  });

  it("formats Naira properly with currency symbol", () => {
    const formatted = formatNaira(85000);
    expect(formatted).toContain("85,000");
  });

  it("builds Paystack payload with Kobo amount and orderId metadata", () => {
    const payload = buildPaymentInitializationPayload({
      orderId: "ord_123",
      customerEmail: "kemi@example.com",
      amountNgn: 85000,
      callbackUrl: "https://example.com/callback",
      currency: "NGN"
    });

    expect(payload.email).toBe("kemi@example.com");
    expect(payload.amount).toBe(8500000); // 85,000 * 100
    expect(payload.currency).toBe("NGN");
    expect(payload.metadata.orderId).toBe("ord_123");
    expect(payload.metadata.source).toBe("sellora");
  });

  it("initializes payment using trusted order total from storage", async () => {
    const storage = new PersistentStorage("", true);
    await storage.saveOrder(sampleOrder);

    const result = await handleInitializePayment(
      {
        orderId: sampleOrder.orderId,
        customerEmail: "kemi@example.com"
      },
      storage
    );

    expect(result.success).toBe(true);
    expect(result.data.authorizationUrl).toContain("checkout.paystack.com");
    expect(result.data.amountNgn).toBe(85000);
    expect(result.data.paymentStatus).toBe("pending");

    const updatedOrder = await storage.getOrderById(sampleOrder.orderId);
    expect(updatedOrder?.paymentStatus).toBe("pending");
  });

  it("applies verification correctly: marks paid ONLY on success verification", async () => {
    const storage = new PersistentStorage("", true);
    await storage.saveOrder(sampleOrder);

    // 1. Successful verification
    const verifiedOrder = applyPaymentVerification(sampleOrder, {
      orderId: sampleOrder.orderId,
      transactionReference: "ref_test_success_123",
      verified: true,
      providerStatus: "success"
    });

    expect(verifiedOrder.paymentStatus).toBe("verified");
    expect(verifiedOrder.status).toBe("paid");

    // 2. Failed / unverified payment
    const unverifiedOrder = applyPaymentVerification(sampleOrder, {
      orderId: sampleOrder.orderId,
      transactionReference: "ref_test_failed_456",
      verified: false,
      providerStatus: "abandoned"
    });

    expect(unverifiedOrder.paymentStatus).toBe("unverified");
    expect(unverifiedOrder.status).toBe("payment_unverified");
  });

  it("rejects verification if orderId mismatch", () => {
    expect(() =>
      applyPaymentVerification(sampleOrder, {
        orderId: "different_order_id",
        transactionReference: "ref_123",
        verified: true,
        providerStatus: "success"
      })
    ).toThrow(/does not match/i);
  });

  it("executes handleVerifyPayment tool updating order state", async () => {
    const storage = new PersistentStorage("", true);
    await storage.saveOrder(sampleOrder);

    const result = await handleVerifyPayment(
      {
        reference: "ref_test_verified_123",
        orderId: sampleOrder.orderId
      },
      storage
    );

    expect(result.success).toBe(true);
    expect(result.data.verified).toBe(true);
    expect(result.data.orderStatus).toBe("paid");

    const saved = await storage.getOrderById(sampleOrder.orderId);
    expect(saved?.status).toBe("paid");
  });
});
