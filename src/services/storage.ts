import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Campaign } from "../schemas/campaign.js";
import type { Order } from "../schemas/order.js";
import type { Product } from "../schemas/product.js";

export interface DatabaseState {
  products: Product[];
  campaigns: Campaign[];
  orders: Order[];
}

export const defaultSeedProducts: Product[] = [
  {
    productId: "wigs-bone-straight-18-inch",
    name: "Bone Straight Wig",
    category: "wigs",
    description: "100% human hair, double drawn, silky smooth bone straight wig with HD lace.",
    variant: "18-inch",
    priceNgn: 85000,
    stockQuantity: 3,
    status: "active",
    createdAt: "2026-10-19T10:00:00.000Z",
    updatedAt: "2026-10-19T10:00:00.000Z"
  },
  {
    productId: "wigs-body-wave-22-inch",
    name: "Body Wave Wig",
    category: "wigs",
    description: "Bouncy, soft body wave texture, holds curls effortlessly, pre-plucked hairline.",
    variant: "22-inch",
    priceNgn: 95000,
    stockQuantity: 2,
    status: "active",
    createdAt: "2026-10-19T10:00:00.000Z",
    updatedAt: "2026-10-19T10:00:00.000Z"
  },
  {
    productId: "skincare-radiance-glow-oil-50ml",
    name: "Radiance Glow Face Oil",
    category: "skincare",
    description: "Lightweight, non-comedogenic botanical oil for hydration and radiant complexion.",
    variant: "50ml",
    priceNgn: 18500,
    stockQuantity: 10,
    status: "active",
    createdAt: "2026-10-19T10:00:00.000Z",
    updatedAt: "2026-10-19T10:00:00.000Z"
  }
];

export class PersistentStorage {
  private db: DatabaseSync;
  private dbPath: string;
  private isMemoryOnly: boolean;

  constructor(filePath?: string, isMemoryOnly = false) {
    const resolvedPath =
      filePath ??
      process.env.DATA_STORE_PATH ??
      (process.env.NODE_ENV === "test" ? ":memory:" : "./data/sellora.db");

    this.isMemoryOnly = isMemoryOnly || resolvedPath === ":memory:";
    if (this.isMemoryOnly) {
      this.dbPath = ":memory:";
      this.db = new DatabaseSync(":memory:");
      this.db.exec("PRAGMA busy_timeout = 5000;");
    } else {
      this.dbPath = path.resolve(resolvedPath);
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec("PRAGMA busy_timeout = 5000;");
      this.db.exec("PRAGMA journal_mode = WAL;");
    }

    this.initSchema();
    this.ensureSeedData();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        product_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        variant TEXT,
        price_ngn INTEGER NOT NULL,
        stock_quantity INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS campaigns (
        campaign_id TEXT PRIMARY KEY,
        campaign_date TEXT NOT NULL,
        product_ids TEXT NOT NULL,
        generated_caption TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        items TEXT NOT NULL,
        subtotal_ngn INTEGER NOT NULL,
        total_ngn INTEGER NOT NULL,
        payment_status TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private ensureSeedData(): void {
    const row = this.db.prepare("SELECT count(*) as count FROM products").get() as { count: number };
    if (row.count > 0) {
      return;
    }

    // Check if legacy JSON file exists to migrate products
    const jsonPath = path.resolve("./data/sellora.json");
    if (!this.isMemoryOnly && fs.existsSync(jsonPath)) {
      try {
        const content = fs.readFileSync(jsonPath, "utf-8");
        const parsed = JSON.parse(content) as DatabaseState;
        if (parsed.products && Array.isArray(parsed.products) && parsed.products.length > 0) {
          for (const p of parsed.products) {
            this.saveProductSync(p);
          }
          if (parsed.campaigns && Array.isArray(parsed.campaigns)) {
            for (const c of parsed.campaigns) {
              this.saveCampaignSync(c);
            }
          }
          if (parsed.orders && Array.isArray(parsed.orders)) {
            for (const o of parsed.orders) {
              this.saveOrderSync(o);
            }
          }
          return;
        }
      } catch (err) {
        console.warn("Could not migrate from data/sellora.json:", err);
      }
    }

    // Otherwise, seed default initial products
    for (const product of defaultSeedProducts) {
      this.saveProductSync(product);
    }
  }

  private mapProduct(row: any): Product {
    return {
      productId: row.product_id,
      name: row.name,
      category: row.category,
      description: row.description || undefined,
      variant: row.variant || undefined,
      priceNgn: Number(row.price_ngn),
      stockQuantity: Number(row.stock_quantity),
      status: row.status as "active" | "archived",
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapCampaign(row: any): Campaign {
    return {
      campaignId: row.campaign_id,
      campaignDate: row.campaign_date,
      productIds: JSON.parse(row.product_ids),
      generatedCaption: row.generated_caption,
      status: row.status as "draft" | "saved" | "posted",
      createdAt: row.created_at
    };
  }

  private mapOrder(row: any): Order {
    return {
      orderId: row.order_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      items: JSON.parse(row.items),
      subtotalNgn: Number(row.subtotal_ngn),
      totalNgn: Number(row.total_ngn),
      paymentStatus: row.payment_status as "not_started" | "pending" | "verified" | "unverified",
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private saveProductSync(product: Product): Product {
    const stmt = this.db.prepare(`
      INSERT INTO products (
        product_id, name, category, description, variant,
        price_ngn, stock_quantity, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(product_id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        description = excluded.description,
        variant = excluded.variant,
        price_ngn = excluded.price_ngn,
        stock_quantity = excluded.stock_quantity,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      product.productId,
      product.name,
      product.category,
      product.description ?? null,
      product.variant ?? null,
      product.priceNgn,
      product.stockQuantity,
      product.status,
      product.createdAt,
      product.updatedAt
    );

    return product;
  }

  private saveCampaignSync(campaign: Campaign): Campaign {
    const stmt = this.db.prepare(`
      INSERT INTO campaigns (
        campaign_id, campaign_date, product_ids, generated_caption, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET
        campaign_date = excluded.campaign_date,
        product_ids = excluded.product_ids,
        generated_caption = excluded.generated_caption,
        status = excluded.status
    `);

    stmt.run(
      campaign.campaignId,
      campaign.campaignDate,
      JSON.stringify(campaign.productIds),
      campaign.generatedCaption,
      campaign.status,
      campaign.createdAt
    );

    return campaign;
  }

  private saveOrderSync(order: Order): Order {
    const stmt = this.db.prepare(`
      INSERT INTO orders (
        order_id, customer_name, customer_phone, items,
        subtotal_ngn, total_ngn, payment_status, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        customer_name = excluded.customer_name,
        customer_phone = excluded.customer_phone,
        items = excluded.items,
        subtotal_ngn = excluded.subtotal_ngn,
        total_ngn = excluded.total_ngn,
        payment_status = excluded.payment_status,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      order.orderId,
      order.customerName,
      order.customerPhone,
      JSON.stringify(order.items),
      order.subtotalNgn,
      order.totalNgn,
      order.paymentStatus,
      order.status,
      order.createdAt,
      order.updatedAt
    );

    return order;
  }

  async getProducts(): Promise<Product[]> {
    const rows = this.db.prepare("SELECT * FROM products ORDER BY rowid ASC").all();
    return rows.map((r) => this.mapProduct(r));
  }

  async getProductById(productId: string): Promise<Product | undefined> {
    const row = this.db.prepare("SELECT * FROM products WHERE product_id = ?").get(productId);
    return row ? this.mapProduct(row) : undefined;
  }

  async saveProduct(product: Product): Promise<Product> {
    return this.saveProductSync(product);
  }

  async getCampaigns(): Promise<Campaign[]> {
    const rows = this.db.prepare("SELECT * FROM campaigns ORDER BY rowid ASC").all();
    return rows.map((r) => this.mapCampaign(r));
  }

  async saveCampaign(campaign: Campaign): Promise<Campaign> {
    return this.saveCampaignSync(campaign);
  }

  async getOrders(): Promise<Order[]> {
    const rows = this.db.prepare("SELECT * FROM orders ORDER BY rowid ASC").all();
    return rows.map((r) => this.mapOrder(r));
  }

  async getOrderById(orderId: string): Promise<Order | undefined> {
    const row = this.db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);
    return row ? this.mapOrder(row) : undefined;
  }

  async saveOrder(order: Order): Promise<Order> {
    return this.saveOrderSync(order);
  }

  async reset(state?: Partial<DatabaseState>): Promise<void> {
    this.db.exec("DELETE FROM products; DELETE FROM campaigns; DELETE FROM orders;");

    if (state?.products && state.products.length > 0) {
      for (const p of state.products) {
        this.saveProductSync(p);
      }
    } else {
      for (const p of defaultSeedProducts) {
        this.saveProductSync(p);
      }
    }

    if (state?.campaigns) {
      for (const c of state.campaigns) {
        this.saveCampaignSync(c);
      }
    }

    if (state?.orders) {
      for (const o of state.orders) {
        this.saveOrderSync(o);
      }
    }
  }

  close(): void {
    this.db.close();
  }
}

export const defaultStorage = new PersistentStorage();
