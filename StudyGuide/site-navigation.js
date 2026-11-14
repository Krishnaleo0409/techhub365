(() => {
  "use strict";
  const header = document.querySelector("[data-site-header]");
  if (!header) return;
  const navigation = header.querySelector("#site-primary-navigation");
  const toggle = header.querySelector(".site-menu-toggle");
  const more = header.querySelector(".site-more");
  const mobile = window.matchMedia("(max-width:1100px)");

  function setExpanded(expanded, focus = false) {
    navigation.dataset.mobileOpen = String(expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    if (!expanded) more.open = false;
    if (focus) toggle.focus();
  }
  function resize() {
    toggle.hidden = !mobile.matches;
    setExpanded(false);
  }
  toggle.addEventListener("click", () => setExpanded(toggle.getAttribute("aria-expanded") !== "true"));
  navigation.addEventListener("click", event => {
    if (event.target.closest("a") && mobile.matches) setExpanded(false);
  });
  document.addEventListener("click", event => {
    if (!more.contains(event.target)) more.open = false;
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (more.open) {
      more.open = false;
      more.querySelector("summary").focus();
    } else if (mobile.matches && toggle.getAttribute("aria-expanded") === "true") {
      setExpanded(false, true);
    }
  });
  mobile.addEventListener("change", resize);
  resize();
  document.documentElement.classList.add("site-nav-ready");
})();
