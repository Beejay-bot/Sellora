import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { PersistentStorage } from "../src/services/storage.js";
import type { Product } from "../src/schemas/product.js";

describe("PersistentStorage (SQLite)", () => {
  const testDir = path.resolve("./data/test");
  const testFile = path.join(testDir, "test_sellora.db");

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    try {
      await fs.unlink(testFile);
    } catch {
      // file might not exist yet
    }
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("initializes with seed data when SQLite DB file does not exist", async () => {
    const storage = new PersistentStorage(testFile);
    const products = await storage.getProducts();

    expect(products.length).toBeGreaterThanOrEqual(3);
    expect(products[0].productId).toBe("wigs-bone-straight-18-inch");

    // Verify DB file was created and written to disk
    const stat = await fs.stat(testFile);
    expect(stat.size).toBeGreaterThan(0);

    storage.close();
  });

  it("persists added product across storage instances in SQLite", async () => {
    const storage1 = new PersistentStorage(testFile);
    const newProd: Product = {
      productId: "lip-gloss-rose-pink",
      name: "Rose Pink Lip Gloss",
      category: "makeup",
      priceNgn: 4500,
      stockQuantity: 15,
      status: "active",
      createdAt: "2026-10-20T10:00:00.000Z",
      updatedAt: "2026-10-20T10:00:00.000Z"
    };

    await storage1.saveProduct(newProd);
    storage1.close();

    // Re-instantiate storage instance on same file (simulating process restart)
    const storage2 = new PersistentStorage(testFile);
    const fetched = await storage2.getProductById("lip-gloss-rose-pink");

    expect(fetched).toBeDefined();
    expect(fetched?.name).toBe("Rose Pink Lip Gloss");
    expect(fetched?.priceNgn).toBe(4500);

    storage2.close();
  });
});
