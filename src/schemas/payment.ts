import { z } from "zod";

export const paymentInitializationInputSchema = z.object({
  orderId: z.string().min(3),
  customerEmail: z.email(),
  amountNgn: z.number().int().positive(),
  callbackUrl: z.url(),
  currency: z.literal("NGN").default("NGN")
});

export const paymentInitializationPayloadSchema = z.object({
  email: z.email(),
  amount: z.number().int().positive(),
  currency: z.literal("NGN"),
  callback_url: z.url(),
  metadata: z.object({
    orderId: z.string().min(3),
    source: z.literal("sellora")
  })
});

export const paymentVerificationSchema = z.object({
  orderId: z.string().min(3),
  transactionReference: z.string().min(3),
  verified: z.boolean(),
  providerStatus: z.string().min(2)
});

export type PaymentInitializationInput = z.infer<typeof paymentInitializationInputSchema>;
export type PaymentInitializationPayload = z.infer<typeof paymentInitializationPayloadSchema>;
export type PaymentVerification = z.infer<typeof paymentVerificationSchema>;
