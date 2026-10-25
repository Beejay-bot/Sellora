import { upsertProduct } from "../domain/products.js";
import { upsertProductInputSchema, type UpsertProductInput } from "../schemas/product.js";
import { defaultStorage, normalizeMerchantId, PersistentStorage } from "../services/storage.js";

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function handleUpsertProduct(
  input: unknown,
  storage: PersistentStorage = defaultStorage,
  defaultMerchantId?: string
): Promise<ToolResult> {
  try {
    const rawInput = typeof input === "object" && input !== null ? input : {};
    const merchantId = normalizeMerchantId((rawInput as any).merchantId || defaultMerchantId);

    const parsed = upsertProductInputSchema.safeParse({
      ...rawInput,
      merchantId
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        success: false,
        error: `Validation failed on ${issue.path.join(".")}: ${issue.message}`
      };
    }

    const currentCatalogue = await storage.getProducts(merchantId);
    const product = upsertProduct(currentCatalogue, parsed.data);
    await storage.saveProduct(product, merchantId);

    return {
      success: true,
      data: {
        merchantId,
        product,
        message: `Product '${product.name}' (${product.productId}) saved successfully for merchant '${merchantId}'.`
      }
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Failed to upsert product."
    };
  }
}

export async function handleGetCatalogue(
  storage: PersistentStorage = defaultStorage,
  merchantIdInput?: string
): Promise<ToolResult> {
  try {
    const merchantId = normalizeMerchantId(merchantIdInput);
    const products = await storage.getProducts(merchantId);
    const activeProducts = products.filter((p) => p.status === "active");

    return {
      success: true,
      data: {
        merchantId,
        total: activeProducts.length,
        products: activeProducts
      }
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Failed to retrieve catalogue."
    };
  }
}
