import { upsertProductInputSchema, type Product, type UpsertProductInput } from "../schemas/product.js";

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildProductId(input: UpsertProductInput): string {
  const parts = [input.category, input.name, input.variant].filter(Boolean);
  return slugify(parts.join("-"));
}

export function upsertProduct(catalogue: Product[], rawInput: UpsertProductInput, now = new Date()): Product {
  const input = upsertProductInputSchema.parse(rawInput);
  const productId = input.existingProductId ?? buildProductId(input);
  const existing = catalogue.find((product) => product.productId === productId);
  const timestamp = now.toISOString();

  const nextProduct: Product = {
    productId,
    name: input.name,
    category: input.category,
    description: input.description,
    variant: input.variant,
    priceNgn: input.priceNgn,
    stockQuantity: input.stockQuantity,
    status: existing?.status ?? "active",
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  return nextProduct;
}

export function replaceProduct(catalogue: Product[], nextProduct: Product): Product[] {
  const existingIndex = catalogue.findIndex((product) => product.productId === nextProduct.productId);

  if (existingIndex === -1) {
    return [...catalogue, nextProduct];
  }

  return catalogue.map((product) =>
    product.productId === nextProduct.productId ? nextProduct : product
  );
}
