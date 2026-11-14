"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { parse, parseFragment } = require("parse5");
const { guideTopics } = require("../api/_guide-preview");

const SOURCES = [
  ["C#Dotnet.html", "C# / .NET"],
  ["AZURECICD.html", "Azure"],
  ["System-Design.html", "System Design"],
  ["Amazon-Design.html", "System Design"],
  ["DSA.html", "Data Structures & Algorithms"],
  ["Project.html", "System Design"],
  ["Dotnet-Roadmap.html", "C# / .NET"],
];
const TOPIC_RULES = [
  ["ASP.NET Core", /asp\.net|kestrel|middleware|\bmvc\b|viewmodel|viewdata|viewbag|tempdata|model binding|action filter|razor|dependency injection|di container|options pattern/i],
  ["EF Core", /\bef core\b|entity framework|dbcontext|savechanges|asnotracking|change track|eager.*loading|lazy loading|migrations|n\+1/i],
  ["LINQ", /\blinq\b|ienumerable|iqueryable|deferred execution|expression trees|query translation/i],
  ["REST APIs", /\bapi\b|\bapis\b|\bhttp\b|\brest\b|openapi|idempotenc|pagination|graphql|grpc|problem details|rate limit/i],
  ["Identity & Security", /authenticat|authoriz|identity|security|least privilege|key vault|\bjwt\b|\boauth\b|trust boundar|protect data|payment boundary/i],
  ["Testing", /\btests?\b|testing|\bmock\b|\bstub\b|\bfake\b|assertion|test doubles/i],
  ["Microservices", /microservice|sagas?\b|outbox|event.driven|event.path|consumer|orchestration|choreography|database per service|service discovery|api gateway|cqrs/i],
  ["DevOps", /\bdevops\b|\bci[\s/-]*cd\b|pipeline|\byaml\b|hosted agents?|secrets?|deploy|rollback|release|canary|blue.green|artifacts?|feature flags|infrastructure as code|containers?|kubernetes/i],
  ["SQL", /\bsql\b|\bacid\b|database (?:transactions?|scaling|index|isolation)|relational|query plans?|constraints|normalization|composite index|rowversion|isolation levels|lost updates|blocking.*deadlocks/i],
  ["System Design", /system.design|architecture|distributed|consistency|availability|capacity|sharding|replication|cache|caching|partition|resilience|circuit break|domain.driven|bounded context|design patterns/i],
  ["Data Structures & Algorithms", /algorithms?|\bbig.o\b|binary search|two pointers|hashing|time and space cost|complexity/i],
  ["Azure", /\bazure\b|app service|service bus|managed identity|key vault/i],
  ["Behavioral", /stakeholder|mentoring|mentor a|project stor|communicat.*trade.off|onboard|new developer|productive.*reproducible|engineering leadership/i],
];
const EXAMPLE_CLASSES = new Set(["diagram", "code", "flow", "example", "formula", "memory"]);
const BLOCKS = new Set(["article", "section", "div", "p", "pre", "details", "summary",
  "h2", "h3", "h4", "h5", "ul", "ol", "li", "table", "tr", "blockquote"]);
const all = node => [node, ...(node.childNodes || []).flatMap(all)];
const rawText = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(rawText).join("");
const attribute = (node, name) => node.attrs?.find(attr => attr.name === name)?.value || "";
const classes = node => attribute(node, "class").split(/\s+/);
const clean = value => value.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

function readableText(node) {
  if (node.nodeName === "#text") return node.value.replace(/\s+/g, " ");
  if (["script", "style", "button", "input", "select", "textarea"].includes(node.tagName)) return "";
  if (node.tagName === "pre" || classes(node).includes("code")) return `\n${rawText(node).trim()}\n`;
  if (node.tagName === "br") return "\n";
  const contents = (node.childNodes || []).map(readableText).join("");
  if (node.tagName === "td" || node.tagName === "th") return `${contents.trim()} | `;
  if (node.tagName === "li") return `\n- ${contents.trim()}\n`;
  return BLOCKS.has(node.tagName) ? `\n${contents}\n` : contents;
}

function removeNodes(node, removed) {
  node.childNodes = (node.childNodes || []).filter(child => !removed.has(child));
  node.childNodes.forEach(child => removeNodes(child, removed));
}

function itemContent(item) {
  const fragment = parseFragment(item.html);
  const elements = all(fragment);
  const heading = elements.find(node => /^h[2-4]$/.test(node.tagName));
  const examples = elements.filter(node => node.tagName === "pre" ||
    classes(node).some(name => EXAMPLE_CLASSES.has(name)) ||
    node.tagName === "details" && all(node).some(child => child.tagName === "pre") ||
    node.tagName === "p" && /^(Memory|Flow|Lab|Apply):/.test(rawText(node).trim()));
  const topExamples = examples.filter(node => {
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
      if (examples.includes(parent)) return false;
    }
    return true;
  });
  const example = clean(topExamples.map(readableText).join("\n\n"));
  const removed = new Set([...topExamples, heading].filter(Boolean));
  removeNodes(fragment, removed);
  let answer = clean(readableText(fragment));
  if (!answer && example) return { answer: example, example: "" };
  if (!answer) return null;
  return { answer, example };
}

function sourceContext(source, items) {
  const headings = new Map();
  for (const node of all(parse(source)).filter(node => /^h[2-4]$/.test(node.tagName))) {
    const title = rawText(node).trim();
    if (!headings.has(title)) headings.set(title, []);
    headings.get(title).push(node);
  }
  return items.map(item => {
    const heading = headings.get(item.title)?.shift();
    let section = heading?.parentNode;
    while (section && section.tagName !== "section") section = section.parentNode;
    return {
      item,
      section: section ? rawText(all(section).find(node => node.tagName === "h2") || heading).trim() : "",
      sectionId: section ? attribute(section, "id") : "",
    };
  });
}

function topicsFor(page, title, section, primary) {
  const topics = new Set([primary]);
  const searchable = page === "Dotnet-Roadmap.html" ? `${title} ${section}` : title;
  for (const [topic, pattern] of TOPIC_RULES) {
    if (pattern.test(searchable)) topics.add(topic);
  }
  if (page === "C#Dotnet.html" && /Entity Framework Core/.test(section)) topics.add("EF Core");
  if (page === "C#Dotnet.html" && /ASP.NET Core/.test(section)) topics.add("ASP.NET Core");
  if (page === "Project.html" && /Microservices in Practice/.test(section)) topics.add("Microservices");
  return [...topics];
}

function importGuideQuestions(directory) {
  const imported = [];
  for (const [page, primary] of SOURCES) {
    const source = fs.readFileSync(path.join(directory, page), "utf8");
    const items = guideTopics(page, source, directory, page).flatMap(topic => topic.items);
    for (const { item, section, sectionId } of sourceContext(source, items)) {
      if (page === "Project.html" && !/Microservices in Practice|Low-Level Design/.test(section)) continue;
      if (page === "System-Design.html" && /Your learning path/.test(section)) continue;
      const content = itemContent(item);
      if (!content) throw new Error(`Guide item has no explanation: ${page}: ${item.title}`);
      let question = item.title.replace(/^\d+[.)]\s*/, "").trim();
      let practice_type = /\?|^(what|why|how|when|explain)\b/i.test(question) ? "Interview Q&A" : "Concept review";
      if (all(parseFragment(item.html)).some(node => classes(node).includes("term"))) {
        const term = question.split(":")[0];
        question = `What does ${term} mean in system design?`;
        practice_type = "Concept review";
      }
      if (page === "DSA.html") {
        question = `Solve: ${question}`;
        practice_type = "Coding problem";
      }
      if (page === "Dotnet-Roadmap.html") {
        const paragraph = all(parseFragment(item.html)).find(node =>
          node.tagName === "p" && rawText(node).startsWith("Interview question:"));
        if (!paragraph) throw new Error(`Roadmap interview question is missing: ${item.title}`);
        question = rawText(paragraph).replace(/^Interview question:\s*/, "");
        content.answer = content.answer.replace(/Interview question:[^\n]*(?:\n|$)/, "").trim();
        practice_type = "Guided interview exercise";
      }
      for (const topic of topicsFor(page, question, page === "Dotnet-Roadmap.html" ? item.title : section, primary)) {
        imported.push({
          company: "Subject practice", topic, question, ...content, practice_type,
          source_page: page, source_title: item.title, source_section: section,
          source_anchor: sectionId,
        });
      }
    }
  }
  return imported;
}

module.exports = { importGuideQuestions, itemContent, topicsFor };
