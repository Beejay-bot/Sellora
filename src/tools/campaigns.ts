import { generateStatusCaptions, saveCampaign } from "../domain/campaigns.js";
import {
  generateCampaignInputSchema,
  saveCampaignInputSchema,
  type GenerateCampaignInput
} from "../schemas/campaign.js";
import { defaultStorage, PersistentStorage } from "../services/storage.js";
import type { ToolResult } from "./products.js";

export async function handleGenerateStatusCaptions(
  rawInput: GenerateCampaignInput = {},
  storage: PersistentStorage = defaultStorage
): Promise<ToolResult> {
  try {
    const input = generateCampaignInputSchema.parse(rawInput);
    const allProducts = await storage.getProducts();
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
  storage: PersistentStorage = defaultStorage
): Promise<ToolResult> {
  try {
    const parsed = saveCampaignInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        success: false,
        error: `Validation failed on ${issue.path.join(".")}: ${issue.message}`
      };
    }

    const catalogue = await storage.getProducts();
    const campaign = saveCampaign(catalogue, parsed.data);
    await storage.saveCampaign(campaign);

    return {
      success: true,
      data: {
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
    category?: string;
    productIds?: string[];
    theme?: "daily_pick" | "flash_sale" | "new_arrival" | "restock";
    generatedCaption?: string;
    campaignDate?: string;
  },
  storage: PersistentStorage = defaultStorage
): Promise<ToolResult> {
  if (!input || !input.action) {
    return {
      success: false,
      error: "Missing required parameter 'action' (must be 'get_catalogue', 'generate_captions', or 'save_campaign')."
    };
  }

  switch (input.action) {
    case "get_catalogue": {
      const products = await storage.getProducts();
      return {
        success: true,
        data: {
          total: products.length,
          products: products.filter((p) => p.status === "active")
        }
      };
    }
    case "generate_captions":
      return handleGenerateStatusCaptions(
        { category: input.category, productIds: input.productIds, theme: input.theme },
        storage
      );
    case "save_campaign":
      return handleSaveCampaign(
        {
          productIds: input.productIds || [],
          generatedCaption: input.generatedCaption,
          campaignDate: input.campaignDate
        },
        storage
      );
    default:
      return {
        success: false,
        error: `Unsupported campaign action: ${(input as any).action}`
      };
  }
}
