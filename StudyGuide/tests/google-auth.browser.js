"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { chromium } = require("playwright");
const { createServer } = require("../server");

async function openSite(t, configured = true) {
  const names = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV"];
  const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  for (const name of names) delete process.env[name];
  process.env.NODE_ENV = "development";
  if (configured) {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_ANON_KEY = "test-anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-private-service-key";
  }
  t.after(() => {
    global.fetch = originalFetch;
    for (const name of names) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  });
  const state = { challenge: "", exchanges: 0 };
  global.fetch = async (url, options = {}) => {
    url = String(url);
    if (url.endsWith("/auth/v1/settings")) return { ok: true, json: async () => ({ external: { google: true } }) };
    if (url.endsWith("/auth/v1/token?grant_type=pkce")) {
      const body = JSON.parse(options.body);
      assert.equal(body.auth_code, "browser-test-code");
      assert.equal(crypto.createHash("sha256").update(body.code_verifier).digest("base64url"), state.challenge);
      state.exchanges++;
      return { ok: true, json: async () => ({
        access_token: "browser-google-access", refresh_token: "browser-google-refresh", expires_in: 3600,
        provider_token: "google-provider-token-not-for-storage",
        user: { id: "browser-google-user", email: "student@example.test" },
      }) };
    }
    if (url.endsWith("/auth/v1/user")) {
      assert.equal(options.headers.Authorization, "Bearer browser-google-access");
      return { ok: true, json: async () => ({ id: "browser-google-user", email: "student@example.test" }) };
    }
    if (/\/rest\/v1\/(?:entitlements|profiles)\?/.test(url)) return { ok: true, text: async () => "[]" };
    if (url.includes("/rest/v1/questions?")) return { ok: true, text: async () => JSON.stringify(
      Array.from({ length: 12 }, (_, index) => ({
        id: `google-question-${index}`, company: "Practice", topic: "Testing",
        question: `Practice question ${index}`, answer: `Practice answer ${index}`, example: `Example ${index}`,
      })),
    ) };
    throw new Error("Unexpected authentication test request.");
  };
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.PUBLIC_APP_URL = base;
  const browser = await chromium.launch({
    headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
  });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  return { page, context, browser, base, state, errors };
}

async function redirectProvider(page, state, cancelled = false) {
  await page.route("https://supabase.test/auth/v1/authorize?*", async route => {
    const url = new URL(route.request().url());
    state.challenge = url.searchParams.get("code_challenge");
    const callback = new URL(url.searchParams.get("redirect_to"));
    if (cancelled) callback.hash = "error=access_denied&error_description=not-for-display";
    else callback.searchParams.set("code", "browser-test-code");
    await route.fulfill({ status: 302, headers: { location: callback.href }, body: "" });
  });
}

test("Google OAuth verifies PKCE, reuses account and checkout sessions, and does not grant Pro", async t => {
  const { page, context, base, state, errors } = await openSite(t);
  await redirectProvider(page, state);
  await page.route("https://supabase.test/auth/v1/logout", route => route.fulfill({
    status: 200, json: {},
    headers: {
      "Access-Control-Allow-Origin": base,
      "Access-Control-Allow-Headers": "apikey, authorization, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  }));
  await page.goto(`${base}/Company-Interviews.html#access-heading`);
  await page.locator("[data-google-sign-in]:not([disabled])").waitFor();
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();
  await page.getByText("Signed in as student@example.test. Free preview: first 10 company questions are visible.", { exact: true }).waitFor();
  assert.equal(state.exchanges, 1);
  assert.equal(page.url(), `${base}/Company-Interviews.html#access-heading`);
  assert.equal(await page.locator("#sign-out").isVisible(), true);
  assert.equal(await page.locator("#question-list .qa-card").count(), 10);
  assert.equal(await page.locator("#question-list .locked-card").count(), 2);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("visual-memory-lab.auth-session")));
  assert.equal(saved.access_token, "browser-google-access");
  assert.equal(saved.refresh_token, "browser-google-refresh");
  assert.equal(JSON.stringify(saved).includes("google-provider-token"), false);
  const cookies = await context.cookies();
  assert.equal(cookies.find(cookie => cookie.name === "visual_pro_session").httpOnly, true);
  assert.equal(cookies.some(cookie => /google_flow|kr7.*pro/.test(cookie.name)), false);
  await page.reload();
  await page.locator("#sign-out:not([hidden])").waitFor();
  await page.locator("#sign-out").click();
  await page.getByText("Free preview: first 10 company questions are visible. Enter the PIN for each remaining question or sign in with paid Pro access.", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("visual-memory-lab.auth-session")), null);
  assert.equal((await context.cookies()).some(cookie => cookie.name === "visual_pro_session"), false);

  await page.route("**/api/config", route => route.fulfill({ json: {
    supabaseUrl: "https://supabase.test", supabaseAnonKey: "test-anon",
    providers: { stripe: true }, plans: { Pro: 2500 }, paypalAmounts: {},
  } }));
  await page.goto(`${base}/Membership.html`);
  await page.locator("#membership-provider:not([disabled])").waitFor();
  assert.equal(await page.locator("[data-google-sign-in]").count(), 0);
  assert.equal(await page.locator("#membership-buy").isDisabled(), true);
  // Legacy Google sign-in remains on Company Interviews, not the password-only Account flow.
  await page.goto(`${base}/Company-Interviews.html#access-heading`);
  await page.locator("[data-google-sign-in]:not([disabled])").waitFor();
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();
  await page.locator("#sign-out:not([hidden])").waitFor();
  await page.goto(`${base}/Membership.html`);
  await page.locator("#membership-buy:not([disabled])").waitFor();
  assert.equal(state.exchanges, 2);
  assert.equal((await context.cookies()).some(cookie => /kr7.*pro/.test(cookie.name)), false);
  assert.deepEqual(errors, []);
});

test("Google cancellation and cross-browser callbacks never save a session or retain callback secrets in history", async t => {
  const { page, context, browser, base, state, errors } = await openSite(t);
  await redirectProvider(page, state, true);
  await page.goto(`${base}/Company-Interviews.html`);
  await page.locator("[data-google-sign-in]:not([disabled])").waitFor();
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();
  await page.getByText("Google sign-in was cancelled or not completed. Return to the account page and try again.", { exact: true }).waitFor();
  assert.equal(page.url(), `${base}/Auth-Callback.html`);
  assert.equal(state.exchanges, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem("visual-memory-lab.auth-session")), null);
  assert.equal((await context.cookies()).some(cookie => /google_flow|visual_pro_session/.test(cookie.name)), false);

  const started = await context.request.post(`${base}/api/google-auth`, {
    headers: { Origin: base }, data: { action: "start", returnTo: "/Membership.html" },
  });
  assert.equal(started.status(), 200);
  const callback = new URL(new URL((await started.json()).url).searchParams.get("redirect_to"));
  callback.searchParams.set("code", "browser-test-code");
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto(callback.href);
  await otherPage.getByText("This sign-in attempt expired or belongs to another browser. Start Google sign-in again.", { exact: true }).waitFor();
  assert.equal(otherPage.url(), `${base}/Auth-Callback.html`);
  assert.equal(state.exchanges, 0);
  assert.equal(await otherPage.evaluate(() => localStorage.getItem("visual-memory-lab.auth-session")), null);
  await otherContext.close();
  assert.deepEqual(errors, []);
});

test("unconfigured Google sign-in stays disabled while free previews and PIN controls remain usable", async t => {
  const { page, base, errors } = await openSite(t, false);
  await page.goto(base);
  await page.getByRole("link", { name: "Account / Google sign-in", exact: true }).click();
  await page.locator("#question-list .qa-card").first().waitFor();
  await page.getByText("Google sign-in needs owner setup: configure Supabase and the website URL, then enable the Google provider.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Sign in with Google", exact: true }).isDisabled(), true);
  assert.equal(await page.locator("#sign-in").isDisabled(), true);
  assert.equal(await page.locator("#sign-up").isDisabled(), true);
  const image = page.locator(".google-sign-in img");
  await image.evaluate(image => image.decode());
  assert.ok(await image.evaluate(image => image.naturalWidth > 0));
  assert.ok(await image.evaluate(image => {
    const box = image.getBoundingClientRect();
    return Math.abs(box.width / box.height - image.naturalWidth / image.naturalHeight) < .01;
  }));
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator("[data-pro-unlock]").first().click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});

test("blocked browser storage cancels the new app session instead of leaving a partial Google login", async t => {
  const { page, context, base, state, errors } = await openSite(t);
  const started = await context.request.post(`${base}/api/google-auth`, {
    headers: { Origin: base }, data: { action: "start" },
  });
  assert.equal(started.status(), 200);
  const authorize = new URL((await started.json()).url);
  state.challenge = authorize.searchParams.get("code_challenge");
  const callback = new URL(authorize.searchParams.get("redirect_to"));
  callback.searchParams.set("code", "browser-test-code");
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() { throw new DOMException("Storage blocked", "SecurityError"); },
    });
  });
  await page.goto(callback.href);
  await page.getByText("Browser storage is blocked. Allow storage for this website, then try signing in again.", { exact: true }).waitFor();
  assert.equal(page.url(), `${base}/Auth-Callback.html`);
  assert.equal((await context.cookies()).some(cookie => /google_flow|visual_pro_session/.test(cookie.name)), false);
  assert.deepEqual(errors, []);
});
