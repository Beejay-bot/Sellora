# Sellora Beauty Store FAQ & Merchant Policies

This reference guide is Sellora's operational ground truth for advising the store owner on store policies, pricing rules, stock handling, delivery schedules, and WhatsApp Status campaigns.

---

## 1. Product Categories & Catalogue Specs
* **Human Hair Wigs**: 100% human hair (Virgin / Raw hair), available in Bone Straight, Body Wave, Deep Wave, and Water Curl textures. Standard lengths: 10-inch to 30-inch.
* **Lace Types**: HD Lace (melts seamlessly into all skin tones), Transparent Lace, and Swiss Lace. Closures: 4x4, 5x5; Frontals: 13x4, 13x6.
* **Hair Care & Cosmetics**: Scalp oils, lace tint sprays, styling mousses, edge control gels, and botanical serums.
* **Live Restocking**: The store owner can restock existing wigs or add new beauty bundles anytime by chatting with Sellora (`upsert_product`).

---

## 2. Order Booking & Payment Policies
* **Payment Gateway**: All orders are processed exclusively through secure Paystack checkout links in Nigerian Naira (NGN, ₦).
* **1-Tap Checkout Generation**: When a buyer reaches out in DMs, the store owner gives Sellora their details (`checkout`). Sellora reserves the item, locks in the official catalogue price, and generates a pre-formatted message with a Paystack link ready to forward to the buyer.
* **60-Minute Stock Reservation**: An order is created in `pending_payment` status and the item is reserved for 60 minutes. If payment is abandoned, the reservation expires and stock returns to active inventory.
* **Payment Verification & Anti-Fraud (CRITICAL)**:
  - An order is marked as `paid` **ONLY** after Paystack's verification API confirms successful transaction settlement.
  - Customer bank alert texts, SMS debit alerts, transfer receipts, and screenshots are **never** proof of payment.
* **Price Ground Truth**: Prices must strictly match the database catalogue. No arbitrary markups or undisclosed fees.

---

## 3. Delivery Fees & Dispatch Schedules
* **Lagos (Same-City)**:
  - Same-day dispatch for orders verified before **1:00 PM**.
  - Next-day delivery for orders verified after 1:00 PM.
  - Standard Lagos shipping rates: Mainland (₦2,500 – ₦3,000), Island (₦3,000 – ₦3,500).
* **Interstate (Outside Lagos)**:
  - 2 to 4 business days via verified logistics partners (GIG Logistics, Speedaf, DHL).
  - Standard interstate shipping: ₦4,500 – ₦6,000.
* **Pre-Orders & Custom Styling**: 5 to 7 working days for custom coloring, revamping, or bespoke wig construction.
* **No Automated Dispatch**: Sellora quotes standard delivery timelines and fee tiers, but the store owner or dispatch manager arranges physical rider pickup once payment clears.

---

## 4. WhatsApp Status Promotion Guidelines
* **3-Option Format**: Every morning, Sellora checks live in-stock inventory and drafts 3 distinct captions:
  1. **Option 1 (Baddie & Rich Aunty Vibe 💅)**: High-energy, relatable salon banter celebrating luxury hair and flawless lace melt.
  2. **Option 2 (Pressure Ti Wa / High Urgency 🔥)**: Fun scarcity urgency (*"Fast fingers only, remaining just 1 unit!"*).
  3. **Option 3 (Soft Life & God Na Now ✨)**: High-ticket aspiration and elegance.
* **Stock & Price Anchoring**: Every caption must quote the official price in Naira (`₦85,000`) and only promote wigs that have at least 1 unit in active stock.
* **Manual 1-Tap Posting**: Due to Meta platform policies, third-party tools cannot post directly to personal WhatsApp Status. Sellora formats the copy so the store owner can copy-paste it to their Status in one tap.

---

## 5. What to Do When Payments Fail or Need Follow-Up
* If a customer’s card fails or expires, the store owner can ask Sellora for a fresh checkout link.
* The store owner can run an order check anytime (*"Check order status for Chioma"*) to see if Paystack has confirmed payment.
