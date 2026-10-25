# Sellora: Business Owner Handover & Go-Live Note

**To**: Vivian (Store Owner, Glow & Wigs Empire)  
**From**: AI Solutions Engineer  
**Date**: October 2026  
**Subject**: Sellora Copilot – Handover, Boundaries, and Go-Live Checklist  

---

Dear Vivian,

Sellora is your private WhatsApp sales copilot. It takes away the daily grind of running your beauty business on your phone: drafting your daily WhatsApp Status captions, keeping track of wig stock, and generating official Paystack payment links you can forward to buyers in seconds.

Here is what your copilot does, its boundaries, and what we need in place before running your live store on it.

---

### 1. What Sellora Does for You
* **Morning Status Copywriter**: Checks your real-time inventory and drafts 3 high-energy Status captions (Spotlight, Scarcity/Baddie vibe, and Luxury tone) with exact prices so you can copy and post to WhatsApp Status in one tap.
* **Instant Stock Management**: You can restock wigs, add new skincare bundles, or change quantities on the go by chatting naturally (*"Add 2 bone straight 18-inch wigs at ₦85,000"*).
* **1-Tap Checkout Link Generation**: When a customer DMs you to buy, give Sellora their details. It reserves the wig, grabs the official catalogue price, and gives you a pre-formatted WhatsApp message with a secure Paystack link ready to forward.

### 2. What It Does NOT Do
* **Auto-Post to WhatsApp Status**: Meta’s platform does not allow third-party tools to post directly to personal WhatsApp Status. Sellora writes and formats the copy; you copy-paste the one you like.
* **Auto-Confirm Fake Bank Alerts**: Sellora will **never** mark an order as paid because a buyer sends a transfer screenshot or claims their bank debited them. It only marks an order paid when Paystack verifies the funds.
* **Direct Customer Conversations**: Sellora is your private copilot, not a generic public bot. You maintain your personal relationship with your buyers in DMs while Sellora runs the numbers and links in the background.

### 3. What Happens When a Payment Fails or Is Abandoned?
* The order remains in `pending_payment` status.
* The reserved wig is held for 60 minutes. If the buyer doesn't pay, the stock is automatically released back to your catalogue so another customer can buy it.
* You can ask Sellora for a fresh payment link anytime if the customer asks to try another card.

### 4. What Happens If Something Breaks?
* **Service Outage**: If our server blips, Sellora will not guess or create phantom orders. It tells you immediately.
* **Alerts**: Any server error or database disconnection logs an alert to your technical engineer.

---

### 5. What Must Be True Before Going Live
1. **Live Paystack Account**: Replace test keys (`sk_test_...`) with your live Paystack secret key linked to your business corporate bank account.
2. **Dedicated WhatsApp Business Number**: Connect your official store phone number to the WhatsApp Cloud API via Chord.
3. **Delivery Fee Schedule**: Agree on fixed delivery flat rates (e.g., ₦3,000 Lagos, ₦5,000 Interstate) so Sellora automatically bundles shipping into checkout links.
4. **Physical Stock Audit**: Do a 15-minute physical count of wigs and serums in your store before loading your starting inventory.

With these four in place, Sellora will save you 3 to 5 hours of manual chat and copywriting every day.
