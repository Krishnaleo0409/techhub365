"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { once } = require("node:events");
const { Readable, Writable } = require("node:stream");
const { renderSiteLayout } = require("../api/_site-layout");
const { UNAVAILABLE_MESSAGE, sendUnavailable } = require("../api/_availability");
const { sendError } = require("../api/_shared");
const { handleRequest } = require("../server");
const root = path.join(__dirname, "..");

function openNotice(respond, { loading = false, offline = false, secure = false, register } = {}) {
  const documentEvents = new Map(), events = new Map();
  const elements = [];
  function node(tagName) {
    return { tagName, children:[], hidden:false, attributes:{}, events:new Map(),
      setAttribute(name, value) { this.attributes[name] = value; },
      append(...children) { this.children.push(...children); },
      addEventListener(name, callback) { this.events.set(name, callback); } };
  }
  const navigator = { onLine:!offline };
  if (register) navigator.serviceWorker = { register };
  let reloads = 0;
  const window = {
    location:{ href:"https://kr7tech.test/Account.html", origin:"https://kr7tech.test", reload() { reloads++; } },
    fetch:respond, isSecureContext:secure, addEventListener(name, callback) { events.set(name, callback); },
  };
  const document = { readyState:loading ? "loading" : "interactive",
    body:{ prepend(item) { elements.unshift(item); } }, createElement:node,
    addEventListener(name, callback) { documentEvents.set(name, callback); } };
  vm.runInNewContext(fs.readFileSync(path.join(root, "service-status.js"), "utf8"),
    { window, document, navigator, URL });
  return { window, navigator, events, documentEvents, elements,
    get banner() { return elements[0]; },
    get heading() { return elements[0].children[0].children[0].textContent; },
    get reloads() { return reloads; } };
}

function worker(respond, { stored = true, storageFails = false } = {}) {
  const events = new Map(), added = [], removed = [], fetched = [];
  const fallback = fs.readFileSync(path.join(root, "Unavailable.html"), "utf8");
  let claimed = false, skipped = false;
  const cache = {
    async add(request) { added.push(request); },
    async match(url) { assert.equal(url, "/Unavailable.html"); return stored ? new Response(fallback) : undefined; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "service-worker.js"), "utf8"), {
    self:{ location:{ origin:"https://kr7tech.test" }, addEventListener(name, callback) { events.set(name, callback); },
      async skipWaiting() { skipped = true; }, clients:{ async claim() { claimed = true; } } },
    caches:{ async open() { if (storageFails) throw new Error("Storage unavailable"); return cache; },
      async keys() { return ["kr7tech-availability-v1", "kr7tech-availability-v0", "other-app-cache"]; },
      async delete(key) { removed.push(key); } },
    fetch:async (...args) => { fetched.push(args); return respond(...args); },
    Request:class { constructor(url, options) { this.url = url; this.options = options; } },
    Response, URL, AbortController, setTimeout, clearTimeout,
  });
  return { events, added, removed, fetched, get claimed() { return claimed; }, get skipped() { return skipped; } };
}

function navigate(sw, pathname = "/Concepts.html", options = {}) {
  let response;
  sw.events.get("fetch")({ request:{ url:`https://kr7tech.test${pathname}`, mode:"navigate", method:"GET", ...options },
    respondWith(value) { response = value; } });
  return response;
}

async function invoke(url) {
  const req = Readable.from([]);
  req.method = "GET"; req.url = url; req.headers = { host:"kr7tech.test" };
  const chunks = [], headers = {};
  const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.statusCode = 200;
  res.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
  res.hasHeader = name => Object.hasOwn(headers, name.toLowerCase());
  const finished = once(res, "finish");
  await handleRequest(req, res);
  await finished;
  return { status:res.statusCode, headers, body:Buffer.concat(chunks).toString() };
}

test("the shared notice is installed before page scripts and only once", () => {
  const source = '<html><head><script>fetch("/api/session")</script></head><body><main>Lesson</main></body></html>';
  const html = renderSiteLayout(source, "Concepts.html");
  assert.ok(html.indexOf('src="/service-status.js"') < html.indexOf('fetch("/api/session")'));
  assert.equal(renderSiteLayout(html, "Concepts.html"), html);
});

test("an early server failure shows a notice after DOM readiness without consuming or changing its response", async () => {
  const response = new Response('{"error":"unavailable"}', { status:503 });
  const ui = openNotice(async () => response, { loading:true });
  assert.equal(await ui.window.fetch("/api/concepts"), response);
  assert.equal(response.bodyUsed, false);
  assert.equal(ui.elements.length, 0);
  ui.documentEvents.get("DOMContentLoaded")();
  assert.equal(ui.banner.hidden, false);
  assert.equal(ui.heading, "We're working on it");
  assert.equal(ui.banner.attributes.role, "status");
  assert.match(await response.text(), /unavailable/);
});

test("validation and authentication errors are preserved, and recovery is scoped to the failed service", async () => {
  let status = 400;
  const ui = openNotice(async () => new Response("", { status }));
  for (const code of [400, 401, 403, 404, 409, 429]) {
    status = code;
    assert.equal((await ui.window.fetch("/api/account-auth")).status, code);
    assert.equal(ui.banner.hidden, true);
  }
  status = 500;
  await ui.window.fetch("/api/questions?topic=Dotnet");
  await ui.window.fetch("/api/concepts");
  status = 200;
  await ui.window.fetch("/api/config");
  assert.equal(ui.banner.hidden, false);
  await ui.window.fetch("/api/questions?topic=Angular");
  assert.equal(ui.banner.hidden, false);
  await ui.window.fetch("/api/concepts");
  assert.equal(ui.banner.hidden, true);
});

test("network failures preserve rejections and retry never replays a submitted payment", async () => {
  const error = new TypeError("Failed to fetch");
  let requests = 0;
  const ui = openNotice(async () => { requests++; throw error; });
  await assert.rejects(ui.window.fetch("/api/checkout", { method:"POST", body:'{"tier":"Pro"}' }), value => value === error);
  assert.equal(ui.banner.hidden, false);
  ui.banner.children[1].events.get("click")();
  assert.equal(requests, 1);
  assert.equal(ui.reloads, 1);
});

test("intentional aborts, asset failures and third-party requests do not create application outage notices", async () => {
  const ui = openNotice(async () => { throw Object.assign(new Error("Stopped"), { name:"AbortError" }); });
  await assert.rejects(ui.window.fetch("/api/session"));
  assert.equal(ui.banner.hidden, true);
  await assert.rejects(ui.window.fetch("https://external.test/api/problem"));
  await assert.rejects(ui.window.fetch("/image.png"));
  assert.equal(ui.banner.hidden, true);
  const foreign = openNotice(async () => new Response("", { status:503 }));
  await foreign.window.fetch("https://external.test/api/problem");
  await foreign.window.fetch("/image.png");
  assert.equal(foreign.banner.hidden, true);
});

test("offline registration requires a secure context and storage refusal does not report an app outage", async () => {
  const registrations = [];
  function register(...args) {
    registrations.push(args);
    return Promise.reject(new Error("Browser policy disabled storage"));
  }
  const insecure = openNotice(async () => new Response(""), { register });
  insecure.events.get("load")();
  assert.equal(registrations.length, 0);
  const secure = openNotice(async () => new Response(""), { secure:true, register });
  secure.events.get("load")();
  await Promise.resolve();
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0][0], "/service-worker.js");
  assert.equal(registrations[0][1].scope, "/");
  assert.equal(secure.banner.hidden, true);
});

test("timeouts and offline connections have appropriate notices", async () => {
  const signal = AbortSignal.abort(new DOMException("Timed out", "TimeoutError"));
  const ui = openNotice(async () => { throw signal.reason; });
  await assert.rejects(ui.window.fetch("/api/session", { signal }));
  assert.equal(ui.banner.hidden, false);
  const offline = openNotice(async () => new Response(""), { offline:true });
  assert.equal(offline.heading, "You're offline");
  assert.equal(offline.banner.hidden, false);
  offline.navigator.onLine = true;
  offline.events.get("online")();
  assert.equal(offline.banner.hidden, true);
});

test("the worker stores only the public fallback and removes only its own obsolete caches", async () => {
  const sw = worker(async () => new Response(""));
  let finished;
  sw.events.get("install")({ waitUntil(value) { finished = value; } });
  await finished;
  assert.equal(sw.added.length, 1);
  assert.equal(sw.added[0].url, "/Unavailable.html");
  assert.equal(sw.skipped, true);
  sw.events.get("activate")({ waitUntil(value) { finished = value; } });
  await finished;
  assert.deepEqual(sw.removed, ["kr7tech-availability-v0"]);
  assert.equal(sw.claimed, true);
});

test("failed navigations receive the styled fallback with 503; successful and client-error responses remain unchanged", async () => {
  for (const status of [200, 401, 403, 404, 500, 502, 503, 504]) {
    const response = new Response("Original page", { status });
    const sw = worker(async () => response);
    const actual = await navigate(sw);
    if (status < 500) assert.equal(actual, response);
    else {
      assert.equal(actual.status, 503);
      assert.match(actual.headers.get("content-type"), /text\/html/);
      assert.equal(actual.headers.get("cache-control"), "no-store");
      assert.match(await actual.text(), /We're working on it/);
    }
    assert.equal(sw.added.length, 0);
  }
});

test("network loss has a fallback even if offline storage was cleared or disabled", async () => {
  for (const options of [{}, { stored:false }, { storageFails:true }]) {
    const sw = worker(async () => { throw new Error("Network down"); }, options);
    const response = await navigate(sw, "/Purchase.html?purchase=owned");
    assert.equal(response.status, 503);
    assert.match(await response.text(), /We're working on it/);
  }
});

test("API, payment, subresource and cross-origin requests bypass the worker", () => {
  const sw = worker(async () => { throw new Error("Must not fetch"); });
  for (const [pathname, options] of [
    ["/api/purchases", {}], ["/api/checkout", { method:"POST" }],
    ["/api/paypal/capture", {}], ["/account.js", { mode:"cors" }],
    ["/Concepts.html", { url:"https://external.test/Concepts.html" }],
  ]) assert.equal(navigate(sw, pathname, options), undefined);
  assert.equal(sw.fetched.length, 0);
});

test("server-side page read failures return a friendly non-cacheable HTML response, not internal details", async t => {
  const readFile = fs.promises.readFile;
  fs.promises.readFile = async () => { throw new Error("Private server configuration"); };
  t.after(() => { fs.promises.readFile = readFile; });
  const response = await invoke("/Account.html");
  assert.equal(response.status, 503);
  assert.match(response.headers["content-type"], /text\/html/);
  assert.match(response.headers["cache-control"], /no-store/);
  assert.equal(response.headers["retry-after"], "60");
  assert.match(response.body, /We're working on it/);
  assert.doesNotMatch(response.body, /Private server configuration/);
});

test("server failures keep friendly JSON, client errors remain specific and missing pages remain 404", async () => {
  const response = { headers:{}, setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; } };
  sendError(response, new Error("Private details"));
  assert.equal(response.code, 500);
  assert.equal(response.body.error, UNAVAILABLE_MESSAGE);
  sendError(response, "Invalid password.", 401);
  assert.equal(response.code, 401);
  assert.equal(response.body.error, "Invalid password.");
  sendUnavailable(response);
  assert.equal(response.code, 503);
  assert.match(response.body, /We're working on it/);
  assert.equal((await invoke("/not-a-real-page.html")).status, 404);
});

test("application API responses and unexpected exceptions hide internal outage details without changing successful responses", async t => {
  const file = require.resolve("../api/config");
  require(file);
  const record = require.cache[file], handler = record.exports;
  t.after(() => { record.exports = handler; });
  record.exports = async (req, res) => res.status(503).json({ error:"Private configuration", enabled:false });
  const unavailable = await invoke("/api/config");
  assert.equal(unavailable.status, 503);
  assert.equal(JSON.parse(unavailable.body).error, UNAVAILABLE_MESSAGE);
  assert.equal(JSON.parse(unavailable.body).enabled, false);
  assert.match(unavailable.headers["cache-control"], /no-store/);
  record.exports = async () => { throw new Error("Private configuration"); };
  const failed = await invoke("/api/config");
  assert.equal(failed.status, 500);
  assert.equal(JSON.parse(failed.body).error, UNAVAILABLE_MESSAGE);
  assert.match(failed.headers["content-type"], /application\/json/);
  record.exports = async (req, res) => res.status(200).json({ enabled:true });
  assert.equal(JSON.parse((await invoke("/api/config")).body).enabled, true);
});
