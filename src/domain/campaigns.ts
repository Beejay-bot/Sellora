import { formatNaira } from "../lib/money.js";
import {
  campaignSchema,
  saveCampaignInputSchema,
  type Campaign,
  type SaveCampaignInput
} from "../schemas/campaign.js";
import type { Product } from "../schemas/product.js";

export interface GeneratedCaptionOption {
  optionNumber: number;
  headline: string;
  caption: string;
}

export function generateStatusCaptions(
  products: Product[],
  theme: "flash_sale" | "new_arrival" | "daily_pick" | "restock" = "daily_pick"
): GeneratedCaptionOption[] {
  if (products.length === 0) {
    throw new Error("Cannot generate captions: no products provided.");
  }

  const primaryProduct = products[0];
  const formattedPrice = formatNaira(primaryProduct.priceNgn);
  const variantText = primaryProduct.variant ? ` (${primaryProduct.variant})` : "";
  const stockText =
    primaryProduct.stockQuantity <= 3
      ? `\n⚡ Limited stock: only ${primaryProduct.stockQuantity} unit${primaryProduct.stockQuantity === 1 ? "" : "s"} left!`
      : "";

  const option1 = [
    `✨ Fine girl check! Who dey breath?! 💅👑`,
    `Look at this ${primaryProduct.name}${variantText}!`,
    primaryProduct.description || "100% human hair wey dey bounce on its own, no be synthetic abeg!",
    `HD lace wey melt like Blue Band butter on skin 🧈✨`,
    `💰 Price: ${formattedPrice}${stockText}`,
    "",
    "📲 Oya tap DM or reply this status now make we package your crown before e finish!"
  ].join("\n");

  const option2 = [
    `Pressure ti wa! Hair wey go make your ex regret his life choices! 😂🔥`,
    `Looking for that effortless ${primaryProduct.name.toLowerCase()} glow?`,
    `We get the ${primaryProduct.variant || "standard"} ready for instant same-day dispatch!`,
    `Hair wey go give you peace of mind, zero tangling, zero shedding 💆‍♀️`,
    "",
    `💰 Investment: ${formattedPrice}`,
    stockText.trim(),
    "",
    "💬 Send a quick DM with 'ORDER' make we lock am down for you sharp-sharp!"
  ]
    .filter(Boolean)
    .join("\n");

  const option3 = [
    `God when? Sis, God na now! Soft life is a personal choice ✨👑`,
    `Your hair must speak luxury before you even open your mouth!`,
    `Item: ${primaryProduct.name}${variantText}`,
    `💸 Damage: ${formattedPrice}`,
    "",
    primaryProduct.stockQuantity > 0
      ? `✅ In stock: Ready for same-day delivery in Lagos. Interstate 2 to 4 days.`
      : `⚠️ Pre-order only babe.`,
    "",
    "📥 Click reply or tap my profile make we deliver your package sharp-sharp!"
  ].join("\n");

  return [
    { optionNumber: 1, headline: "Baddie & Rich Aunty Vibe 💅", caption: option1 },
    { optionNumber: 2, headline: "Pressure Ti Wa / High Urgency 🔥", caption: option2 },
    { optionNumber: 3, headline: "Soft Life & God Na Now ✨", caption: option3 }
  ];
}

export function saveCampaign(
  catalogue: Product[],
  rawInput: SaveCampaignInput,
  now = new Date()
): Campaign {
  const input = saveCampaignInputSchema.parse(rawInput);

  // Validate all referenced product IDs exist in active catalogue
  for (const productId of input.productIds) {
    const exists = catalogue.some((p) => p.productId === productId && p.status === "active");
    if (!exists) {
      throw new Error(`Referenced product ${productId} was not found in active catalogue.`);
    }
  }

  const campaignDate = input.campaignDate ?? now.toISOString().slice(0, 10);
  const campaignId = `cmp_${now.getTime()}`;

  return campaignSchema.parse({
    campaignId,
    campaignDate,
    productIds: input.productIds,
    generatedCaption: input.generatedCaption,
    status: input.status,
    createdAt: now.toISOString()
  });
}
