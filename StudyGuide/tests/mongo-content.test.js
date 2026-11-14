"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { contentRecords, seed } = require("../scripts/seed-mongodb");

test("MongoDB content import preserves existing question seeds and produces stable IDs without account data", async () => {
  const records = contentRecords();
  const original = require("../api/_project-questions");
  assert.equal(records.questions.filter(row => row.company !== "React").length, original.companies.length);
  assert.ok(records.questions.filter(row => row.company === "React").length > 10);
  assert.ok(records.experience_questions.length > 100);
  assert.equal(new Set(records.questions.map(row => row.id)).size, records.questions.length);
  assert.equal(new Set(records.experience_questions.map(row => row.id)).size, records.experience_questions.length);
  assert.deepEqual(contentRecords(), records);
  const writes = [];
  await seed({ collection: name => ({
    async createIndex() {},
    async bulkWrite(operations) { writes.push({ name, operations }); },
  }) }, records);
  assert.deepEqual(writes.map(item => item.name), ["questions", "experience_questions"]);
  for (const { operations } of writes) {
    assert.ok(operations.every(operation => operation.updateOne?.upsert === true &&
      operation.updateOne.filter.id === operation.updateOne.update.$setOnInsert.id));
    assert.ok(operations.every(operation => !operation.deleteOne && !operation.deleteMany));
  }
});
