"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { paymentOptions, sessionToken, checkoutUrl } = require("../membership");
const configHandler = require("../api/config");

test("membership exposes only configured providers with valid positive server prices", () => {
  assert.deepEqual(paymentOptions({ providers: { stripe: false }, plans: { Pro: 1500 } }), []);
  const options = paymentOptions({
    providers: { stripe: true, paypal: true, untrusted: true },
    plans: { Pro: 1500 }, paypalAmounts: { Pro: "19.00" },
  });

  assert.deepEqual(options.map(item => [item.provider, item.currency, item.amount]), [["stripe", "INR", 1500], ["paypal", "USD", 19]]);
  for (const value of [0, -1, null, "", Infinity, "not-a-price"]) {
    assert.deepEqual(paymentOptions({ providers: { stripe: true }, plans: { Pro: value } }), []);
  }
  assert.deepEqual(paymentOptions({ providers: { paypal: true }, paypalAmounts: { Pro: "19" } }), []);
});

test("Go and Pro select their own server prices and independently configured PayPal amounts", () => {
  const config = { providers: { stripe: true, paypal: true }, plans: { Go: 1500, Pro: 5000 },
    paypalAmounts: { Pro: "12.00" }, paypalTiers: { Go: false, Pro: true } };
  assert.deepEqual(paymentOptions(config, "Go").map(item => [item.provider, item.amount]), [["stripe", 1500]]);
  assert.deepEqual(paymentOptions(config, "Pro").map(item => [item.provider, item.amount]),
    [["stripe", 5000], ["paypal", 12]]);
  assert.deepEqual(paymentOptions(config, "Free"), []);
});

test("checkout requires a non-expired saved session and rejects non-HTTPS payment links", () => {
  const now = Date.now();
  const storage = value => ({ getItem: () => value });
  assert.equal(sessionToken(storage(JSON.stringify({ access_token: "test-session", expires_at: (now + 120000) / 1000 })), now), "test-session");
  assert.equal(sessionToken(storage(JSON.stringify({ access_token: "test-session", expires_at: (now - 1000) / 1000 })), now), null);
  assert.equal(sessionToken(storage("{invalid-json")), null);
  assert.equal(sessionToken({ getItem() { throw new Error("blocked"); } }), null);
  assert.equal(checkoutUrl("https://checkout.stripe.com/test"), "https://checkout.stripe.com/test");
  for (const value of ["javascript:alert(1)", "http://checkout.test", "https://user:pass@checkout.test", undefined]) {
    assert.throws(() => checkoutUrl(value));
  }
});

test("PayPal Pro readiness does not depend on retired tier prices and requires a valid return origin", async t => {
  const names = [
    "NODE_ENV", "PUBLIC_APP_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY",
    "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID",
    "PAYPAL_PRO_USD", "PAYPAL_GO_USD", "PAYPAL_L1_USD", "PAYPAL_L2_USD", "PAYPAL_L3_USD",
    "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
    "SALES_ENABLED", "SUPPORT_EMAIL",
  ];
  const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  });
  names.forEach(name => { delete process.env[name]; });
  Object.assign(process.env, {
    NODE_ENV: "production", PUBLIC_APP_URL: "https://kr7tech.test",
    SUPABASE_URL: "https://supabase.test", SUPABASE_ANON_KEY: "test-anon",
    PAYPAL_CLIENT_ID: "test-client", PAYPAL_CLIENT_SECRET: "test-secret",
    PAYPAL_WEBHOOK_ID: "test-webhook", PAYPAL_PRO_USD: "19.00",
    SALES_ENABLED: "true", SUPPORT_EMAIL: "support@example.test",
  });
  async function config() {
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    await configHandler({ method: "GET" }, res);
    assert.equal(res.statusCode, 200);
    return res.body;
  }
  const initial = await config();
  assert.equal(initial.providers.paypal, true);
  assert.equal(initial.plans.Go, 750);
  assert.equal(initial.plans.Pro, 2500);
  assert.deepEqual(initial.planOffers.Go, { currency:"INR", regularAmount:1500, amount:750, discountPercent:50 });
  assert.deepEqual(initial.planOffers.Pro, { currency:"INR", regularAmount:5000, amount:2500, discountPercent:50 });
  assert.equal(initial.paypalAmounts.Pro, "19.00");
  assert.equal(initial.paypalTiers.Go, false);
  process.env.PAYPAL_PRO_USD = "0.00";
  assert.equal((await config()).providers.paypal, false);
  process.env.PAYPAL_GO_USD = "18.00";
  assert.equal((await config()).providers.paypal, true);
  assert.equal((await config()).paypalTiers.Go, true);
  delete process.env.PAYPAL_GO_USD;
  process.env.PAYPAL_PRO_USD = "19.00";
  process.env.PUBLIC_APP_URL = "http://kr7tech.test";
  assert.equal((await config()).providers.paypal, false);
  delete process.env.PUBLIC_APP_URL;
  assert.equal((await config()).providers.paypal, false);
});
