import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { createServer } from "../src/server.js";
import { PersistentStorage } from "../src/services/storage.js";

describe("Sellora HTTP & MCP Server", () => {
  let server: http.Server;
  let baseUrl: string;

  const originalEnvToken = process.env.CHORD_TOOL_TOKEN;

  beforeAll(async () => {
    delete process.env.CHORD_TOOL_TOKEN;
    const testStorage = new PersistentStorage("", true);
    await testStorage.saveProduct({
      productId: "wigs-bone-straight-18-inch",
      name: "Bone Straight Wig",
      category: "wigs",
      priceNgn: 85000,
      stockQuantity: 5,
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    server = createServer(testStorage);
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (originalEnvToken !== undefined) {
      process.env.CHORD_TOOL_TOKEN = originalEnvToken;
    } else {
      delete process.env.CHORD_TOOL_TOKEN;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("GET and POST /health return ok status for Chord probes", async () => {
    const getRes = await fetch(`${baseUrl}/health`);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.status).toBe("ok");
    expect(getBody.service).toContain("Sellora");

    const postRes = await fetch(`${baseUrl}/health`, { method: "POST" });
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as any;
    expect(postBody.status).toBe("ok");
  });

  it("GET /tools returns all registered tool definitions with input_schema", async () => {
    const res = await fetch(`${baseUrl}/tools`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.tools).toBeInstanceOf(Array);
    const names = body.tools.map((t: any) => t.name);
    expect(names).toContain("upsert_product");
    expect(names).toContain("manage_campaign");
    expect(names).toContain("create_order");
    expect(names).toContain("initialize_payment");
    expect(names).toContain("verify_payment");

    // Verify Chord-compatible input_schema field exists
    expect(body.tools[0]).toHaveProperty("input_schema");
  });

  it("POST /tools returns bare array of tools for Chord MCP discovery probe", async () => {
    const res = await fetch(`${baseUrl}/tools`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty("input_schema");
  });

  it("POST /tools/upsert_product successfully adds a product via REST", async () => {
    const res = await fetch(`${baseUrl}/tools/upsert_product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Lace Tint Spray",
        category: "wigs",
        variant: "Medium Brown",
        priceNgn: 6500,
        stockQuantity: 8
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.product.productId).toBe("wigs-lace-tint-spray-medium-brown");
  });

  it("POST /mcp handles initialize handshake and ping", async () => {
    const initRes = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "Chord", version: "1.0.0" }
        }
      })
    });
    const initBody = (await initRes.json()) as any;
    expect(initBody.result.protocolVersion).toBe("2024-11-05");
    expect(initBody.result.serverInfo.name).toBe("sellora");

    const pingRes = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })
    });
    const pingBody = (await pingRes.json()) as any;
    expect(pingBody.result).toBeDefined();
  });

  it("POST /mcp handles tools/list and tools/call JSON-RPC", async () => {
    // 1. tools/list
    const listRes = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list"
      })
    });
    const listBody = (await listRes.json()) as any;
    expect(listBody.result.tools.length).toBeGreaterThan(0);

    // 2. tools/call get_catalogue
    const callRes = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "get_catalogue",
          arguments: {}
        }
      })
    });
    const callBody = (await callRes.json()) as any;
    expect(callBody.result.isError).toBe(false);
    expect(callBody.result.content[0].text).toContain("products");
  });

  it("POST /tools/checkout creates an order and initializes a Paystack payment link", async () => {
    const res = await fetch(`${baseUrl}/tools/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: "Amina Bello",
        customerPhone: "08033221100",
        customerEmail: "amina@example.com",
        productId: "wigs-bone-straight-18-inch",
        quantity: 1
      })
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.orderId).toMatch(/^ord_/);
    expect(body.paymentUrl).toContain("paystack.com");
    expect(body.formattedTotal).toBe("₦85,000");
  });

  describe("Authentication Gate (CHORD_TOOL_TOKEN)", () => {
    const testSecret = "test_chord_secret_token_123";

    it("rejects unauthorized tool requests with 401 when CHORD_TOOL_TOKEN is configured", async () => {
      const prev = process.env.CHORD_TOOL_TOKEN;
      process.env.CHORD_TOOL_TOKEN = testSecret;

      try {
        const unauthRes = await fetch(`${baseUrl}/tools`);
        expect(unauthRes.status).toBe(401);
        const errBody = (await unauthRes.json()) as any;
        expect(errBody.error).toBe("Unauthorized");

        // Health check remains public
        const healthRes = await fetch(`${baseUrl}/health`);
        expect(healthRes.status).toBe(200);

        // Bearer token authentication succeeds
        const bearerRes = await fetch(`${baseUrl}/tools`, {
          headers: { Authorization: `Bearer ${testSecret}` }
        });
        expect(bearerRes.status).toBe(200);

        // X-API-Key header authentication succeeds
        const apiKeyRes = await fetch(`${baseUrl}/tools`, {
          headers: { "x-api-key": testSecret }
        });
        expect(apiKeyRes.status).toBe(200);
      } finally {
        process.env.CHORD_TOOL_TOKEN = prev;
      }
    });
  });
});


