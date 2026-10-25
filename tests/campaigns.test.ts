import { describe, expect, it } from "vitest";
import { generateStatusCaptions, saveCampaign } from "../src/domain/campaigns.js";
import { handleGenerateStatusCaptions, handleManageCampaign, handleSaveCampaign } from "../src/tools/campaigns.js";
import { PersistentStorage } from "../src/services/storage.js";
import type { Product } from "../src/schemas/product.js";

describe("Campaigns Domain & Tools", () => {
  const sampleProducts: Product[] = [
    {
      productId: "wigs-bone-straight-18-inch",
      name: "Bone Straight Wig",
      category: "wigs",
      description: "100% human hair double drawn.",
      variant: "18-inch",
      priceNgn: 85000,
      stockQuantity: 2,
      status: "active",
      createdAt: "2026-10-19T10:00:00.000Z",
      updatedAt: "2026-10-19T10:00:00.000Z"
    }
  ];

  it("generates 3 distinct status captions with accurate Naira prices and call to action", () => {
    const options = generateStatusCaptions(sampleProducts, "daily_pick");

    expect(options).toHaveLength(3);
    for (const opt of options) {
      expect(opt.caption).toContain("₦85,000");
      expect(opt.caption.toLowerCase()).toMatch(/dm|order|reply/);
    }
    // Limited stock alert should appear because stockQuantity is 2
    expect(options[0].caption).toContain("only 2 units left");
  });

  it("throws error when attempting to generate captions from empty product list", () => {
    expect(() => generateStatusCaptions([])).toThrow(/no products provided/i);
  });

  it("saves a valid campaign when referenced product exists", () => {
    const campaign = saveCampaign(sampleProducts, {
      productIds: ["wigs-bone-straight-18-inch"],
      generatedCaption: "Gorgeous bone straight wig for ₦85,000! DM now to order.",
      campaignDate: "2026-10-20"
    });

    expect(campaign.campaignId).toMatch(/^cmp_/);
    expect(campaign.productIds).toEqual(["wigs-bone-straight-18-inch"]);
    expect(campaign.status).toBe("saved");
  });

  it("rejects campaign save if product does not exist in catalogue", () => {
    expect(() =>
      saveCampaign(sampleProducts, {
        productIds: ["non-existent-product"],
        generatedCaption: "Invalid campaign for missing product details"
      })
    ).toThrow(/not found in active catalogue/i);
  });

  it("supports unified handleManageCampaign with all three operations", async () => {
    const storage = new PersistentStorage("", true);
    await storage.saveProduct({
      productId: "wigs-bone-straight-18-inch",
      name: "Bone Straight Wig",
      category: "wigs",
      priceNgn: 85000,
      stockQuantity: 3,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 1. get_catalogue
    const catResult = await handleManageCampaign({ action: "get_catalogue" }, storage);
    expect(catResult.success).toBe(true);
    expect(catResult.data.products.length).toBeGreaterThan(0);

    // 2. generate_captions
    const genResult = await handleManageCampaign(
      { action: "generate_captions", category: "wigs" },
      storage
    );
    expect(genResult.success).toBe(true);
    expect(genResult.data.captionOptions.length).toBe(3);

    // 3. save_campaign
    const saveResult = await handleManageCampaign(
      {
        action: "save_campaign",
        productIds: [catResult.data.products[0].productId],
        generatedCaption: genResult.data.captionOptions[0].caption,
        campaignDate: "2026-10-20"
      },
      storage
    );
    expect(saveResult.success).toBe(true);
    expect(saveResult.data.campaign.campaignId).toBeDefined();
  });
});
