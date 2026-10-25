# Sellora

A WhatsApp sales AI copilot for independent hair and beauty vendors in Nigeria.

Sellora runs as a private business copilot for beauty merchants (selling human hair wigs, frontals, skincare, and cosmetics) directly on WhatsApp. It drafts morning WhatsApp Status copy based on live stock, manages inventory on the fly, and creates verified Paystack checkout links to forward to buyers.

---

## 1. Role Preference & Problem Statement

### Role Preference
**Forward-deployed Engineering** / **Technical Product Management**

### Problem Statement
Independent Nigerian beauty vendors sell almost entirely through WhatsApp, running high-ticket inventory businesses directly from their phones. Sellora is their private business copilot: it drafts morning WhatsApp Status copy based on live stock, tracks wig inventory on the fly, and creates verified Paystack checkout links to forward to buyers. These sellers lose 3 to 5 hours every day manually answering repetitive price inquiries, writing Status captions from scratch, and dealing with fake bank alert transfer fraud. To keep the 6-hour build reliable and practical, I deliberately left out automated Status posting (Meta doesn't allow third-party tools to post directly to personal WhatsApp Status), multi-vendor store tenancy, automated dispatch rider bookings, and live money movement.

---

## 2. Architecture

Sellora connects a **Chord AI Teammate** via Model Context Protocol (MCP) or REST tool endpoints to a Node.js backend:

```
WhatsApp Simulator / Chat
          │
          ▼
   Chord AI Teammate (skills/SKILL.md)
          │
          ▼  [MCP JSON-RPC / REST Tools + Token Auth]
Sellora Integration Server (src/server.ts)
    ├── SQLite Relational DB (src/services/storage.ts)
    │     └── data/sellora.db (Products, Campaigns, Orders)
    └── Paystack Service (src/services/paystack.ts)
          └── Paystack Gateway (NGN Kobo calculation & verification)
```

### Core Components
- **`skills/SKILL.md`**: Chord prompt with merchant copilot persona, Nigerian beauty market context, Status copywriting rules, and payment safety guardrails.
- **`src/schemas/`**: Zod validation schemas for products, campaigns, orders, and payment requests.
- **`src/domain/`**: Business logic for Naira-to-Kobo conversions, stock reservations, pricing snapshots, and Status copy generation.
- **`src/services/storage.ts`**: Zero-dependency SQLite database powered by Node's native `node:sqlite` (`DatabaseSync`) with Write-Ahead Logging (WAL) and auto-seeding.
- **`src/services/paystack.ts`**: Paystack checkout initialization and transaction verification.
- **`src/server.ts`**: HTTP tool server supporting both MCP JSON-RPC 2.0 (`POST /mcp`) and REST endpoints (`POST /tools/:name`), protected by token authentication (`CHORD_TOOL_TOKEN`).

---

## 3. Tool Reference

| Tool | Parameters | Description |
|---|---|---|
| `checkout` | `customerName`, `customerPhone`, `customerEmail`, `productId`, `quantity?` | 1-step order booking: reserves stock, calculates trusted total from catalogue, and returns a Paystack link formatted to forward to the buyer. |
| `upsert_product` | `name`, `category`, `priceNgn`, `stockQuantity`, `variant?`, `description?`, `existingProductId?` | Adds new inventory or updates existing products with price and stock validation. |
| `manage_campaign` | `action` (`"get_catalogue"` \| `"generate_captions"` \| `"save_campaign"`), `category?`, `productIds?`, `theme?`, `generatedCaption?` | Retrieves in-stock products, generates 3 styled WhatsApp Status captions with Pidgin banter, or saves a selected campaign. |
| `get_catalogue` | None | Returns active in-stock and out-of-stock items. |
| `create_order` | `customerName`, `customerPhone`, `lines: [{ productId, quantity }]` | Validates stock availability, snapshots catalogue prices, and reserves inventory. |
| `initialize_payment` | `orderId`, `customerEmail`, `callbackUrl?` | Generates a Paystack checkout URL from database order total and sets status to `pending_payment`. |
| `verify_payment` | `reference`, `orderId?` | Queries Paystack API. Marks order `paid` only when Paystack verifies the transaction; rejects unverified claims. |

---

## 4. Quickstart & Local Setup

### Prerequisites
- Node.js (v22.5.0+ required for native `node:sqlite`)
- npm (v9+)

### Installation
```bash
git clone https://github.com/your-username/sellora.git
cd sellora
npm install
```

### Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Key environment variables:
```ini
SELLORA_VENDOR_NAME="Sellora Beauty"
CHORD_TOOL_TOKEN="your_shared_secret_token"
PAYSTACK_SECRET_KEY="sk_test_..."
PAYSTACK_PUBLIC_KEY="pk_test_..."
PAYSTACK_BASE_URL="https://api.paystack.co"
DATA_STORE_PATH="./data/sellora.db"
PORT=3000
```
*(If `PAYSTACK_SECRET_KEY` is omitted or left as a test placeholder, the server runs in deterministic sandbox mode).*

### Running the Server
```bash
# Build TypeScript
npm run build

# Start server
npm start
```

The server starts on `http://localhost:3000`:
- **Health Check**: `GET /health`
- **Tool Discovery**: `GET /tools` (REST) and `POST /tools` (Chord probe)
- **MCP Endpoint**: `POST /mcp`
- **REST Endpoints**: `POST /tools/:toolName`

Authentication: All tool calls require `Authorization: Bearer <token>` or `X-API-Key: <token>` matching `CHORD_TOOL_TOKEN`.

---

## 5. Automated Tests

Sellora includes 35 automated tests covering multi-tenant merchant isolation, schemas, business domain logic, SQLite transactions, tool endpoints, and Paystack integration:

```bash
# Run tests
npm test

# Type check
npm run check
```

---

## 6. Walkthrough Sequence (WhatsApp Simulator)

1. **Restock / Add Product**:
   - Input: *"Add a 16-inch bone straight wig for ₦75,000, 2 units in stock."*
   - Agent calls `upsert_product` and confirms new inventory.
2. **Generate Status Copy**:
   - Input: *"Prepare today's Status captions for my wigs."*
   - Agent calls `manage_campaign` and returns 3 caption options (Baddie Vibe 💅, Pressure Ti Wa 🔥, Soft Life ✨) with live prices.
   - Input: *"Save caption 1 for today."*
   - Agent calls `manage_campaign` (`save_campaign`) and confirms it's ready to copy-paste.
3. **Book Order & Generate Checkout Link**:
   - Input: *"Chioma Obi (08012345678, chioma@example.com) wants 1 of the 18-inch bone straight wig. Book her order and give me a Paystack link to send her."*
   - Agent calls `checkout`, reserves the wig, and returns a ready-to-forward message with a Paystack link.
4. **Fraud Prevention**:
   - Input: *"Customer says she transferred the money and sent a screenshot. Confirm the order."*
   - Agent refuses to mark order paid without Paystack verification (`verify_payment`).

