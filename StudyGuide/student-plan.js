(() => {
  "use strict";

  const STORAGE_KEY = "kr7tech.student-plan.v1";
  const SUBJECTS = [
    { id: "dotnet", name: "C# / .NET", href: "C%23Dotnet.html" },
    { id: "aspnet", name: "ASP.NET Core", topic: "ASP.NET Core" },
    { id: "sql", name: "SQL", topic: "SQL" },
    { id: "apis", name: "REST APIs", topic: "REST APIs" },
    { id: "javascript", name: "JavaScript / TypeScript", topic: "JavaScript / TypeScript" },
    { id: "angular", name: "Angular", topic: "Angular" },
    { id: "react", name: "React Machine Coding", href: "React-Machine-Coding.html" },
    { id: "efcore", name: "EF Core", topic: "EF Core" },
    { id: "linq", name: "LINQ", topic: "LINQ" },
    { id: "azure", name: "Azure", href: "AZURECICD.html" },
    { id: "devops", name: "DevOps", topic: "DevOps" },
    { id: "design", name: "System Design", href: "System-Design.html" },
    { id: "microservices", name: "Microservices", topic: "Microservices" },
    { id: "security", name: "Identity & Security", topic: "Identity & Security" },
    { id: "testing", name: "Testing", topic: "Testing" },
    { id: "dsa", name: "Data Structures & Algorithms", href: "DSA.html" },
    { id: "ai", name: "AI, RAG & agents", href: "How%20AI%20work.html" },
    { id: "behavioral", name: "Behavioral", topic: "Behavioral" },
  ];

  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error("Choose a valid start date.");
    }
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new Error("Choose a valid start date.");
    }
    return date;
  }

  function buildPlan(options) {
    const { subjects, startDate, months, daysPerWeek, hoursPerDay, budget, currency } = options;
    if (!Array.isArray(subjects) || !subjects.length ||
        subjects.some(id => !SUBJECTS.some(subject => subject.id === id))) {
      throw new Error("Choose at least one supported subject.");
    }
    if (!Number.isInteger(months) || months < 1 || months > 12 ||
        !Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7 ||
        !Number.isFinite(hoursPerDay) || hoursPerDay < 0.5 || hoursPerDay > 8) {
      throw new Error("Choose 1-12 months, 1-7 study days per week, and 0.5-8 hours per study day.");
    }
    if (!["INR", "USD"].includes(currency) ||
        (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 10000000))) {
      throw new Error("Enter a valid budget from 0 to 10,000,000, or leave it blank.");
    }
    const start = parseDate(startDate);
    if (start.getUTCFullYear() < 2000 || start.getUTCFullYear() > 2100) {
      throw new Error("Choose a start date between 2000 and 2100.");
    }
    const selected = [...new Set(subjects)].map(id => SUBJECTS.find(subject => subject.id === id));
    const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
    const lastDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
    nextMonth.setUTCDate(Math.min(start.getUTCDate(), lastDay));
    const end = new Date(nextMonth);
    end.setUTCDate(end.getUTCDate() - 1);
    const dates = [];
    for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      const mondayBasedDay = (date.getUTCDay() + 6) % 7;
      if (mondayBasedDay < daysPerWeek) dates.push(date.toISOString().slice(0, 10));
    }
    if (dates.length < selected.length) throw new Error("Choose fewer subjects or add more study days so each subject gets a session.");
    let offset = 0;
    const subjectPlans = selected.map((subject, index) => {
      const count = Math.floor(dates.length / selected.length) + (index < dates.length % selected.length ? 1 : 0);
      const sessions = dates.slice(offset, offset + count).map((date, sessionIndex) => ({
        date,
        subject,
        hours: hoursPerDay,
        focus: sessionIndex === count - 1
          ? "Review, explain answers aloud, and check progress"
          : sessionIndex / count >= 0.6
            ? "Build a small example and solve practice questions"
            : "Learn foundations and work through examples",
      }));
      offset += count;
      return { subject, sessions, hours: count * hoursPerDay };
    });
    return {
      startDate, endDate: end.toISOString().slice(0, 10), months, daysPerWeek, hoursPerDay,
      budget, currency, subjectPlans, sessions: subjectPlans.flatMap(item => item.sessions),
      totalHours: dates.length * hoursPerDay,
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { buildPlan, SUBJECTS };
    return;
  }

  const form = document.getElementById("student-plan-form");
  if (!form) return;
  const subjectList = document.getElementById("student-plan-subjects");
  const status = document.getElementById("student-plan-status");
  const result = document.getElementById("student-plan-result");
  const defaults = new Set(["dotnet", "sql", "apis"]);
  const field = name => form.elements.namedItem(name);
  const dateLabel = value => new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeZone: "UTC",
  }).format(parseDate(value));

  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  SUBJECTS.forEach(subject => {
    const label = element("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "subjects";
    checkbox.value = subject.id;
    checkbox.checked = defaults.has(subject.id);
    label.append(checkbox, document.createTextNode(subject.name));
    subjectList.append(label);
  });
  const today = new Date();
  field("startDate").value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  function subjectLink(subject) {
    const link = element("a", subject.name);
    link.href = subject.href || `Subject-QA.html?topic=${encodeURIComponent(subject.topic)}`;
    return link;
  }

  function render(plan) {
    result.replaceChildren();
    result.hidden = false;
    result.append(element("h3", "Your Student Plan"));
    result.append(element("p",
      `${plan.months} month${plan.months === 1 ? "" : "s"} | ${dateLabel(plan.startDate)} - ${dateLabel(plan.endDate)} | ${plan.sessions.length} study days | ${plan.totalHours} total hours`,
      "student-plan-summary"));
    const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    result.append(element("p",
      `${dayNames.slice(0, plan.daysPerWeek).join(", ")}: ${plan.hoursPerDay} hour${plan.hoursPerDay === 1 ? "" : "s"} per day. Other days are rest or catch-up days.`));
    const money = new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency });
    result.append(element("p", plan.budget === null
      ? "Budget: not set. This free planner does not purchase a subscription."
      : `Your total study budget: ${money.format(plan.budget)} (${money.format(plan.budget / plan.months)} per month on average). This is your budget, not a course price or payment.`));
    const tableWrap = element("div", undefined, "student-plan-table");
    const table = document.createElement("table");
    const caption = element("caption", "Subject schedule");
    const head = document.createElement("thead");
    const header = document.createElement("tr");
    ["Subject", "Dates", "Study days", "Hours"].forEach(value => {
      const cell = element("th", value);
      cell.scope = "col";
      header.append(cell);
    });
    head.append(header);
    const body = document.createElement("tbody");
    plan.subjectPlans.forEach(item => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.append(subjectLink(item.subject));
      row.append(name, element("td", `${dateLabel(item.sessions[0].date)} - ${dateLabel(item.sessions.at(-1).date)}`),
        element("td", item.sessions.length), element("td", item.hours));
      body.append(row);
    });
    table.append(caption, head, body);
    tableWrap.append(table);
    result.append(tableWrap);
    const details = document.createElement("details");
    details.append(element("summary", "View your day-by-day study schedule"));
    const days = document.createElement("ol");
    plan.sessions.forEach(session => days.append(element("li",
      `${dateLabel(session.date)}: ${session.subject.name} - ${session.focus} (${session.hours}h)`)));
    details.append(days);
    result.append(details);
    result.append(element("p", "Start with the first 10 free questions and answers in each topic. Remaining items require verified Pro access; creating this plan does not unlock them."));
    const pro = element("a", "View Pro options", "button secondary");
    pro.href = "Company-Interviews.html#access-heading";
    result.append(pro);
  }

  function readOptions() {
    return {
      subjects: [...form.querySelectorAll('input[name="subjects"]:checked')].map(input => input.value),
      startDate: field("startDate").value,
      months: Number(field("months").value),
      daysPerWeek: Number(field("daysPerWeek").value),
      hoursPerDay: Number(field("hoursPerDay").value),
      budget: field("budget").value.trim() === "" ? null : Number(field("budget").value),
      currency: field("currency").value,
    };
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    result.hidden = true;
    try {
      const options = readOptions();
      const plan = buildPlan(options);
      render(plan);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
        status.textContent = "Plan created and saved in this browser on this device. Change your choices and generate it again at any time.";
      } catch {
        status.textContent = "Plan created. Browser storage is unavailable, so it will not be saved after this page closes.";
      }
    } catch (error) {
      status.textContent = error.message;
    }
  });

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved) {
      const plan = buildPlan(saved);
      subjectList.querySelectorAll("input").forEach(input => { input.checked = saved.subjects.includes(input.value); });
      for (const name of ["startDate", "months", "daysPerWeek", "hoursPerDay", "budget", "currency"]) {
        field(name).value = saved[name] ?? "";
      }
      render(plan);
      status.textContent = "Your saved Student Plan has been restored from this browser.";
    }
  } catch {
    status.textContent = "A saved plan could not be loaded. Choose your preferences to create a new plan.";
  }
})();
