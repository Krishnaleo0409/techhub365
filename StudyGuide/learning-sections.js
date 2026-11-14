(() => {
  "use strict";
  const sections = [
    ["courses", "Courses", "Topic-by-topic explanations and worked examples.", "Courses.html"],
    ["concepts", "Concept Library", "Mental models, cheat sheets, and practical foundations.", "Concepts.html"],
    ["interview", "Interview Q&A", "Subject-wise interview questions and detailed answers.", "Subject-QA.html"],
    ["ai-interview", "AI Interviews", "Run a role-focused mock interview and review AI feedback.", "AI-Interview.html"],
    ["coding", "Coding Practice", "DSA problems, reference solutions, and the code compiler.", "DSA.html"],
    ["companies", "Company Interviews", "Company-focused interview question banks.", "Company-Interviews.html"],
    ["preparation", "Interview Preparation", "Experience-based practice and a structured preparation plan.", "Interview-Preparation.html"],
  ];
  document.querySelectorAll("[data-learning-sections]").forEach(navigation => {
    const links = sections.map(([id, title, description, href], index) => {
      const link = document.createElement("a");
      link.className = "study-note section-note";
      link.href = href;
      link.dataset.section = id;
      if (location.pathname.toLowerCase().endsWith(`/${href.toLowerCase()}`)) link.setAttribute("aria-current", "page");
      const label = document.createElement("span");
      label.className = "note-label";
      label.setAttribute("aria-hidden", "true");
      label.textContent = `SECTION ${String(index + 1).padStart(2, "0")}`;
      if (id === "courses" || id === "concepts") {
        const badge = document.createElement("span");
        badge.className = "nav-new";
        badge.textContent = "NEW";
        label.append(" ", badge);
      }
      const heading = document.createElement("strong");
      heading.className = "note-title";
      heading.textContent = title;
      const copy = document.createElement("span");
      copy.className = "note-copy";
      copy.textContent = description;
      link.append(label, heading, copy);
      return link;
    });
    navigation.replaceChildren(...links);
  });
})();
