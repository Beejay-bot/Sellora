import { z } from "zod";

export const campaignStatusSchema = z.enum(["draft", "saved", "posted"]);

export const campaignSchema = z.object({
  campaignId: z.string().min(3),
  merchantId: z.string().optional(),
  campaignDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date format"),
  productIds: z.array(z.string().min(3)).min(1),
  generatedCaption: z.string().min(10),
  status: campaignStatusSchema.default("saved"),
  createdAt: z.string().datetime()
});

export const saveCampaignInputSchema = z.object({
  merchantId: z.string().optional(),
  productIds: z.array(z.string().min(3)).min(1),
  generatedCaption: z.string().min(10),
  campaignDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: campaignStatusSchema.optional().default("saved")
});

export const generateCampaignInputSchema = z.object({
  merchantId: z.string().optional(),
  category: z.string().optional(),
  productIds: z.array(z.string().min(3)).optional(),
  theme: z.enum(["flash_sale", "new_arrival", "daily_pick", "restock"]).optional().default("daily_pick")
});

export type Campaign = z.infer<typeof campaignSchema>;
export type SaveCampaignInput = z.input<typeof saveCampaignInputSchema>;
export type GenerateCampaignInput = z.input<typeof generateCampaignInputSchema>;
