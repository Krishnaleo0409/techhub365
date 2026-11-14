"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { buildPlan } = require("../student-plan");

const options = {
  subjects: ["dotnet", "sql", "apis"], startDate: "2026-11-12",
  months: 3, daysPerWeek: 5, hoursPerDay: 2, budget: 3000, currency: "INR",
};

test("Student Plan allocates each study day once across selected subjects with dates and budget", () => {
  const plan = buildPlan(options);
  assert.equal(plan.endDate, "2027-02-11");
  assert.equal(plan.subjectPlans.length, 3);
  assert.equal(plan.budget, 3000);
  assert.equal(plan.totalHours, plan.sessions.length * 2);
  assert.equal(new Set(plan.sessions.map(session => session.date)).size, plan.sessions.length);
  assert.ok(plan.subjectPlans.every(item => item.sessions.length > 0));
  assert.ok(Math.max(...plan.subjectPlans.map(item => item.sessions.length)) -
    Math.min(...plan.subjectPlans.map(item => item.sessions.length)) <= 1);
  for (const session of plan.sessions) {
    const weekday = new Date(`${session.date}T00:00:00Z`).getUTCDay();
    assert.ok(weekday !== 0 && weekday !== 6);
    assert.ok(session.date >= plan.startDate && session.date <= plan.endDate);
  }
  assert.ok(plan.subjectPlans.every(item => /Review/.test(item.sessions.at(-1).focus)));
});

test("month-end and leap-year schedules use real calendar months without overflowing", () => {
  const january = buildPlan({ ...options, subjects: ["dotnet"], startDate: "2026-01-31", months: 1, daysPerWeek: 7 });
  assert.equal(january.endDate, "2026-02-27");
  assert.equal(january.sessions.length, 28);
  const leap = buildPlan({ ...options, subjects: ["dotnet"], startDate: "2028-02-01", months: 1, daysPerWeek: 7, budget: null });
  assert.equal(leap.endDate, "2028-02-29");
  assert.equal(leap.sessions.length, 29);
  assert.equal(leap.budget, null);
});

test("invalid inputs cannot generate misleading or empty Student Plans", () => {
  for (const overrides of [
    { subjects: [] }, { subjects: ["unknown"] }, { startDate: "2026-02-30" },
    { startDate: "bad-date" }, { months: 0 }, { months: 13 }, { months: 1.5 },
    { daysPerWeek: 0 }, { daysPerWeek: 8 }, { hoursPerDay: NaN }, { hoursPerDay: 9 },
    { budget: -1 }, { budget: Infinity }, { currency: "unknown" },
    { subjects: ["dotnet", "sql", "apis", "azure", "dsa"], startDate: "2026-02-01", months: 1, daysPerWeek: 1 },
  ]) {
    assert.throws(() => buildPlan({ ...options, ...overrides }));
  }
});
