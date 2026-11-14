"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "scripts", "local-preview-account.js"), "utf8");

async function page({ firstAdminAvailable = true, signupError } = {}) {
  const elements = new Map();
  const events = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, value: "", textContent: "", disabled: false, listeners: new Map(),
      addEventListener(name, callback) { this.listeners.set(name, callback); },
      reportValidity() { return true; }, focus() { this.focused = true; },
      querySelectorAll() { return [...elements.values()]; },
    });
    return elements.get(id);
  }
  const posts = [];
  let reloads = 0;
  const document = { getElementById: element, querySelector: element,
    addEventListener(name, callback) { events.set(name, callback); } };
  vm.runInNewContext(source, {
    document, location: { reload() { reloads++; } },
    fetch: async (url, options) => {
      assert.equal(url, "/api/local-preview-accounts");
      if (options.method === "POST") {
        posts.push({ options, body: JSON.parse(options.body) });
        return { ok: !signupError, json: async () => signupError ? { error: signupError } : { signedIn: true } };
      }
      return { ok: true, json: async () => ({ firstAdminAvailable, signedIn: false }) };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { element, events, posts, reloads: () => reloads,
    submit: () => element("preview-registration-form").listeners.get("submit")({ preventDefault() {} }) };
}

test("local signup UI identifies the first Admin and hides registration after login", async () => {
  const ui = await page();
  assert.equal(ui.element("preview-registration").hidden, false);
  assert.equal(ui.element("preview-learning-role").hidden, true);
  assert.equal(ui.element("preview-registration-heading").textContent, "Create your Admin account");
  assert.equal(ui.element("local-admin-sign-in").textContent, "Log in");
  ui.events.get("kr7:account-change")({ detail: { signedIn: true } });
  assert.equal(ui.element("preview-registration").hidden, true);
});

test("local signup UI checks password confirmation and reloads the signed-in dashboard after creation", async () => {
  const ui = await page();
  ui.element("preview-username").value = "Owner";
  ui.element("preview-email").value = "owner@example.test";
  ui.element("preview-role").value = "student";
  ui.element("preview-password").value = "test-password";
  ui.element("preview-confirm-password").value = "different";
  await ui.submit();
  assert.equal(ui.posts.length, 0);
  assert.equal(ui.element("account-status").textContent, "Passwords do not match.");
  ui.element("preview-confirm-password").value = "test-password";
  await ui.submit();
  assert.equal(ui.posts.length, 1);
  assert.equal(ui.posts[0].body.username, "Owner");
  assert.equal(ui.posts[0].options.credentials, "same-origin");
  assert.equal(ui.reloads(), 1);
  assert.equal(ui.element("preview-password").value, "");
  assert.equal(ui.element("preview-confirm-password").value, "");
});

test("later account UI explains learning roles and reports signup errors without claiming success", async () => {
  const ui = await page({ firstAdminAvailable: false, signupError: "That email already has a local account." });
  assert.equal(ui.element("preview-learning-role").hidden, false);
  assert.equal(ui.element("preview-registration-heading").textContent, "Create a local learning account");
  ui.element("preview-password").value = "test-password";
  ui.element("preview-confirm-password").value = "test-password";
  await ui.submit();
  assert.equal(ui.reloads(), 0);
  assert.equal(ui.element("account-status").textContent, "That email already has a local account.");
  assert.equal(ui.element("preview-password").value, "");
});
