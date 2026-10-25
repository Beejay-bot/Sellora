import { applyPaymentVerification, markPaymentPending } from "../domain/payments.js";
import { defaultPaystackService, PaystackService } from "../services/paystack.js";
import { defaultStorage, PersistentStorage } from "../services/storage.js";
import type { ToolResult } from "./products.js";

export async function handleInitializePayment(
  input: {
    orderId: string;
    customerEmail: string;
    callbackUrl?: string;
  },
  storage: PersistentStorage = defaultStorage,
  paystack: PaystackService = defaultPaystackService
): Promise<ToolResult> {
  try {
    if (!input || !input.orderId || !input.customerEmail) {
      return {
        success: false,
        error: "Missing required fields: 'orderId' and 'customerEmail' are required."
      };
    }

    const order = await storage.getOrderById(input.orderId);
    if (!order) {
      return {
        success: false,
        error: `Order with ID '${input.orderId}' was not found. Cannot initialize payment.`
      };
    }

    if (order.status === "paid") {
      return {
        success: false,
        error: `Order '${input.orderId}' is already marked as paid.`
      };
    }

    const initResult = await paystack.initializeTransaction({
      orderId: order.orderId,
      customerEmail: input.customerEmail,
      amountNgn: order.totalNgn,
      callbackUrl: input.callbackUrl
    });

    const updatedOrder = markPaymentPending(order);
    await storage.saveOrder(updatedOrder);

    return {
      success: true,
      data: {
        orderId: order.orderId,
        amountNgn: order.totalNgn,
        authorizationUrl: initResult.authorizationUrl,
        reference: initResult.reference,
        paymentStatus: "pending",
        isSimulated: initResult.isSimulated,
        message: `Paystack checkout link generated. Status is PENDING. Note: Payment must be verified after completion.`
      }
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Failed to initialize Paystack payment."
    };
  }
}

export async function handleVerifyPayment(
  input: {
    reference: string;
    orderId?: string;
  },
  storage: PersistentStorage = defaultStorage,
  paystack: PaystackService = defaultPaystackService
): Promise<ToolResult> {
  try {
    if (!input || !input.reference) {
      return {
        success: false,
        error: "Missing required field: 'reference'."
      };
    }

    const verifyResult = await paystack.verifyTransaction(input.reference, input.orderId);

    let order = input.orderId ? await storage.getOrderById(input.orderId) : undefined;
    if (!order && verifyResult.orderId) {
      order = await storage.getOrderById(verifyResult.orderId);
    }

    if (order) {
      const updatedOrder = applyPaymentVerification(order, {
        orderId: order.orderId,
        transactionReference: input.reference,
        verified: verifyResult.verified,
        providerStatus: verifyResult.providerStatus
      });
      await storage.saveOrder(updatedOrder);

      return {
        success: true,
        data: {
          orderId: order.orderId,
          reference: input.reference,
          verified: verifyResult.verified,
          providerStatus: verifyResult.providerStatus,
          orderStatus: updatedOrder.status,
          amountPaidNgn: verifyResult.amountPaidNgn,
          message: verifyResult.verified
            ? `Payment verified successfully! Order ${order.orderId} marked as PAID.`
            : `Payment is NOT verified (Provider status: ${verifyResult.providerStatus}). Order ${order.orderId} remains in ${updatedOrder.status} state.`
        }
      };
    }

    return {
      success: true,
      data: {
        reference: input.reference,
        verified: verifyResult.verified,
        providerStatus: verifyResult.providerStatus,
        message: verifyResult.verified
          ? "Payment reference verified as successful by Paystack, but no matching order record was located to update."
          : `Payment reference verification returned '${verifyResult.providerStatus}'.`
      }
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Failed to verify Paystack payment."
    };
  }
}
