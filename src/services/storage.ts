import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Campaign } from "../schemas/campaign.js";
import type { Order } from "../schemas/order.js";
import type { Product } from "../schemas/product.js";
import { normalizeMerchantId } from "../lib/utils.js";

export { normalizeMerchantId };

export interface DatabaseState {
  products: Product[];
  campaigns: Campaign[];
  orders: Order[];
}

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
  }

  private initSchema(): void {
    // Migration for existing single-tenant products table
    const productSql = (this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'").get() as any)?.sql || "";
    if (productSql && !productSql.includes("merchant_id")) {
      this.db.exec(`
        CREATE TABLE products_new (
          product_id TEXT NOT NULL,
          merchant_id TEXT NOT NULL DEFAULT 'default',
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT,
          variant TEXT,
          price_ngn INTEGER NOT NULL,
          stock_quantity INTEGER NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (merchant_id, product_id)
        );
        INSERT INTO products_new (product_id, merchant_id, name, category, description, variant, price_ngn, stock_quantity, status, created_at, updated_at)
          SELECT product_id, 'default', name, category, description, variant, price_ngn, stock_quantity, status, created_at, updated_at FROM products;
        DROP TABLE products;
        ALTER TABLE products_new RENAME TO products;
      `);
    } else {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS products (
          product_id TEXT NOT NULL,
          merchant_id TEXT NOT NULL DEFAULT 'default',
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT,
          variant TEXT,
          price_ngn INTEGER NOT NULL,
          stock_quantity INTEGER NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (merchant_id, product_id)
        );
      `);
    }

    const campaignSql = (this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='campaigns'").get() as any)?.sql || "";
    if (campaignSql && !campaignSql.includes("merchant_id")) {
      this.db.exec("ALTER TABLE campaigns ADD COLUMN merchant_id TEXT NOT NULL DEFAULT 'default';");
    } else {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS campaigns (
          campaign_id TEXT PRIMARY KEY,
          merchant_id TEXT NOT NULL DEFAULT 'default',
          campaign_date TEXT NOT NULL,
          product_ids TEXT NOT NULL,
          generated_caption TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
    }

    const orderSql = (this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get() as any)?.sql || "";
    if (orderSql && !orderSql.includes("merchant_id")) {
      this.db.exec("ALTER TABLE orders ADD COLUMN merchant_id TEXT NOT NULL DEFAULT 'default';");
    } else {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          order_id TEXT PRIMARY KEY,
          merchant_id TEXT NOT NULL DEFAULT 'default',
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

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_id);
      CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);
      CREATE INDEX IF NOT EXISTS idx_campaigns_merchant ON campaigns(merchant_id);
    `);
  }

  private mapProduct(row: any): Product {
    return {
      productId: row.product_id,
      merchantId: row.merchant_id || "default",
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
      merchantId: row.merchant_id || "default",
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
      merchantId: row.merchant_id || "default",
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

  private saveProductSync(product: Product, merchantId?: string): Product {
    const mId = normalizeMerchantId(merchantId || product.merchantId);
    const stmt = this.db.prepare(`
      INSERT INTO products (
        product_id, merchant_id, name, category, description, variant,
        price_ngn, stock_quantity, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(merchant_id, product_id) DO UPDATE SET
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
      mId,
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

    return { ...product, merchantId: mId };
  }

  private saveCampaignSync(campaign: Campaign, merchantId?: string): Campaign {
    const mId = normalizeMerchantId(merchantId || campaign.merchantId);
    const stmt = this.db.prepare(`
      INSERT INTO campaigns (
        campaign_id, merchant_id, campaign_date, product_ids, generated_caption, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(campaign_id) DO UPDATE SET
        merchant_id = excluded.merchant_id,
        campaign_date = excluded.campaign_date,
        product_ids = excluded.product_ids,
        generated_caption = excluded.generated_caption,
        status = excluded.status
    `);

    stmt.run(
      campaign.campaignId,
      mId,
      campaign.campaignDate,
      JSON.stringify(campaign.productIds),
      campaign.generatedCaption,
      campaign.status,
      campaign.createdAt
    );

    return { ...campaign, merchantId: mId };
  }

  private saveOrderSync(order: Order, merchantId?: string): Order {
    const mId = normalizeMerchantId(merchantId || order.merchantId);
    const stmt = this.db.prepare(`
      INSERT INTO orders (
        order_id, merchant_id, customer_name, customer_phone, items,
        subtotal_ngn, total_ngn, payment_status, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(order_id) DO UPDATE SET
        merchant_id = excluded.merchant_id,
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
      mId,
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

    return { ...order, merchantId: mId };
  }

  async getProducts(merchantId: string = "default"): Promise<Product[]> {
    const mId = normalizeMerchantId(merchantId);
    const rows = this.db.prepare("SELECT * FROM products WHERE merchant_id = ? ORDER BY rowid ASC").all(mId);
    return rows.map((r) => this.mapProduct(r));
  }

  async getProductById(productId: string, merchantId: string = "default"): Promise<Product | undefined> {
    const mId = normalizeMerchantId(merchantId);
    const row = this.db.prepare("SELECT * FROM products WHERE merchant_id = ? AND product_id = ?").get(mId, productId);
    return row ? this.mapProduct(row) : undefined;
  }

  async saveProduct(product: Product, merchantId?: string): Promise<Product> {
    return this.saveProductSync(product, merchantId);
  }

  async getCampaigns(merchantId: string = "default"): Promise<Campaign[]> {
    const mId = normalizeMerchantId(merchantId);
    const rows = this.db.prepare("SELECT * FROM campaigns WHERE merchant_id = ? ORDER BY rowid ASC").all(mId);
    return rows.map((r) => this.mapCampaign(r));
  }

  async saveCampaign(campaign: Campaign, merchantId?: string): Promise<Campaign> {
    return this.saveCampaignSync(campaign, merchantId);
  }

  async getOrders(merchantId: string = "default"): Promise<Order[]> {
    const mId = normalizeMerchantId(merchantId);
    const rows = this.db.prepare("SELECT * FROM orders WHERE merchant_id = ? ORDER BY rowid ASC").all(mId);
    return rows.map((r) => this.mapOrder(r));
  }

  async getOrderById(orderId: string, merchantId?: string): Promise<Order | undefined> {
    if (merchantId) {
      const mId = normalizeMerchantId(merchantId);
      const row = this.db.prepare("SELECT * FROM orders WHERE order_id = ? AND merchant_id = ?").get(orderId, mId);
      return row ? this.mapOrder(row) : undefined;
    }
    const row = this.db.prepare("SELECT * FROM orders WHERE order_id = ?").get(orderId);
    return row ? this.mapOrder(row) : undefined;
  }

  async saveOrder(order: Order, merchantId?: string): Promise<Order> {
    return this.saveOrderSync(order, merchantId);
  }

  async reset(state?: Partial<DatabaseState>): Promise<void> {
    this.db.exec("DELETE FROM products; DELETE FROM campaigns; DELETE FROM orders;");

    if (state?.products && state.products.length > 0) {
      for (const p of state.products) {
        this.saveProductSync(p, p.merchantId || "default");
      }
    }

    if (state?.campaigns) {
      for (const c of state.campaigns) {
        this.saveCampaignSync(c, c.merchantId || "default");
      }
    }

    if (state?.orders) {
      for (const o of state.orders) {
        this.saveOrderSync(o, o.merchantId || "default");
      }
    }
  }

  close(): void {
    this.db.close();
  }
}

export const defaultStorage = new PersistentStorage();
