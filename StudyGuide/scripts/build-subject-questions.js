"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { COURSES } = require("../learning-catalog");
const { mergeQuestions } = require("../api/_question-bank");
const { importGuideQuestions } = require("./import-guide-questions");
const { additionalRecords } = require("./seed-mongodb");
const csharpPractice = require("../api/_csharp-practice");
const interviewPractice = require("../api/_interview-practice");

const root = path.join(__dirname, "..");
const SQL_STRING = "'((?:''|[^'])*)'";
const experienceRow = new RegExp(`^\\(\\s*${Array(5).fill(SQL_STRING).join(",\\s*")},\\s*(true|false)\\s*\\)[,;]?$`);
const companyRow = new RegExp(`values\\s*\\(\\s*${Array(5).fill(SQL_STRING).join(",\\s*")},\\s*(?:${SQL_STRING}|null),\\s*(true|false)\\s*\\)`, "i");
const decode = value => value.replace(/''/g, "'");
const questionId = (prefix, values) => `${prefix}-${crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 24)}`;

function buildBank() {
  const experience = fs.readFileSync(path.join(root, "experience-questions-seed.sql"), "utf8")
    .split(/\r?\n/).filter(line => line.startsWith("('")).map(line => {
      const match = experienceRow.exec(line);
      if (!match) throw new Error("An experience seed row could not be imported.");
      const [topic, experience_band, question, answer, example] = match.slice(1, 6).map(decode);
      return {
        id: questionId("project-subject", [topic, experience_band, question]),
        company: "Subject practice", topic, experience_band, question, answer, example,
      };
    });
  const subjects = [];
  const levels = ["0-2 years", "3-5 years", "6-10 years", "10+ years"];
  for (const course of COURSES.filter(item => item.kind === "Interview Q&A")) {
    const groups = levels.map(level => experience.filter(item => item.topic === course.topic && item.experience_band === level));
    const seen = new Set();
    for (let index = 0; index < Math.max(...groups.map(group => group.length)); index++) {
      for (const group of groups) {
        const item = group[index];
        if (!item || seen.has(item.question)) continue;
        seen.add(item.question);
        subjects.push(item);
      }
    }
    if (seen.size <= 10) throw new Error(`${course.topic} needs at least 11 distinct project questions.`);
  }
  const companies = fs.readFileSync(path.join(root, "supabase", "seed.sql"), "utf8")
    .split(/\r?\n/).filter(line => line.startsWith("insert into public.questions")).map(line => {
      const match = companyRow.exec(line);
      if (!match) throw new Error("A company seed row could not be imported.");
      const [company, topic, question, answer, example] = match.slice(1, 6).map(decode);
      return { id: questionId("project-company", [company, topic, question]), company, topic, question, answer, example };
    });
  const guideQuestions = importGuideQuestions(root).map(item => ({
    id: questionId("project-guide", [item.topic, item.source_page, item.question]), ...item,
  }));
  const companyPractice = companies.map(item => ({
    ...item, id: questionId("project-practice", [item.topic, item.question]),
    company: "Subject practice", practice_type: "Representative company Q&A",
    source_page: "Company-Interviews.html",
  }));
  const originalPractice = csharpPractice.map(item => ({
    id: questionId("kr7-csharp", [item.question]),
    company: "Subject practice", topic: "C# / .NET",
    practice_type: "Original C# interview practice", ...item,
  }));
  const expandedPractice = interviewPractice.map(item => ({
    id: questionId("kr7-interview", [item.topic, item.question]),
    company: "Subject practice", ...item,
  }));
  return { subjects: mergeQuestions(subjects, companyPractice, guideQuestions, originalPractice, expandedPractice),
    companies, ...additionalRecords(root) };
}

function generatedSource(bank) {
  return `"use strict";\n\n// Generated from project seeds, guides, and original practice by npm run build:questions. Server-only.\nmodule.exports = ${JSON.stringify(bank, null, 2)};\n`;
}

if (require.main === module) {
  const bank = buildBank();
  fs.writeFileSync(path.join(root, "api", "_project-questions.js"), generatedSource(bank));
  console.log(`Imported ${bank.subjects.length} subject practice entries and ${bank.companies.length} company questions into the private server bank.`);
}

module.exports = { buildBank, generatedSource };
