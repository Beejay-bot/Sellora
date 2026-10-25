import http, { IncomingMessage, ServerResponse } from "node:http";
import { defaultStorage, PersistentStorage } from "./services/storage.js";
import { handleGetCatalogue, handleUpsertProduct } from "./tools/products.js";
import { handleGenerateStatusCaptions, handleManageCampaign, handleSaveCampaign } from "./tools/campaigns.js";
import { handleCreateOrder, handleGetOrder } from "./tools/orders.js";
import { handleInitializePayment, handleVerifyPayment } from "./tools/payments.js";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {
    // .env file is optional (e.g. cloud environment variables injected directly)
  }
}

const PORT = parseInt(process.env.PORT || "3000", 10);

// Helper to parse JSON request bodies
async function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        // 1MB safety limit
        reject(new Error("Request payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Malformed JSON payload"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key"
  });
  res.end(JSON.stringify(data, null, 2));
}

// Schemas compatible with Chord MCP (input_schema), standard MCP (inputSchema), and REST (parameters)
const upsertProductSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Product name (e.g. 'Bone Straight Wig')" },
    category: { type: "string", description: "Category (e.g. 'wigs', 'skincare', 'makeup')" },
    description: { type: "string", description: "Product description or benefit highlights" },
    variant: { type: "string", description: "Variant details like length or volume (e.g. '18-inch', '50ml')" },
    priceNgn: { type: "integer", description: "Price in Nigerian Naira (must be a positive integer)" },
    stockQuantity: { type: "integer", description: "Available inventory units (must be 0 or positive integer)" },
    existingProductId: { type: "string", description: "Optional existing product ID if updating" }
  },
  required: ["name", "priceNgn", "stockQuantity"]
};

const manageCampaignSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["get_catalogue", "generate_captions", "save_campaign"],
      description: "Action to perform: 'get_catalogue', 'generate_captions', or 'save_campaign'"
    },
    category: { type: "string", description: "Optional filter category for caption generation (e.g. 'wigs')" },
    productIds: {
      type: "array",
      items: { type: "string" },
      description: "List of product IDs referenced in the campaign"
    },
    theme: {
      type: "string",
      enum: ["daily_pick", "flash_sale", "new_arrival", "restock"],
      description: "Promotional theme"
    },
    generatedCaption: { type: "string", description: "The caption text selected by the vendor to save" },
    campaignDate: { type: "string", description: "Campaign date in YYYY-MM-DD format" }
  },
  required: ["action"]
};

const getCatalogueSchema = {
  type: "object",
  properties: {}
};

const createOrderSchema = {
  type: "object",
  properties: {
    customerName: { type: "string", description: "Customer's full name" },
    customerPhone: { type: "string", description: "Customer's WhatsApp contact phone number" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productId: { type: "string", description: "Product ID from catalogue" },
          quantity: { type: "integer", description: "Quantity ordered" }
        },
        required: ["productId", "quantity"]
      },
      description: "List of product items and quantities"
    }
  },
  required: ["customerName", "customerPhone", "lines"]
};

const initializePaymentSchema = {
  type: "object",
  properties: {
    orderId: { type: "string", description: "The order ID to generate a payment link for" },
    customerEmail: { type: "string", description: "Customer email for receipt & Paystack checkout" },
    callbackUrl: { type: "string", description: "Optional redirect callback URL after checkout" }
  },
  required: ["orderId", "customerEmail"]
};

const verifyPaymentSchema = {
  type: "object",
  properties: {
    reference: { type: "string", description: "Paystack transaction reference code" },
    orderId: { type: "string", description: "Optional order ID to verify against" }
  },
  required: ["reference"]
};

const checkoutSchema = {
  type: "object",
  properties: {
    customerName: { type: "string", description: "Customer's full name" },
    customerPhone: { type: "string", description: "Customer's WhatsApp contact phone number" },
    customerEmail: { type: "string", description: "Customer email for receipt & Paystack checkout link" },
    productId: { type: "string", description: "Product ID from catalogue (e.g. 'wigs-bone-straight-18-inch')" },
    quantity: { type: "integer", description: "Quantity ordered (defaults to 1)" }
  },
  required: ["customerName", "customerPhone", "customerEmail", "productId"]
};

// Tool Registry for Chord & MCP Tool Invocation
export const TOOL_DEFINITIONS = [
  {
    name: "checkout",
    description: "Complete order booking and Paystack payment link generation in one step.",
    input_schema: checkoutSchema,
    inputSchema: checkoutSchema,
    parameters: checkoutSchema
  },
  {
    name: "upsert_product",
    description: "Create a new product or update an existing beauty product in the persistent catalogue.",
    input_schema: upsertProductSchema,
    inputSchema: upsertProductSchema,
    parameters: upsertProductSchema
  },
  {
    name: "manage_campaign",
    description: "Manage WhatsApp Status marketing campaigns: retrieve active catalogue, generate promotional captions, or save a selected campaign.",
    input_schema: manageCampaignSchema,
    inputSchema: manageCampaignSchema,
    parameters: manageCampaignSchema
  },
  {
    name: "get_catalogue",
    description: "Retrieve all active products with prices, variants, and stock counts from the store.",
    input_schema: getCatalogueSchema,
    inputSchema: getCatalogueSchema,
    parameters: getCatalogueSchema
  },
  {
    name: "create_order",
    description: "Create a verified customer order. Prices and totals are looked up from the official catalogue.",
    input_schema: createOrderSchema,
    inputSchema: createOrderSchema,
    parameters: createOrderSchema
  },
  {
    name: "initialize_payment",
    description: "Create a Paystack checkout transaction link using the verified order total. Sets order payment status to pending.",
    input_schema: initializePaymentSchema,
    inputSchema: initializePaymentSchema,
    parameters: initializePaymentSchema
  },
  {
    name: "verify_payment",
    description: "Independently verify transaction payment status via Paystack. Marks order as paid ONLY upon verified provider confirmation.",
    input_schema: verifyPaymentSchema,
    inputSchema: verifyPaymentSchema,
    parameters: verifyPaymentSchema
  }
];

export async function handleCheckout(args: any, storage: PersistentStorage = defaultStorage) {
  try {
    const { customerName, customerPhone, customerEmail, productId, quantity = 1, lines } = args || {};

    if (!customerName || !customerPhone || !customerEmail) {
      return {
        success: false,
        error: "Missing required fields: customerName, customerPhone, and customerEmail are required."
      };
    }

    let orderLines = lines;
    if (!orderLines || !Array.isArray(orderLines) || orderLines.length === 0) {
      if (!productId) {
        return {
          success: false,
          error: "Missing productId. Please specify which product the customer wants to purchase."
        };
      }
      orderLines = [{ productId, quantity: Number(quantity) || 1 }];
    }

    const orderResult = await handleCreateOrder(
      {
        customerName,
        customerPhone,
        lines: orderLines
      },
      storage
    );

    if (!orderResult.success || !orderResult.data?.order) {
      return orderResult;
    }

    const order = orderResult.data.order;

    const paymentResult = await handleInitializePayment(
      {
        orderId: order.orderId,
        customerEmail
      },
      storage
    );

    if (!paymentResult.success || !paymentResult.data) {
      return {
        success: true,
        orderId: order.orderId,
        totalNgn: order.totalNgn,
        status: "pending_payment",
        message: `Order ${order.orderId} created, but payment initialization failed: ${paymentResult.error}`
      };
    }

    return {
      success: true,
      orderId: order.orderId,
      customerName: order.customerName,
      items: order.items,
      totalNgn: order.totalNgn,
      formattedTotal: `₦${order.totalNgn.toLocaleString()}`,
      status: "pending_payment",
      paymentUrl: paymentResult.data.authorizationUrl,
      reference: paymentResult.data.reference,
      message: `Order ${order.orderId} created for ${order.customerName}. Subtotal: ₦${order.totalNgn.toLocaleString()}. Paystack checkout link: ${paymentResult.data.authorizationUrl}`
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: (err as Error).message || "Checkout failed"
    };
  }
}

export async function executeTool(name: string, args: any, storage: PersistentStorage = defaultStorage) {
  switch (name) {
    case "checkout":
      return await handleCheckout(args, storage);
    case "upsert_product":
      return await handleUpsertProduct(args, storage);
    case "get_catalogue":
      return await handleGetCatalogue(storage);
    case "manage_campaign":
      return await handleManageCampaign(args, storage);
    case "generate_captions":
      return await handleGenerateStatusCaptions(args, storage);
    case "save_campaign":
      return await handleSaveCampaign(args, storage);
    case "create_order":
      return await handleCreateOrder(args, storage);
    case "get_order":
      return await handleGetOrder(args?.orderId, storage);
    case "initialize_payment":
      return await handleInitializePayment(args, storage);
    case "verify_payment":
      return await handleVerifyPayment(args, storage);
    default:
      return {
        success: false,
        error: `Unknown tool: '${name}'. Available tools: ${TOOL_DEFINITIONS.map((t) => t.name).join(", ")}`
      };
  }
}

export function createServer(storage: PersistentStorage = defaultStorage) {
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key"
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;

    const toolToken = process.env.CHORD_TOOL_TOKEN;
    if (toolToken) {
      const authHeader = req.headers.authorization;
      const apiKeyHeader = req.headers["x-api-key"];
      const isBearerValid = authHeader === `Bearer ${toolToken}`;
      const isKeyValid = apiKeyHeader === toolToken;

      if (!isBearerValid && !isKeyValid && pathname !== "/health" && pathname !== "/") {
        sendJson(res, 401, {
          error: "Unauthorized",
          message: "Invalid or missing authentication token. Provide 'Authorization: Bearer <token>' or 'X-API-Key: <token>' header."
        });
        return;
      }
    }

    try {
      if ((req.method === "GET" || req.method === "POST") && (pathname === "/" || pathname === "/health")) {
        const products = await storage.getProducts();
        sendJson(res, 200, {
          status: "ok",
          latency_ms: 1,
          service: "Sellora Tool Server",
          version: "0.1.0",
          catalogueCount: products.length,
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (pathname === "/tools") {
        if (req.method === "POST") {
          sendJson(res, 200, TOOL_DEFINITIONS);
          return;
        }

        sendJson(res, 200, {
          tools: TOOL_DEFINITIONS,
          count: TOOL_DEFINITIONS.length
        });
        return;
      }

      if (req.method === "POST" && (pathname === "/mcp" || pathname === "/rpc")) {
        const body = await parseJsonBody(req);
        const { jsonrpc = "2.0", id = 1, method, params = {} } = body;
        if (method === "initialize") {
          sendJson(res, 200, {
            jsonrpc,
            id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: { listChanged: false }
              },
              serverInfo: {
                name: "sellora",
                version: "0.1.0"
              }
            }
          });
          return;
        }

        if (method === "notifications/initialized" || method === "initialized") {
          sendJson(res, 200, { jsonrpc, result: {} });
          return;
        }
        if (method === "ping") {
          sendJson(res, 200, { jsonrpc, id, result: {} });
          return;
        }

        if (method === "tools/list") {
          sendJson(res, 200, {
            jsonrpc,
            id,
            result: { tools: TOOL_DEFINITIONS }
          });
          return;
        }

        if (method === "tools/call") {
          const { name, arguments: toolArgs } = params;
          const result = await executeTool(name, toolArgs, storage);
          sendJson(res, 200, {
            jsonrpc,
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2)
                }
              ],
              isError: !result.success
            }
          });
          return;
        }

        sendJson(res, 400, {
          jsonrpc,
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        });
        return;
      }

      if (pathname.startsWith("/tools/")) {
        const toolName = pathname.replace("/tools/", "");

        if (req.method === "GET") {
          const tool = TOOL_DEFINITIONS.find((t) => t.name === toolName);
          if (tool) {
            sendJson(res, 200, {
              status: "ok",
              tool: tool.name,
              description: tool.description,
              schema: tool.input_schema,
              sampleBody: tool.name === "checkout" ? {
                customerName: "Chioma Obi",
                customerPhone: "08012345678",
                customerEmail: "chioma@example.com",
                productId: "wigs-bone-straight-18-inch",
                quantity: 1
              } : undefined
            });
            return;
          }
        }

        if (req.method === "POST") {
          const body = await parseJsonBody(req);
          const result = await executeTool(toolName, body, storage);
          sendJson(res, result.success ? 200 : 400, result);
          return;
        }
      }

      if (req.method === "GET" && (pathname === "/mcp" || pathname === "/rpc")) {
        sendJson(res, 200, {
          status: "ok",
          protocol: "Model Context Protocol (JSON-RPC 2.0)",
          message: "This endpoint handles JSON-RPC 2.0 POST requests for MCP clients. For REST API tools, use POST /tools/checkout or GET /catalogue.",
          availableTools: TOOL_DEFINITIONS.map((t) => t.name)
        });
        return;
      }

      if (req.method === "GET" && pathname === "/catalogue") {
        const result = await handleGetCatalogue(storage);
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { error: `Endpoint not found: ${req.method} ${pathname}` });
    } catch (err: unknown) {
      console.error(`Error processing ${req.method} ${pathname}:`, err);
      sendJson(res, 500, {
        error: "Internal server error",
        message: (err as Error).message
      });
    }
  });
}

// Start server if executed directly
if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`Sellora Server running on http://localhost:${PORT}`);
    console.log(`Tool Discovery: http://localhost:${PORT}/tools`);
    console.log(`MCP JSON-RPC: http://localhost:${PORT}/mcp`);
  });
}
