(() => {
  "use strict";

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = "/pro-access.css";
  document.head.append(stylesheet);
  const globalPro = document.createElement("aside");
  globalPro.className = "global-pro-access";
  globalPro.dataset.globalPro = "";
  globalPro.setAttribute("aria-label", "Pro access options");
  const description = document.createElement("p");
  description.textContent = "Free previews. Go: full Q&A and selected lessons. Pro: complete access.";
  const plans = document.createElement("a");
  plans.href = "/Membership.html";
  plans.textContent = "Choose Go or Pro";
  globalPro.append(description, plans);
  document.body.prepend(globalPro);
  const support = document.createElement("script");
  support.src = "/support-chat.js";
  document.head.append(support);

  const pinState = (async () => {
    const endpoint = "/api/pro-access";
    const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
    const access = response.ok ? await response.json() : null;
    if (access?.enabled) return { endpoint, access };
    const localEndpoint = "/api/local-pro-access";
    const localResponse = await fetch(localEndpoint, { cache: "no-store", credentials: "same-origin" });
    const localAccess = localResponse.ok ? await localResponse.json() : null;
    return localAccess?.enabled
      ? { endpoint: localEndpoint, access: localAccess }
      : { endpoint, access };
  })();

  document.addEventListener("click", async event => {
    const trigger = event.target.closest("[data-pro-unlock]");
    if (!trigger) return;
    event.preventDefault();
    const button = trigger.dataset.proResource ? trigger
      : [...document.querySelectorAll("[data-pro-resource][data-pin-url]")]
        .find(candidate => candidate.getClientRects().length > 0) || trigger;
    const resource = button.dataset.proResource || "check";
    const pinRequest = button.dataset.pinRequest;
    trigger.disabled = true;
    button.disabled = true;
    try {
      const { endpoint, access } = await pinState;
      if (!access?.enabled) {
        window.location.assign("/Membership.html#purchase");
        return;
      }
      const pin = window.prompt("Enter PIN for this Pro question or lesson");
      if (pin === null || pin === "") return;
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ pin, resource }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not verify the PIN.");
      if (!button.dataset.pinUrl) {
        window.alert("PIN verified. Each Pro question or lesson asks for the PIN separately.");
        return;
      }
      const url = new URL(button.dataset.pinUrl, location.href);
      if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) throw new Error("Invalid Pro content link.");
      const content = await fetch(url, {
        headers: { "X-Pro-Grant": result.grant }, credentials: "same-origin", cache: "no-store",
      });
      const data = await content.json();
      if (!content.ok) throw new Error(data.error || "Could not open this Pro item.");
      if (!button.isConnected) return;
      if (button.dataset.pinKind === "guide") {
        const locked = button.closest("[data-pro-item]");
        if (!locked) return;
        const opened = document.createElement("article");
        opened.className = "preview-item";
        opened.dataset.pinOpened = "";
        opened.innerHTML = data.html;
        const close = document.createElement("button");
        close.type = "button";
        close.className = "button";
        close.textContent = "Close and lock this item";
        close.addEventListener("click", () => opened.replaceWith(locked));
        opened.append(close);
        locked.replaceWith(opened);
      } else {
        document.dispatchEvent(new CustomEvent("kr7:pin-content", { detail: { button, data, pinRequest } }));
      }
    } catch (error) {
      window.alert(error.message);
    } finally {
      trigger.disabled = false;
      button.disabled = false;
    }
  });

  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-pro-lock]");
    if (!button) return;
    button.disabled = true;
    try {
      for (const endpoint of ["/api/pro-access", "/api/local-pro-access"]) {
        const response = await fetch(endpoint, { method: "DELETE", credentials: "same-origin" });
        if (!response.ok && response.status !== 404) throw new Error("Could not clear previous PIN access.");
      }
      window.location.reload();
    } catch (error) {
      window.alert(error.message);
      button.disabled = false;
    }
  });

  pinState.then(() => {
    document.querySelectorAll("[data-pin-status]").forEach(node => {
      node.textContent = "Enter the PIN separately for each Pro question or lesson. No website-wide PIN unlock.";
    });
    document.querySelectorAll("[data-pro-lock]").forEach(button => { button.hidden = true; });
  }).catch(() => {});
  window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
})();
