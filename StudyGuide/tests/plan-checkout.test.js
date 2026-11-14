"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const checkout = require("../api/checkout");
const originalFetch = global.fetch;
const names = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "PUBLIC_APP_URL",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
const reply = value => ({ ok: true, json: async () => value, text: async () => JSON.stringify(value) });

test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});

test("Razorpay charges the same 50%-off INR amount stored for the selected membership", async () => {
  Object.assign(process.env, { SUPABASE_URL:"https://supabase.test", SUPABASE_ANON_KEY:"test-anon",
    SUPABASE_SERVICE_ROLE_KEY:"test-service", PUBLIC_APP_URL:"https://kr7tech.test",
    RAZORPAY_KEY_ID:"test-key", RAZORPAY_KEY_SECRET:"test-secret", RAZORPAY_WEBHOOK_SECRET:"test-webhook" });
  for (const [tier, expectedAmount] of [["Go", 75000], ["Pro", 250000]]) {
    let purchase, link;
    global.fetch = async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/auth/v1/user") return reply({ id:"buyer" });
      if (parsed.pathname === "/rest/v1/entitlements") return reply([]);
      if (parsed.pathname === "/rest/v1/payments" && options.method === "POST") {
        purchase = JSON.parse(options.body);
        return reply([{ id:"purchase" }]);
      }
      if (parsed.hostname === "api.razorpay.com") {
        link = JSON.parse(options.body);
        return reply({ id:"link", short_url:"https://rzp.io/test" });
      }
      if (parsed.pathname === "/rest/v1/payments" && options.method === "PATCH") return reply(null);
      throw new Error(`Unexpected checkout call: ${parsed.pathname}`);
    };
    const res = { status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    await checkout({ method:"POST", headers:{ authorization:"Bearer buyer-session" },
      body:{ tier, provider:"razorpay", amount:1, discountPercent:100 } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(purchase.amount_minor, expectedAmount);
    assert.equal(link.amount, expectedAmount);
    assert.equal(link.currency, "INR");
    assert.equal(purchase.currency, "INR");
    assert.equal(link.notes.tier, tier);
  }
});

test("verified checkout uses each selected plan's server price, never a client amount or another tier", async () => {
  Object.assign(process.env, { SUPABASE_URL: "https://supabase.test", SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_ROLE_KEY: "test-service", STRIPE_SECRET_KEY: "test-stripe",
    STRIPE_WEBHOOK_SECRET: "test-webhook", PUBLIC_APP_URL: "https://kr7tech.test" });
  for (const [tier, expectedAmount] of [["Go", 75000], ["Pro", 250000]]) {
    let purchase, providerRequest;
    global.fetch = async (url, options = {}) => {
      const parsed = new URL(url);
      if (parsed.pathname === "/auth/v1/user") return reply({ id: "buyer", email: "buyer@example.test" });
      if (parsed.pathname === "/rest/v1/entitlements") return reply([]);
      if (parsed.pathname === "/rest/v1/payments" && options.method === "POST") {
        purchase = JSON.parse(options.body);
        return reply([{ id: "purchase" }]);
      }
      if (parsed.hostname === "api.stripe.com") {
        providerRequest = new URLSearchParams(options.body);
        return reply({ id: "checkout", url: "https://checkout.stripe.com/test" });
      }
      if (parsed.pathname === "/rest/v1/payments" && options.method === "PATCH") return reply(null);
      throw new Error(`Unexpected checkout call: ${parsed.pathname}`);
    };
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await checkout({ method: "POST", headers: { authorization: "Bearer buyer-session" },
      body: { tier, provider: "stripe", amount: 1, currency: "USD" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(purchase.tier, tier);
    assert.equal(purchase.status, "pending");
    assert.equal(purchase.amount_minor, expectedAmount);
    assert.equal(purchase.currency, "INR");
    assert.equal(providerRequest.get("line_items[0][price_data][unit_amount]"), String(expectedAmount));
    assert.equal(providerRequest.get("metadata[tier]"), tier);
    assert.equal(providerRequest.get("mode"), "payment");
    const returned = new URL(providerRequest.get("success_url"));
    assert.equal(returned.pathname, "/Purchase.html");
    assert.equal(returned.searchParams.get("purchase"), "purchase");
    assert.equal(returned.searchParams.get("tier"), tier);
    assert.equal(new URL(providerRequest.get("cancel_url")).searchParams.get("payment"), "cancelled");
  }
});
