"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("parse5");
const { renderSiteLayout } = require("../api/_site-layout");

const root = path.join(__dirname, "..");
const nodes = node => [node, ...(node.childNodes || []).flatMap(nodes)];
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;

test("shared layout replaces site chrome without changing lesson bodies, scripts, or content footers", () => {
  const content = '<main id="original"><header class="hero">Keep the lesson heading</header><pre>&lt;T&gt;</pre><footer>Keep this learning disclaimer.</footer></main>';
  const script = '<script>const text = "<header>not markup</header>";</script>';
  const source = `<!doctype html><html><head><title>Guide</title></head><body><header><nav aria-label="Primary navigation">Old navigation</nav></header>${content}<footer>Old site links</footer>${script}</body></html>`;
  const rendered = renderSiteLayout(source, "DSA.html");
  assert.ok(rendered.includes(content.slice(content.indexOf(">") + 1)));
  assert.ok(rendered.includes(script));
  assert.ok(!rendered.includes("Old navigation"));
  assert.ok(!rendered.includes("Old site links"));
  assert.match(rendered, /class="site-skip-link" href="#original"/);
  assert.match(rendered, /href="\/DSA.html" aria-current="page"/);
  assert.equal(renderSiteLayout(rendered, "DSA.html"), rendered);
});

test("every page gets one shared primary navigation with working destinations and a valid content skip target", () => {
  const documents = new Map(fs.readdirSync(root).filter(file => file.endsWith(".html"))
    .map(file => [file, fs.readFileSync(path.join(root, file), "utf8")]));
  for (const [file, source] of documents) {
    const elements = nodes(parse(renderSiteLayout(source, file)));
    const headers = elements.filter(node => attr(node, "data-site-header") !== undefined);
    assert.equal(headers.length, 1, file);
    assert.equal(elements.filter(node => attr(node, "aria-label") === "Main navigation").length, 1, file);
    assert.equal(elements.filter(node => attr(node, "data-site-footer") !== undefined).length, 1, file);
    const headerNodes = nodes(headers[0]);
    const primaryLinks = headerNodes.filter(node => node.tagName === "a");
    for (const destination of ["Subject-QA.html", "AI-Interview.html", "Courses.html", "Concepts.html", "Membership.html"]) {
      assert.ok(primaryLinks.some(node => attr(node, "href") === `/${destination}`), `${file}: ${destination}`);
    }
    for (const link of primaryLinks) {
      const url = new URL(attr(link, "href"), "http://site.test");
      const target = decodeURIComponent(url.pathname.slice(1));
      assert.ok(documents.has(target), `${file}: ${target}`);
      if (url.hash) assert.ok(nodes(parse(documents.get(target))).some(node =>
        attr(node, "id") === decodeURIComponent(url.hash.slice(1))), `${file}: ${url.hash}`);
    }
    const active = primaryLinks.filter(node => attr(node, "aria-current") === "page");
    assert.ok(active.length <= 1, file);
    if (active.length) assert.equal(decodeURIComponent(attr(active[0], "href")).slice(1), file);
    const skip = elements.find(node => attr(node, "class") === "site-skip-link");
    assert.ok(elements.some(node => attr(node, "id") === decodeURIComponent(attr(skip, "href").slice(1))), file);
  }
});
