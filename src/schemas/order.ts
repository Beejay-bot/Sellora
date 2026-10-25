import { z } from "zod";

export const orderStatusSchema = z.enum([
  "pending_payment",
  "paid",
  "payment_unverified",
  "cancelled"
]);

export const orderItemSchema = z.object({
  productId: z.string().min(3),
  nameSnapshot: z.string().min(2),
  variantSnapshot: z.string().trim().min(1).optional(),
  unitPriceNgn: z.number().int().positive(),
  quantity: z.number().int().positive(),
  lineTotalNgn: z.number().int().positive()
});

export const orderSchema = z.object({
  orderId: z.string().min(3),
  customerName: z.string().min(2),
  customerPhone: z.string().min(7),
  items: z.array(orderItemSchema).min(1),
  subtotalNgn: z.number().int().positive(),
  totalNgn: z.number().int().positive(),
  paymentStatus: z.enum(["not_started", "pending", "verified", "unverified"]),
  status: orderStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const createOrderInputSchema = z.object({
  customerName: z.string().min(2),
  customerPhone: z.string().min(7),
  lines: z
    .array(
      z.object({
        productId: z.string().min(3),
        quantity: z.number().int().positive()
      })
    )
    .min(1)
});

export type Order = z.infer<typeof orderSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
