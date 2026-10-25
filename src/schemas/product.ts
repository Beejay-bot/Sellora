import { z } from "zod";

export const productStatusSchema = z.enum(["active", "archived"]);

export const productSchema = z.object({
  productId: z.string().min(3),
  merchantId: z.string().optional(),
  name: z.string().min(2),
  category: z.string().min(2),
  description: z.string().trim().min(2).optional(),
  variant: z.string().trim().min(1).optional(),
  priceNgn: z.number().int().positive(),
  stockQuantity: z.number().int().nonnegative(),
  status: productStatusSchema.default("active"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const upsertProductInputSchema = z.object({
  merchantId: z.string().optional(),
  name: z.string().min(2),
  category: z.string().min(2).optional().default("beauty"),
  description: z.string().trim().min(2).optional(),
  variant: z.string().trim().min(1).optional(),
  priceNgn: z.number().int().positive(),
  stockQuantity: z.number().int().nonnegative(),
  existingProductId: z.string().min(3).optional()
});

export type Product = z.infer<typeof productSchema>;
export type UpsertProductInput = z.input<typeof upsertProductInputSchema>;
