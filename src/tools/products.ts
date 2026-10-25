import { upsertProduct } from "../domain/products.js";
import { upsertProductInputSchema, type UpsertProductInput } from "../schemas/product.js";
import { defaultStorage, PersistentStorage } from "../services/storage.js";

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function handleUpsertProduct(
  input: unknown,
  storage: PersistentStorage = defaultStorage
): Promise<ToolResult> {
  try {
    const parsed = upsertProductInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        success: false,
        error: `Validation failed on ${issue.path.join(".")}: ${issue.message}`
      };
    }

    const currentCatalogue = await storage.getProducts();
    const product = upsertProduct(currentCatalogue, parsed.data);
    await storage.saveProduct(product);

    return {
      success: true,
      data: {
        product,
        message: `Product '${product.name}' (${product.productId}) saved successfully.`
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
  storage: PersistentStorage = defaultStorage
): Promise<ToolResult> {
  try {
    const products = await storage.getProducts();
    const activeProducts = products.filter((p) => p.status === "active");

    return {
      success: true,
      data: {
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
