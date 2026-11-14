(() => {
  const form = document.getElementById("experience-form");
  if (!form) return;

  const topic = document.getElementById("experience-topic");
  const level = document.getElementById("experience-level");
  const company = document.getElementById("experience-company");
  const list = document.getElementById("experience-results");
  const status = document.getElementById("experience-status");
  const signInLink = document.getElementById("experience-sign-in");
  const sessionKey = "visual-memory-lab.auth-session";

  function node(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function appendCompanyTags(card, companyTags) {
    if (!Array.isArray(companyTags) || !companyTags.length) return;
    const tags = node("div", "experience-company-tags", "Company prep:");
    companyTags.forEach(name => tags.append(node("span", "", name)));
    card.append(tags);
  }

  function sessionToken() {
    try {
      const session = JSON.parse(localStorage.getItem(sessionKey) || "null");
      return typeof session?.access_token === "string" ? session.access_token : null;
    } catch (error) {
      status.textContent = "Could not read the saved sign-in session. Please sign in again.";
      return null;
    }
  }

  function renderQuestion(question, index) {
    const card = node("article", "experience-card qa-card");
    const levelNames = {
      "0-2 years": "Foundations",
      "3-5 years": "Mid-level",
      "6-10 years": "Advanced",
      "10+ years": "Senior / expert",
    };
    const header = node("header", "qa-question-block");
    const meta = node("div", "qa-meta");
    meta.append(node("span", "qa-label qa-question-label", `Question ${String(index + 1).padStart(2, "0")}`),
      node("span", question.is_free ? "qa-access" : "qa-access pro", question.is_free ? "FREE PREVIEW" : "PRO"));
    header.append(meta, node("h3", "qa-title", question.question),
      node("p", "experience-card-meta", `${question.topic} · ${question.experience_band} · ${levelNames[question.experience_band] || "Interview practice"}`));
    appendCompanyTags(header, question.company_tags);
    const answer = node("div", "qa-answer-block");
    answer.append(node("p", "qa-label", "Answer"), node("p", "experience-answer", question.answer));
    const example = node("div", "qa-code-block");
    example.append(node("p", "qa-label", "Practical example"), node("pre", "experience-example", question.example));
    card.append(header, answer, example);
    return card;
  }

  function renderLocked(question, selectedTopic, selectedLevel) {
    const card = node("article", "experience-card locked");
    card.append(node("p", "experience-locked-preview", "🔒 Pro question · unlock to view"));
    card.append(node("p", "experience-answer", "The question, answer, and example are included with a Pro subscription."));
    const upgrade = node("button", "experience-upgrade", "Unlock Pro - Enter PIN");
    upgrade.type = "button";
    upgrade.dataset.proUnlock = "";
    upgrade.dataset.proResource = `experience:${question.id}`;
    upgrade.dataset.pinKind = "experience";
    upgrade.dataset.pinUrl = `/api/experience-questions?${new URLSearchParams({
      topic: selectedTopic, level: selectedLevel, questionId: question.id,
    })}`;
    card.append(upgrade);
    const unlock = node("button", "experience-upgrade", "Unlock Pro for local testing");
    unlock.type = "button";
    unlock.dataset.localProUnlock = "";
    unlock.hidden = true;
    card.append(unlock);
    list.append(card);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const selectedTopic = topic.value;
    const selectedLevel = level.value;
    const selectedCompany = company.value;
    const token = sessionToken();
    signInLink.href = "Membership.html";
    list.replaceChildren();
    status.textContent = "Loading questions for your selected experience…";
    form.querySelector("button[type=submit]").disabled = true;
    try {
      let data;
      if (window.location.protocol === "file:") {
        data = {
          questions: [],
          locked: [],
          access: { premium: false },
          localUnavailable: true,
        };
      } else {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const query = new URLSearchParams({ topic: selectedTopic, level: selectedLevel });
        const response = await fetch(`/api/experience-questions?${query}`, { headers });
        data = await response.json();
        if (!response.ok) throw new Error(data.error || `Could not load questions (${response.status}).`);
      }

      const visibleQuestions = data.questions.filter(question =>
        selectedCompany === "All companies" || question.company_tags?.includes(selectedCompany),
      );
      const visibleLocked = data.locked.filter(question =>
        selectedCompany === "All companies" || question.company_tags?.includes(selectedCompany),
      );
      visibleQuestions.forEach((question, index) => list.append(renderQuestion(question, index)));
      visibleLocked.forEach(question => renderLocked(question, selectedTopic, selectedLevel));
      if (data.localUnavailable) {
        status.textContent = "Interview questions are not available when this page is opened as a local file. Open KR7Tech through its app server to load free previews and Pro-locked content safely.";
      } else if (!data.questions.length && !data.locked.length) {
        status.textContent = "No interview questions are configured yet. Run experience-questions-seed.sql in Supabase, then try again.";
      } else if (!visibleQuestions.length && !visibleLocked.length) {
        status.textContent = `No questions match ${selectedCompany} preparation for ${selectedTopic} at ${selectedLevel}. Try another company or choose All companies.`;
      } else {
        const subjectLabel = selectedTopic === "All subjects" ? "All subjects" : selectedTopic;
        const companyLabel = selectedCompany === "All companies" ? "" : ` · ${selectedCompany} prep`;
        status.textContent = `${subjectLabel} · ${selectedLevel}${companyLabel}: ${visibleQuestions.length} answer${visibleQuestions.length === 1 ? "" : "s"} available${visibleLocked.length ? ` · ${visibleLocked.length} Pro answer${visibleLocked.length === 1 ? "" : "s"} locked` : ""}.`;
      }
    } catch (error) {
      list.replaceChildren();
      status.textContent = error.message || "Questions could not be loaded. Please try again.";
    } finally {
      form.querySelector("button[type=submit]").disabled = false;
    }
  });
  document.addEventListener("kr7:pin-content", event => {
    const { button, data } = event.detail;
    if (button.dataset.pinKind !== "experience") return;
    const locked = button.closest(".experience-card.locked");
    const question = data.questions?.[0];
    if (!locked || !question) return;
    const opened = renderQuestion(question, [...list.children].indexOf(locked));
    opened.dataset.pinOpened = "";
    const close = node("button", "experience-upgrade", "Close and lock this question");
    close.type = "button";
    close.addEventListener("click", () => opened.replaceWith(locked));
    opened.append(close);
    locked.replaceWith(opened);
  });
})();
