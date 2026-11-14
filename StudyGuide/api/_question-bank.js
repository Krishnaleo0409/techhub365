"use strict";

function questionKey(question) {
  const prompt = question.question.normalize("NFKC").trim().replace(/^\d+[.)]\s+/, "")
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[?!.]+$/, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
  return `${question.topic}\0${prompt}`;
}

function mergeQuestions(...banks) {
  const seen = new Set();
  return banks.flat().filter(question => {
    const key = questionKey(question);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { questionKey, mergeQuestions };
