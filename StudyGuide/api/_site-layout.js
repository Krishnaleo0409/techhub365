"use strict";

const { parse } = require("parse5");
const { mongoEnabled } = require("./_mongo");
const { planOffers } = require("./_pricing");

const PRIMARY = [
  ["index.html", "Home"],
  ["Courses.html", "Courses", "nav-course-link"],
  ["Concepts.html", "Concepts", "nav-concept-link"],
  ["Subject-QA.html", "Interview Q&A"],
  ["AI-Interview.html", "AI Interviews"],
  ["Membership.html", "Go & Pro plans"],
];
const GROUPS = [
  ["Learn", [
    ["Fullstack-Angular-Dotnet.html", "Angular + .NET: 0-5 years"],
    ["Subjects.html", "All subjects"],
    ["Student-Plan.html", "Student Plan"],
    ["Expert-Plan.html", "Expert Plan"],
    ["My-Learning.html", "My Learning"],
  ]],
  ["Practice", [
    ["Company-Interviews.html", "Company Interviews"],
    ["Interview-Preparation.html", "Interview Preparation"],
    ["DSA.html", "DSA + Compiler"],
    ["React-Machine-Coding.html", "Frontend Coding"],
    ["Interview-Studio.html", "Interview Studio"],
  ]],
  ["Connect", [
    ["Coaching.html", "1:1 Coaching"],
    ["Masterclass.html", "Masterclasses"],
    ["Newsletter.html", "Newsletter"],
    ["Feedback.html", "Feedback"],
  ]],
];
const GUIDE_NAMES = {
  "c#dotnet.html": "C# and .NET guide",
  "dotnet-roadmap.html": ".NET learning roadmap",
  "system-design.html": "System Design guide",
  "amazon-design.html": "Marketplace Design guide",
  "azurecicd.html": "Azure and CI/CD guide",
  "azurecicd - copy.html": "Azure and CI/CD guide",
  "how ai work.html": "AI concepts guide",
  "project.html": "Application Architecture guide",
  "privacy.html": "Privacy",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function attribute(node, name) {
  return node.attrs?.find(attr => attr.name === name)?.value;
}

function walk(node, result = []) {
  result.push(node);
  for (const child of node.childNodes || []) walk(child, result);
  return result;
}

function renderLink([href, label, className], page, badges = false, current = true) {
  const active = current && href.toLowerCase() === page;
  const badge = badges && className ? ' <span class="nav-new">NEW</span>' : "";
  return `<a href="/${encodeURI(href).replace(/#/g, "%23")}"${className && badges ? ` class="${className}"` : ""}${active ? ' aria-current="page"' : ""}>${escapeHtml(label)}${badge}</a>`;
}

function renderHeader(page, mainId) {
  const secondaryActive = GROUPS.some(([, links]) => links.some(([href]) => href.toLowerCase() === page));
  return `<a class="site-skip-link" href="#${escapeHtml(encodeURIComponent(mainId))}">Skip to content</a>
<header class="site-header" data-site-header>
  <div class="site-header-inner">
    <a class="site-brand" href="/index.html" aria-label="KR7Tech home">KR7<span>Tech</span></a>
    <button class="site-menu-toggle" type="button" aria-controls="site-primary-navigation" aria-expanded="false" hidden>Menu</button>
    <nav id="site-primary-navigation" class="site-primary-nav topnav" aria-label="Main navigation">
      ${PRIMARY.map(item => renderLink(item, page, true)).join("\n      ")}
      <details class="site-more"${secondaryActive ? ' data-current-section="true"' : ""}>
        <summary>More <span class="site-chevron" aria-hidden="true"></span></summary>
        <div class="site-more-panel">
          ${GROUPS.map(([heading, links]) => `<section><h2>${heading}</h2>${links.map(item => renderLink(item, page)).join("")}</section>`).join("")}
        </div>
      </details>
      <a class="site-account-link" href="/Account.html"${page === "account.html" ? ' aria-current="page"' : ""}>Account</a>
      <a class="site-pin-button" href="/Membership.html#purchase">Choose a plan</a>
    </nav>
  </div>
  ${page === "unavailable.html" ? "" : renderOffer()}
</header>`;
}

function renderOffer() {
  const offers = planOffers();
  const price = tier => new Intl.NumberFormat("en-IN").format(offers[tier].amount);
  return `<aside class="site-offer" aria-label="Membership offer"><strong>Grab ${offers.Go.discountPercent}% off Go &amp; Pro</strong>
    <span>Go INR ${price("Go")} &middot; Pro INR ${price("Pro")} &middot; One-time INR purchases only</span>
    <a href="/Membership.html#purchase">Grab the offer</a></aside>`;
}

function renderFooter(page) {
  const groups = [
    ["Learn", [PRIMARY[1], PRIMARY[2], ...GROUPS[0][1]]],
    ["Practice", [PRIMARY[3], PRIMARY[4], ...GROUPS[1][1]]],
    ["Support", [["Contact.html", "Contact support"], ["Purchase.html", "My purchases"], PRIMARY[5],
      ["Account.html", "Account"], ["Terms.html", "Terms of use"], ["Refund.html", "Payments & refunds"], ["Privacy.html", "Privacy"]]],
  ];
  return `<footer class="site-footer" data-site-footer>
  <div class="site-footer-inner">
    <div class="site-footer-intro"><a class="site-brand" href="/index.html" aria-label="KR7Tech home">KR7<span>Tech</span></a>
      <p>Learn the concepts. Practise your answers. Build with confidence.</p>
      <p>Courses explain topics; Interview Q&amp;A and AI Interviews help you practise.</p>
    </div>
    <nav class="site-footer-links" aria-label="Footer navigation">${groups.map(([heading, links]) =>
      `<section><h2>${heading}</h2>${links.map(item => renderLink(item, page, false, false)).join("")}</section>`).join("")}</nav>
    <p class="site-footer-note">Try free previews. Choose Go or Pro for more access. One-time payments; no automatic renewal. Learning and practice do not guarantee a job or interview result.</p>
  </div>
</footer>`;
}

function renderSiteLayout(html, filename) {
  const nodes = walk(parse(html, { sourceCodeLocationInfo: true }));
  if (nodes.some(node => node.tagName === "header" && attribute(node, "data-site-header") !== undefined)) return html;
  const body = nodes.find(node => node.tagName === "body");
  const head = nodes.find(node => node.tagName === "head");
  if (!body?.sourceCodeLocation?.startTag || !head?.sourceCodeLocation?.endTag) return html;
  const page = String(filename).toLowerCase();
  const main = nodes.find(node => node.tagName === "main" && node.sourceCodeLocation);
  const mainId = attribute(main || {}, "id") || "site-main-content";
  const header = (body.childNodes || []).find(node => node.tagName === "header") ||
    nodes.find(node => node.tagName === "header" && walk(node).some(child =>
      child.tagName === "nav" && /^(main|primary) navigation$/i.test(attribute(child, "aria-label") || "")));
  const footer = (body.childNodes || []).find(node => node.tagName === "footer");
  const edits = [];
  function insert(offset, text) {
    edits.push({ start: offset, end: offset, text });
  }
  function replace(node, text) {
    const location = node.sourceCodeLocation;
    edits.push({ start: location.startOffset, end: location.endOffset, text });
  }
  insert(head.sourceCodeLocation.startTag.endOffset,
    '\n<link rel="stylesheet" href="/service-status.css"><script src="/service-status.js"></script>\n');
  insert(head.sourceCodeLocation.endTag.startOffset,
    '<link rel="stylesheet" href="/site-navigation.css"><script src="/site-navigation.js" defer></script>\n');
  if (header) replace(header, renderHeader(page, mainId));
  else insert(body.sourceCodeLocation.startTag.endOffset, renderHeader(page, mainId));
  if (footer) replace(footer, renderFooter(page));
  else insert(body.sourceCodeLocation.endTag?.startOffset || html.length, renderFooter(page));
  if (mongoEnabled()) {
    const root = nodes.find(node => node.tagName === "html");
    if (root?.sourceCodeLocation?.startTag) insert(root.sourceCodeLocation.startTag.endOffset - 1, ' data-auth-provider="mongodb"');
    for (const node of nodes) {
      if (node.tagName !== "a" || !/^\/?Company-Interviews\.html#access-heading$/i.test(attribute(node, "href") || "")) continue;
      const location = node.sourceCodeLocation?.attrs?.href;
      if (!location || [header, footer].some(container => container &&
          location.startOffset >= container.sourceCodeLocation.startOffset &&
          location.endOffset <= container.sourceCodeLocation.endOffset)) continue;
      edits.push({ start: location.startOffset, end: location.endOffset, text: 'href="/Account.html"' });
    }
  }
  if (main) {
    if (!attribute(main, "id")) insert(main.sourceCodeLocation.startTag.endOffset - 1, ' id="site-main-content" tabindex="-1"');
    const label = [...PRIMARY, ...GROUPS.flatMap(([, links]) => links), ["Account.html", "Account"],
      ["Purchase.html", "My purchases"], ["Terms.html", "Terms of use"], ["Refund.html", "Payments & refunds"], ["Contact.html", "Contact support"]]
      .find(([href]) => href.toLowerCase() === page)?.[1] || GUIDE_NAMES[page];
    if (page !== "index.html" && label) {
      insert(main.sourceCodeLocation.startTag.endOffset,
        `<nav class="site-breadcrumb" aria-label="Breadcrumb"><a href="/index.html">Home</a><span aria-hidden="true">/</span><span>${escapeHtml(label)}</span></nav>`);
    }
  } else {
    insert(body.sourceCodeLocation.startTag.endOffset, '<span id="site-main-content" tabindex="-1"></span>');
  }
  // Source offsets preserve scripts and guide bodies exactly as authored.
  return edits.sort((a, b) => b.start - a.start).reduce((result, edit) =>
    result.slice(0, edit.start) + edit.text + result.slice(edit.end), html);
}

module.exports = { renderSiteLayout };
