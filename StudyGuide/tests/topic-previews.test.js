"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { guideTopics, learningGuideTopics, guidePracticeItems } = require("../api/_guide-preview");
const { renderPreviewPage } = require("../api/serve-page");
const { createServer } = require("../server");
const root = path.join(__dirname, "..");

test("every guide exposes only its first ten items, with no paid titles, answers, or data scripts", () => {
  const pages = require("../vercel.json").rewrites
    .map(route => new URL(route.destination, "http://localhost").searchParams.get("page"))
    .filter(Boolean);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const topics = learningGuideTopics(page, html, root, page);
    const preview = renderPreviewPage(page);
    const items = topics.flatMap(topic => topic.items);
    assert.equal((preview.match(/data-free-item/g) || []).length, Math.min(10, items.length), page);
    assert.equal((preview.match(/data-pro-item/g) || []).length, Math.max(0, items.length - 10), page);
    for (const item of items.slice(10)) {
      if (item.title.length > 20 && !items.slice(0, 10).some(free => free.html.includes(item.title))) {
        assert.ok(!preview.includes(item.html), `${page}: paid content must be absent`);
      }
    }
    assert.doesNotMatch(preview, /const (?:DATA|problems|roadmapWeeks) =/);
    assert.doesNotMatch(preview, /src="(?:dotnet-roadmap|interview-studio)\.js"/);
    assert.match(preview, /data-pro-unlock/);
  }
});

test("appended concept exercises preserve guide indices and are absent from every public preview", () => {
  for (const page of ["C#Dotnet.html", "Dotnet-Roadmap.html", "System-Design.html", "Amazon-Design.html",
    "Project.html", "AZURECICD.html", "AZURECICD - Copy.html", "DSA.html"]) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const original = guideTopics(page, html, root, page)[0].items;
    const expanded = learningGuideTopics(page, html, root, page)[0].items;
    assert.deepEqual(expanded.slice(0, original.length), original, page);
    assert.deepEqual(expanded.slice(original.length), guidePracticeItems(page), page);
    const preview = renderPreviewPage(page);
    for (const item of guidePracticeItems(page)) {
      assert.ok(!preview.includes(item.title), `${page}: new title must not be sent to a visitor`);
      assert.ok(!preview.includes(item.html), `${page}: new answer must not be sent to a visitor`);
    }
  }
});

test("protected pages and data scripts cannot bypass preview access through URL casing", async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const page of ["/C%23Dotnet.html", "/c%23dotnet.HTML", "/DSA.HTML", "/AZURECICD.HTML"]) {
    const response = await fetch(`${base}${page}`);
    assert.equal(response.status, 200);
    assert.equal((await response.text()).match(/data-free-item/g)?.length, 10, page);
  }
  for (const asset of ["/dotnet-roadmap.js", "/DOTNET-ROADMAP.JS", "/interview-studio.js"]) {
    const response = await fetch(`${base}${asset}`);
    assert.equal(response.status, 403, asset);
    assert.doesNotMatch(await response.text(), /roadmapWeeks|incidentStages/);
  }
});

test("nested exercise sections appear once rather than duplicating free questions", () => {
  const preview = renderPreviewPage("Interview-Studio.html");
  assert.equal((preview.match(/data-free-item/g) || []).length, 5);
  assert.equal((preview.match(/id="debugging"/g) || []).length, 1);
});
