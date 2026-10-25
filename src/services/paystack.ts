import { buildPaymentInitializationPayload } from "../domain/payments.js";
import type { PaymentInitializationInput, PaymentVerification } from "../schemas/payment.js";

export interface PaystackInitResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
  amountNgn: number;
  orderId: string;
  isSimulated: boolean;
}

export interface PaystackVerifyResult {
  reference: string;
  orderId: string;
  verified: boolean;
  providerStatus: "success" | "failed" | "abandoned" | "pending" | "unverified";
  amountPaidNgn?: number;
  paidAt?: string;
  gatewayResponse?: string;
  isSimulated: boolean;
}

export class PaystackService {
  private secretKey: string;
  private defaultCallbackUrl: string;
  private baseUrl: string;

  constructor(
    secretKey = process.env.PAYSTACK_SECRET_KEY || "",
    defaultCallbackUrl = process.env.PAYSTACK_CALLBACK_URL || "https://example.com/paystack/callback",
    baseUrl = process.env.PAYSTACK_BASE_URL || "https://api.paystack.co"
  ) {
    this.secretKey = secretKey;
    this.defaultCallbackUrl = defaultCallbackUrl;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private isLiveCredentials(): boolean {
    return Boolean(
      this.secretKey &&
      this.secretKey.startsWith("sk_") &&
      !this.secretKey.includes("replace_me")
    );
  }

  async initializeTransaction(input: {
    orderId: string;
    customerEmail: string;
    amountNgn: number;
    callbackUrl?: string;
  }): Promise<PaystackInitResult> {
    const callbackUrl = input.callbackUrl || this.defaultCallbackUrl;
    const payload = buildPaymentInitializationPayload({
      orderId: input.orderId,
      customerEmail: input.customerEmail,
      amountNgn: input.amountNgn,
      callbackUrl,
      currency: "NGN"
    });

    if (this.isLiveCredentials()) {
      try {
        const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Paystack initialize returned HTTP ${response.status}: ${errorBody}`);
        }

        const data = (await response.json()) as {
          status: boolean;
          message: string;
          data: {
            authorization_url: string;
            access_code: string;
            reference: string;
          };
        };

        if (!data.status || !data.data?.authorization_url) {
          throw new Error(`Paystack initialization failed: ${data.message || "Unknown error"}`);
        }

        return {
          authorizationUrl: data.data.authorization_url,
          accessCode: data.data.access_code,
          reference: data.data.reference,
          amountNgn: input.amountNgn,
          orderId: input.orderId,
          isSimulated: false
        };
      } catch (err: unknown) {
        console.error("Downstream Paystack API call failed:", (err as Error).message);
        throw err;
      }
    }

    const testReference = `ref_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const testAccessCode = `code_${Math.random().toString(36).substring(2, 9)}`;

    return {
      authorizationUrl: `https://checkout.paystack.com/test_${testReference}`,
      accessCode: testAccessCode,
      reference: testReference,
      amountNgn: input.amountNgn,
      orderId: input.orderId,
      isSimulated: true
    };
  }

  async verifyTransaction(reference: string, expectedOrderId?: string): Promise<PaystackVerifyResult> {
    if (this.isLiveCredentials()) {
      try {
        const response = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            "Content-Type": "application/json"
          }
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Paystack verify returned HTTP ${response.status}: ${errorBody}`);
        }

        const resData = (await response.json()) as {
          status: boolean;
          message: string;
          data: {
            status: string;
            reference: string;
            amount: number;
            paid_at?: string;
            gateway_response?: string;
            metadata?: {
              orderId?: string;
            };
          };
        };

        const tx = resData.data;
        const verified = resData.status && tx.status === "success";
        const orderId = tx.metadata?.orderId || expectedOrderId || "unknown_order";

        return {
          reference: tx.reference,
          orderId,
          verified,
          providerStatus: (tx.status as any) || "unverified",
          amountPaidNgn: tx.amount ? tx.amount / 100 : undefined,
          paidAt: tx.paid_at,
          gatewayResponse: tx.gateway_response,
          isSimulated: false
        };
      } catch (err: unknown) {
        console.error("Downstream Paystack verification API failed:", (err as Error).message);
        throw err;
      }
    }

    const isExplicitFail = reference.includes("fail") || reference.includes("abandoned");
    const isExplicitSuccess = reference.includes("success") || reference.includes("verified");
    const verified = isExplicitSuccess;
    const providerStatus = isExplicitFail ? "failed" : isExplicitSuccess ? "success" : "pending";

    return {
      reference,
      orderId: expectedOrderId || "simulated_order",
      verified,
      providerStatus,
      isSimulated: true
    };
  }
}

export const defaultPaystackService = new PaystackService();
