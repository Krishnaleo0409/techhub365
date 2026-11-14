(() => {
  "use strict";
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-local-pro-unlock]");
    if (!button) return;
    event.preventDefault();
    const target = button.parentElement.querySelector("[data-pro-unlock]") || document.querySelector("[data-pro-unlock]");
    target?.click();
  });
})();
