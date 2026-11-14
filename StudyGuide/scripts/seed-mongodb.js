"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { connect } = require("../api/_mongo");

const SQL_STRING = "'((?:''|[^'])*)'";
const decode = value => value.replace(/''/g, "'");
const questionId = (prefix, values) => `${prefix}-${crypto.createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 24)}`;

function additionalRecords(root = path.join(__dirname, "..")) {
  const experiencePattern = new RegExp(`^\\(\\s*${Array(5).fill(SQL_STRING).join(",\\s*")},\\s*(true|false)\\s*\\)[,;]?$`);
  const reactPattern = new RegExp(`^\\(\\s*${Array(5).fill(SQL_STRING).join(",\\s*")},\\s*null,\\s*(true|false)\\s*\\)[,;]?$`);
  const experience = fs.readFileSync(path.join(root, "experience-questions-seed.sql"), "utf8")
    .split(/\r?\n/).filter(line => line.startsWith("('")).map(line => {
      const match = experiencePattern.exec(line);
      if (!match) throw new Error("An experience seed row could not be imported.");
      const [topic, experience_band, question, answer, example] = match.slice(1, 6).map(decode);
      return { id: questionId("mongo-experience", [topic, experience_band, question]),
        topic, experience_band, question, answer, example, company_tags: [], is_free: match[6] === "true" };
    });
  const react = fs.readFileSync(path.join(root, "react-machine-coding-seed.sql"), "utf8")
    .split(/\r?\n/).filter(line => line.startsWith("('")).map(line => {
      const match = reactPattern.exec(line);
      if (!match) throw new Error("A frontend coding seed row could not be imported.");
      const [company, topic, question, answer, example] = match.slice(1, 6).map(decode);
      return { id: questionId("mongo-react", [company, topic, question]),
        company, topic, question, answer, example, is_free: match[6] === "true" };
    });
  return { react, experience };
}

function contentRecords(root = path.join(__dirname, "..")) {
  const { react, experience } = additionalRecords(root);
  return { questions: [...require("../api/_project-questions").companies, ...react], experience_questions: experience };
}

async function seed(db, records) {
  for (const [collection, rows] of Object.entries(records)) {
    await db.collection(collection).createIndex({ id: 1 }, { unique: true });
    await db.collection(collection).bulkWrite(rows.map(row => ({
      updateOne: { filter: { id: row.id }, update: { $setOnInsert: row }, upsert: true },
    })), { ordered: false });
  }
}

if (require.main === module) {
  require("../server").loadLocalEnvironment();
  (async () => {
    const records = contentRecords();
    const { db, client } = await connect();
    try {
      await seed(db, records);
      console.log(`MongoDB content is ready: ${records.questions.length} company/frontend entries and ${records.experience_questions.length} experience entries. Existing records were preserved.`);
    } finally { await client.close(); }
  })().catch(() => {
    console.error("MongoDB content import failed. Check the private database configuration and connection.");
    process.exitCode = 1;
  });
}

module.exports = { contentRecords, seed, additionalRecords };
