import { generateStatusCaptions, saveCampaign } from "../domain/campaigns.js";
import {
  generateCampaignInputSchema,
  saveCampaignInputSchema,
  type GenerateCampaignInput
} from "../schemas/campaign.js";
import { defaultStorage, normalizeMerchantId, PersistentStorage } from "../services/storage.js";
import type { ToolResult } from "./products.js";

export async function handleGenerateStatusCaptions(
  rawInput: GenerateCampaignInput = {},
  storage: PersistentStorage = defaultStorage,
  defaultMerchantId?: string
): Promise<ToolResult> {
  try {
    const merchantId = normalizeMerchantId((rawInput as any)?.merchantId || defaultMerchantId);
    const input = generateCampaignInputSchema.parse({ ...rawInput, merchantId });
    const allProducts = await storage.getProducts(merchantId);
    let eligible = allProducts.filter((p) => p.status === "active" && p.stockQuantity > 0);

    if (input.category) {
      const cat = input.category.toLowerCase().trim();
      eligible = eligible.filter((p) => p.category.toLowerCase().includes(cat));
    }

    if (input.productIds && input.productIds.length > 0) {
      eligible = eligible.filter((p) => input.productIds!.includes(p.productId));
    }

    if (eligible.length === 0) {
      return {
        success: false,
        error: "No matching in-stock products found to generate captions for."
      };
    }

    const options = generateStatusCaptions(eligible, input.theme || "daily_pick");

    return {
      success: true,
      data: {
        merchantId,
        productsReferenced: eligible.map((p) => ({
          productId: p.productId,
          name: p.name,
          variant: p.variant,
          priceNgn: p.priceNgn,
          stock: p.stockQuantity
        })),
        captionOptions: options
      }
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Failed to generate status captions."
    };
  }
}

export async function handleSaveCampaign(
  input: unknown,
  storage: PersistentStorage = defaultStorage,
  defaultMerchantId?: string
): Promise<ToolResult> {
  try {
    const rawInput = typeof input === "object" && input !== null ? input : {};
    const merchantId = normalizeMerchantId((rawInput as any).merchantId || defaultMerchantId);
    const parsed = saveCampaignInputSchema.safeParse({ ...rawInput, merchantId });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        success: false,
        error: `Validation failed on ${issue.path.join(".")}: ${issue.message}`
      };
    }

    const catalogue = await storage.getProducts(merchantId);
    const campaign = saveCampaign(catalogue, parsed.data);
    await storage.saveCampaign(campaign, merchantId);

    return {
      success: true,
      data: {
        merchantId,
        campaign,
        message: `Campaign saved successfully with ID ${campaign.campaignId}. Ready to copy and post to WhatsApp Status.`
      }
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Failed to save campaign."
    };
  }
}

export async function handleManageCampaign(
  input: {
    action: "get_catalogue" | "generate_captions" | "save_campaign";
    merchantId?: string;
    category?: string;
    productIds?: string[];
    theme?: "daily_pick" | "flash_sale" | "new_arrival" | "restock";
    generatedCaption?: string;
    campaignDate?: string;
  },
  storage: PersistentStorage = defaultStorage,
  defaultMerchantId?: string
): Promise<ToolResult> {
  if (!input || !input.action) {
    return {
      success: false,
      error: "Missing required parameter 'action' (must be 'get_catalogue', 'generate_captions', or 'save_campaign')."
    };
  }

  const merchantId = normalizeMerchantId(input?.merchantId || defaultMerchantId);

  switch (input.action) {
    case "get_catalogue": {
      const products = await storage.getProducts(merchantId);
      return {
        success: true,
        data: {
          merchantId,
          total: products.length,
          products: products.filter((p) => p.status === "active")
        }
      };
    }
    case "generate_captions":
      return handleGenerateStatusCaptions(
        { merchantId, category: input.category, productIds: input.productIds, theme: input.theme },
        storage,
        merchantId
      );
    case "save_campaign":
      return handleSaveCampaign(
        {
          merchantId,
          productIds: input.productIds || [],
          generatedCaption: input.generatedCaption,
          campaignDate: input.campaignDate
        },
        storage,
        merchantId
      );
    default:
      return {
        success: false,
        error: `Unsupported campaign action: ${(input as any).action}`
      };
  }
}
