# Sellora: Deployment Field Notes

These are honest notes from building and deploying Sellora on Chord and WhatsApp, covering the actual problems I ran into, why they happened, how I fixed them, and practical feedback for the Chord team.

---

## 1. Chord's tool inspector was ignoring my input fields (`input_schema` vs `inputSchema`)

### What happened
When I added my API tool to Chord, the connection succeeded with a `200 OK`, but none of my input parameters showed up in Chord's tool inspector. The arguments were just showing up as empty objects.

### Why it happened
Different tool and API specs use different names for the same thing:
* The Anthropic MCP standard uses `inputSchema` (camelCase).
* Standard OpenAPI / REST tools use `parameters`.
* Chord's MCP discovery probe explicitly looks for `input_schema` (snake_case).

Because my tool server originally returned `parameters`, Chord picked up the tool name and description, but completely dropped the parameter schema.

### How I fixed it
Instead of guessing which client expects which casing, I updated the tool registry in `src/server.ts` to export all three keys simultaneously on every tool definition:
```typescript
export const TOOL_DEFINITIONS = [
  {
    name: "upsert_product",
    description: "...",
    input_schema: upsertProductSchema, // For Chord tool discovery probes
    inputSchema: upsertProductSchema,  // For Anthropic MCP clients
    parameters: upsertProductSchema    // For REST / OpenAPI consumers
  }
];
```
I also made sure `POST /tools` returns a bare array of tools (which Chord's probe looks for), while `GET /tools` returns `{ tools: [...] }` for standard REST calls. Once I did that, all parameters rendered properly in Chord.

### What Chord should improve
Chord's tool reader should be forgiving. If a server sends `inputSchema` or `parameters`, Chord should accept it instead of silently ignoring it if it's not strictly snake_case.

---

## 2. The bot kept believing fake "I have paid" messages

### What happened
During early sales tests, the bot would send a customer a Paystack link. When I typed: *"I've done the transfer, please send to Ikeja"*, the bot replied: *"Thank you! Your order is confirmed, we're dispatching today!"* 

Nobody had paid anything.

### Why it happened
LLMs are trained to be helpful and polite. If a user says "I sent the money" or sends a photo, the bot's default reaction is to say "Thank you, order confirmed!". 

In Nigeria, fake bank alert screenshots and fake SMS texts are everywhere in WhatsApp commerce. A bot that confirms orders based on what a customer says will get a store owner cleaned out within days.

### How I fixed it
I locked this down at both the code level and the prompt level:
1. **Strict separation of tools**:
   * `checkout` only creates an order with status `pending_payment` and returns the Paystack link.
   * An order can **only** become `paid` if the server hits Paystack's verification API (`GET /transaction/verify/:reference`) and gets back `status: "success"`.
2. **Hard rule in `skills/SKILL.md`**:
   * Told the bot clearly: customer claims, transfer texts, and screenshots are never proof of payment. Payment link generated $\neq$ money received. If Paystack hasn't verified it, the order is unverified.
3. **Automated tests**:
   * Added tests in `tests/payments.test.ts` to ensure unverified or failed payments keep orders locked in `payment_unverified` and prevent inventory release.

### What Chord should improve
When a customer finishes paying on Paystack, Paystack sends a webhook. But in Chord, the bot can't proactively message the customer until the customer sends another message first. Having an inbound webhook trigger in Chord that lets the bot push a message (*"Payment received! We're packing your wig now"*) would make checkout feel completely seamless.

---

## 3. One WhatsApp chat trying to be both the customer and the store owner

### What happened
At first, I tried to make one bot do everything in the same WhatsApp chat: shoppers could browse wigs and buy, while Vivian (the store owner) could also restock inventory and write Status copy.

In the WhatsApp simulator, this got messy fast. In the exact same chat thread, I was ordering a wig as a customer, and then in the next line telling the bot to add 3 wigs to inventory as the owner. The bot had no clean way to know who was talking.

### Why it happened
WhatsApp doesn't have login roles like a dashboard. If you give a single WhatsApp bot administrative tools like `upsert_product`, any customer on the street could text the store and drop wig prices to ₦1,000. And if you lock it down, the store owner can't manage her catalogue from her phone.

### How I fixed it: Pivoting to a dedicated Merchant Copilot
I stopped trying to build a confused two-in-one bot and focused 100% on **Vivian (the store owner)** as the user:
1. **Vivian holds the phone**: The bot is her private sales copilot and business partner.
2. **Morning Status copy**: It checks what wigs are actually in stock and writes 3 high-energy captions in natural Nigerian Pidgin and beauty slang (*"Who dey breath?!"*, *"Pressure ti wa!"*, *"God na now"*) so she can post to WhatsApp Status in one tap.
3. **Stock control**: Vivian can add or update wig stock on the go via simple chat.
4. **Order checkout**: When a customer DMs Vivian to buy, Vivian gives the bot their details. The bot reserves the wig, grabs the official catalogue price, and generates a Paystack link formatted for Vivian to forward directly to the buyer.

This eliminated all identity confusion, closed the security loophole, and directly solved the owner's biggest daily time wasters.

---

## Quick Summary of Feedback for Chord

1. **Be flexible with tool schemas**: Accept `input_schema`, `inputSchema`, and `parameters` interchangeably in the MCP connector.
2. **Inbound webhook triggers**: Let external webhooks (like Paystack's `charge.success`) wake up the agent to proactively message a customer when their payment clears.
3. **WhatsApp interactive buttons**: Allow tool outputs to render WhatsApp Cloud API CTA buttons (e.g. `[Pay via Paystack]`) instead of long raw URLs.
