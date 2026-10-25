export function normalizeMerchantId(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "default";
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "default";
}
