"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { chromium } = require("playwright");
const { createServer } = require("../server");

async function openSite(t, options = {}) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
  });
  t.after(() => browser.close());
  const context = await browser.newContext(options);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  return { page, context, base: `http://127.0.0.1:${server.address().port}` };
}

test("all website sections share the same header and mark their own destination", async t => {
  const { page, base } = await openSite(t);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let destinations;
  for (const file of ["index.html", "Subject-QA.html", "AI-Interview.html", "Courses.html", "Concepts.html",
    "Membership.html", "Subjects.html", "Student-Plan.html", "Expert-Plan.html", "Company-Interviews.html",
    "Interview-Preparation.html", "My-Learning.html", "React-Machine-Coding.html", "Coaching.html",
    "DSA.html", "C%23Dotnet.html", "System-Design.html", "Privacy.html", "Fullstack-Angular-Dotnet.html",
    "Account.html", "Purchase.html", "Contact.html", "Terms.html", "Refund.html", "Newsletter.html",
    "Masterclass.html", "Feedback.html"]) {
    const response = await page.goto(`${base}/${file}`);
    assert.equal(response.status(), 200, file);
    const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
    assert.equal(await nav.count(), 1, file);
    assert.equal(await page.locator("[data-site-header]").count(), 1, file);
    assert.equal(await page.locator("[data-site-footer]").count(), 1, file);
    const links = await nav.locator("a").evaluateAll(items => items.map(item => item.getAttribute("href")));
    if (!destinations) destinations = links;
    else assert.deepEqual(links, destinations, file);
    const current = nav.locator('a[aria-current="page"]');
    if (await current.count()) assert.equal(await current.getAttribute("href"), `/${file}`, file);
    if (file !== "index.html") assert.equal(await page.getByRole("navigation", { name: "Breadcrumb" }).count(), 1, file);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, file);
  }
  await page.goto(base);
  const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await nav.getByRole("link", { name: "AI Interviews", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/AI-Interview.html");
  await page.locator("#start").waitFor();
  assert.equal(await page.locator("#interview-subjects, #course-topics, #concept-results").count(), 0);
  await nav.getByRole("link", { name: "Interview Q&A", exact: true }).click();
  await page.locator("#interview-subjects .interview-note").first().waitFor();
  assert.equal(new URL(page.url()).pathname, "/Subject-QA.html");
  assert.equal(await page.locator("#start, #dsa-compiler, #concept-results").count(), 0);
  await page.getByRole("navigation", { name: "Learning sections" }).getByRole("link", { name: /^AI Interviews/ }).click();
  assert.equal(new URL(page.url()).pathname, "/AI-Interview.html");
  assert.deepEqual(errors, []);
});

test("mobile navigation supports keyboard dismissal, history, resizing, and separate destinations", async t => {
  const { page, base } = await openSite(t, { viewport: { width: 390, height: 844 } });
  await page.goto(base);
  const toggle = page.getByRole("button", { name: "Menu", exact: true });
  const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  assert.equal(await nav.isVisible(), false);
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await toggle.press("Tab");
  assert.equal(await nav.getByRole("link", { name: "Home", exact: true }).evaluate(node => node === document.activeElement), true);
  const summary = nav.locator(".site-more > summary");
  await summary.click();
  await summary.press("Escape");
  assert.equal(await nav.locator(".site-more").getAttribute("open"), null);
  assert.equal(await summary.evaluate(node => node === document.activeElement), true);
  await summary.press("Escape");
  assert.equal(await nav.isVisible(), false);
  assert.equal(await toggle.evaluate(node => node === document.activeElement), true);
  await toggle.click();
  await nav.getByRole("link", { name: "AI Interviews", exact: true }).click();
  await page.locator("#start").waitFor();
  assert.equal(await nav.isVisible(), false);
  await toggle.click();
  await summary.click();
  await nav.getByRole("link", { name: "Company Interviews", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/Company-Interviews.html");
  await page.goBack();
  assert.equal(new URL(page.url()).pathname, "/AI-Interview.html");
  assert.equal(await nav.isVisible(), false);
  for (const width of [320, 768, 1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(() => {
      const button = document.querySelector(".site-menu-toggle");
      return button.hidden === (innerWidth > 1100);
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, String(width));
    if (width <= 1100) {
      await toggle.click();
      assert.equal(await nav.isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await toggle.press("Escape");
    }
  }
  await toggle.click();
  await nav.getByRole("link", { name: "Go & Pro plans", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/Membership.html");
  assert.match(await page.locator("main").innerText(), /5,000/);
});

test("navigation remains usable without JavaScript, including protected preview pages", async t => {
  const { page, base } = await openSite(t, { javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  await page.goto(base);
  const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  assert.equal(await nav.isVisible(), true);
  await nav.getByRole("link", { name: "AI Interviews", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/AI-Interview.html");
  await nav.locator("summary").click();
  await nav.getByRole("link", { name: "DSA + Compiler", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/DSA.html");
  assert.equal(await page.locator(".guide-pro-placeholder").count() > 0, true);
  await nav.getByRole("link", { name: "Courses NEW", exact: true }).click();
  assert.equal(new URL(page.url()).pathname, "/Courses.html");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
