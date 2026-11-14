const { sendError } = require("./_shared");
const { learningAccess, learningData } = require("./_learning-content");
const projectBank = require("./_project-questions");
const { consumeGrant } = require("./_pin-grants");
const { freePreviewIds, hasInterviewAccess } = require("./_pro-policy");

const TOPICS = new Set([
  "All subjects",
  "C# / .NET",
  "Angular",
  "Azure",
  "SQL",
  "System Design",
  "JavaScript / TypeScript",
  "EF Core",
  "LINQ",
  "Behavioral",
  "ASP.NET Core",
  "REST APIs",
  "Testing",
  "Data Structures & Algorithms",
  "DevOps",
  "Identity & Security",
  "Microservices",
]);
const LEVELS = new Set(["0-2 years", "3-5 years", "6-10 years", "10+ years"]);

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const topic = typeof req.query?.topic === "string" ? req.query.topic : "";
  const level = typeof req.query?.level === "string" ? req.query.level : "";
  const questionId = req.query?.questionId;
  if (!TOPICS.has(topic) || !LEVELS.has(level)) {
    return res.status(400).json({ error: "Choose a supported technology and experience range." });
  }
  if (questionId !== undefined && (typeof questionId !== "string" || !questionId || questionId.length > 200)) {
    return res.status(400).json({ error: "Choose a valid question." });
  }

  try {
    const cookieAccess = questionId ? consumeGrant(req, `experience:${questionId}`) : false;
    const topicFilter = topic === "All subjects" ? "" : `topic=eq.${encodeURIComponent(topic)}&`;
    const query = `experience_questions?${topicFilter}select=id,topic,experience_band,question,answer,example,company_tags&order=topic.asc,question.asc,id.asc`;
    const fallback = projectBank.experience.filter(item => topic === "All subjects" || item.topic === topic);
    const [{ user, entitlements, verificationUnavailable }, results] = await Promise.all([
      learningAccess(req, { skip: cookieAccess }), learningData(query, fallback),
    ]);
    const isPro = hasInterviewAccess(entitlements);
    const questionsByTopic = new Map();
    for (const question of results) {
      if (!questionsByTopic.has(question.topic)) questionsByTopic.set(question.topic, new Map());
      const byLevel = questionsByTopic.get(question.topic);
      if (!byLevel.has(question.experience_band)) byLevel.set(question.experience_band, []);
      byLevel.get(question.experience_band).push(question);
    }
    const orderedResults = [];
    for (const topicName of [...questionsByTopic.keys()].sort()) {
      const byLevel = questionsByTopic.get(topicName);
      for (const questions of byLevel.values()) {
        questions.sort((left, right) => left.question.localeCompare(right.question) || left.id.localeCompare(right.id));
      }
      const maxQuestionsAtLevel = Math.max(...[...byLevel.values()].map(questions => questions.length));
      for (let position = 0; position < maxQuestionsAtLevel; position++) {
        for (const levelName of LEVELS) {
          const question = byLevel.get(levelName)?.[position];
          if (question) orderedResults.push(question);
        }
      }
    }
    const freeIds = freePreviewIds(orderedResults, question => question.topic);
    const selected = orderedResults.filter(question => question.experience_band === level &&
      (topic === "All subjects" || question.topic === topic) &&
      (questionId === undefined || String(question.id) === questionId));
    if (questionId && !selected.length) return res.status(404).json({ error: "Question not found." });
    if (questionId && !isPro && !cookieAccess && !freeIds.has(selected[0].id)) {
      return res.status(403).json({ error: "Enter the PIN for this Pro question." });
    }
    const available = selected
      .filter(question => isPro || cookieAccess || freeIds.has(question.id))
      .map(question => ({ ...question, is_free: freeIds.has(question.id) }));
    const locked = isPro || cookieAccess
      ? []
      : selected
        .filter(question => !freeIds.has(question.id))
        .map(({ id, topic, company_tags }) => ({ id, topic, company_tags }));

    return res.status(200).json({
      questions: available,
      locked,
      access: { signedIn: Boolean(user), premium: isPro,
        ...(verificationUnavailable ? { verificationUnavailable: true } : {}) },
      topic,
      level,
    });
  } catch (error) {
    return sendError(res, error);
  }
};
