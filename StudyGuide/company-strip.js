(() => {
  "use strict";
  const companies = [
    ["Microsoft", "microsoft.svg"], ["Google", "google.svg"], ["Amazon", "amazon.svg"],
    ["Infosys", "infosys.svg"], ["TCS", "tcs.svg"], ["Accenture", "accenture.svg"],
  ];
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  document.querySelectorAll("[data-company-strip]").forEach((section, index) => {
    const header = node("div", "company-strip-header");
    const introduction = node("div");
    const heading = node("h2", "", "Your next opportunity starts with practice.");
    heading.id = `company-strip-heading-${index}`;
    section.setAttribute("aria-labelledby", heading.id);
    introduction.append(node("p", "company-strip-kicker", "Company interview preparation"), heading);
    header.append(introduction);
    const viewport = node("div", "company-strip-viewport");
    viewport.id = `company-strip-logos-${index}`;
    viewport.tabIndex = 0;
    viewport.setAttribute("role", "group");
    viewport.setAttribute("aria-label", "Company logos. Keyboard focus pauses motion. Use arrow keys to scroll when reduced motion is enabled.");
    const track = node("div", "company-strip-track");
    const group = node("ul", "company-strip-group");
    group.setAttribute("aria-label", "Companies covered in interview preparation");
    for (const [name, file] of companies) {
      const item = node("li", "company-strip-logo");
      const image = node("img");
      image.src = `assets/company-logos/${file}`;
      image.alt = name;
      image.width = name === "Microsoft" ? 27 : 140;
      image.height = name === "Microsoft" ? 27 : 44;
      image.decoding = "async";
      if (name === "Microsoft") {
        image.className = "company-symbol";
        image.alt = "";
        item.append(image, node("span", "", name));
      } else item.append(image);
      group.append(item);
    }
    const duplicate = group.cloneNode(true);
    duplicate.removeAttribute("aria-label");
    duplicate.setAttribute("aria-hidden", "true");
    duplicate.inert = true;
    track.append(group, duplicate);
    viewport.append(track);
    const note = node("p", "company-strip-note", "Independent practice, not company affiliation, endorsement, or a placement guarantee. ");
    const link = node("a", "", "Explore company preparation");
    link.href = "Company-Interviews.html";
    note.append(link);
    section.replaceChildren(header, viewport, note);
  });
})();
