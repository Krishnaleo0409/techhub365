"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const purchases = require("../api/purchases");
const checkout = require("../api/checkout");
const config = require("../api/config");
const { purchaseState } = require("../purchase");
const { returnDestination } = require("../account");
const { purchaseReturn } = require("../api/_commerce");
const names = ["AUTH_PROVIDER", "NODE_ENV", "PUBLIC_APP_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SALES_ENABLED", "SUPPORT_EMAIL"];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
const originalFetch = global.fetch;
const reply = value => ({ ok: true, json: async () => value, text: async () => JSON.stringify(value) });
const purchase = { id: "purchase-a", user_id: "buyer", tier: "Go", status: "paid", provider: "stripe",
  amount_minor: 150000, currency: "INR", created_at: "2026-11-14T06:00:00Z",
  provider_reference: "private-provider-reference", arbitrary_private_field: "must-not-leak" };
let paid;
let writes;

function response() {
  return { headers: {}, status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; }, json(value) { this.body = value; return this; } };
}
test.beforeEach(() => {
  paid = [];
  writes = 0;
  Object.assign(process.env, { AUTH_PROVIDER: "supabase", NODE_ENV: "production",
    PUBLIC_APP_URL: "https://kr7tech.test", SUPABASE_URL: "https://supabase.test",
    SUPABASE_ANON_KEY: "test-anon", SUPABASE_SERVICE_ROLE_KEY: "test-service",
    STRIPE_SECRET_KEY: "test-stripe", STRIPE_WEBHOOK_SECRET: "test-webhook",
    SALES_ENABLED: "true", SUPPORT_EMAIL: "support@example.test" });
  global.fetch = async (value, options = {}) => {
    const url = new URL(value);
    if (url.pathname === "/auth/v1/user") return reply({ id: "buyer" });
    if (url.pathname === "/rest/v1/entitlements") return reply(paid);
    if (url.pathname === "/rest/v1/payments") {
      assert.equal(url.searchParams.get("user_id"), "eq.buyer");
      assert.equal(url.searchParams.get("limit"), "20");
      if (options.method && options.method !== "GET") writes++;
      return reply([purchase]);
    }
    throw new Error("No payment provider may be contacted in this test.");
  };
});
test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

test("purchase history is private, account-scoped and excludes provider references and unrelated fields", async () => {
  const res = response();
  await purchases({ method: "GET", headers: { authorization: "Bearer buyer-session" } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Cache-Control"], /private, no-store/);
  assert.equal(res.body.plan, "Free");
  assert.equal(res.body.purchases[0].amountMinor, 150000);
  assert.equal(res.body.purchases[0].plan, "Go");
  assert.doesNotMatch(JSON.stringify(res.body), /must-not-leak|private-provider-reference|user_id/);
  const anonymous = response();
  await purchases({ method: "GET", headers: {} }, anonymous);
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.body.purchases, undefined);
  const write = response();
  await purchases({ method: "POST", headers: {} }, write);
  assert.equal(write.statusCode, 405);
});

test("return pages never turn URL hints, a pending record, or a revoked membership into active access", () => {
  const record = { id: "a", plan: "Go", status: "pending" };
  assert.equal(purchaseState({ plan: "Pro", purchases: [record] }, "a").verified, false);
  assert.equal(purchaseState({ plan: "Pro", purchases: [record] }, "forged").verified, false);
  record.status = "paid";
  assert.equal(purchaseState({ plan: "Free", purchases: [record] }, "a").verified, false);
  assert.match(purchaseState({ plan: "Free", purchases: [record] }, "a").message, /do not pay again/);
  assert.equal(purchaseState({ plan: "Go", purchases: [record] }, "a").verified, true);
  assert.equal(purchaseState({ plan: "Pro", purchases: [record] }, "a").verified, true);
});

test("production sales require the release switch and published support, including direct checkout calls", async () => {
  for (const settings of [{ SALES_ENABLED: "false" }, { SUPPORT_EMAIL: "" }, { SUPPORT_EMAIL: "not-an-email" }]) {
    Object.assign(process.env, { SALES_ENABLED: "true", SUPPORT_EMAIL: "support@example.test" }, settings);
    const advertised = response();
    await config({ method: "GET" }, advertised);
    assert.equal(advertised.body.providers.stripe, false);
    const result = response();
    await checkout({ method: "POST", headers: { authorization: "Bearer buyer-session" },
      body: { tier: "Go", provider: "stripe" } }, result);
    assert.equal(result.statusCode, 503);
    assert.equal(writes, 0);
  }
});

test("existing paid access cannot be bought again and Pro already includes Go", async () => {
  for (const [current, selected] of [["Go", "Go"], ["Pro", "Go"], ["Pro", "Pro"]]) {
    paid = [{ tier: current, active: true }];
    const res = response();
    await checkout({ method: "POST", headers: { authorization: "Bearer buyer-session" },
      body: { tier: selected, provider: "stripe" } }, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /already has access/);
    assert.equal(writes, 0);
  }
});

test("checkout return origins and account continuation reject off-site destinations", () => {
  assert.equal(returnDestination(`?${new URLSearchParams({ next: "/Membership.html?plan=Go#purchase" })}`),
    "/Membership.html?plan=Go#purchase");
  assert.equal(returnDestination(`?${new URLSearchParams({ next: "/Purchase.html?purchase=a&token=ORDER12345" })}`),
    "/Purchase.html?purchase=a&token=ORDER12345");
  for (const next of ["https://evil.test/Purchase.html", "//evil.test/Purchase.html", "javascript:alert(1)", "/api/admin/roles"]) {
    assert.equal(returnDestination(`?${new URLSearchParams({ next })}`), "/My-Learning.html");
  }
  assert.equal(new URL(purchaseReturn("Go", "purchase-a")).searchParams.get("purchase"), "purchase-a");
  for (const origin of ["http://kr7tech.test", "https://user:pass@kr7tech.test", "https://kr7tech.test/subpath"]) {
    process.env.PUBLIC_APP_URL = origin;
    assert.throws(() => purchaseReturn("Go", "purchase-a"));
  }
});
