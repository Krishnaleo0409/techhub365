(() => {
  "use strict";
  if (window.__kr7ServiceStatus) return;
  window.__kr7ServiceStatus = true;
  const failures = new Set();
  let banner, heading, message;

  function render() {
    if (!banner) return;
    const offline = navigator.onLine === false;
    banner.hidden = !offline && failures.size === 0;
    heading.textContent = offline ? "You're offline" : "We're working on it";
    message.textContent = offline
      ? "Check your internet connection, then try again."
      : "Some KR7Tech services are temporarily unavailable. Please try again shortly. If you submitted a payment, check My purchases before paying again.";
  }

  function mount() {
    banner = document.createElement("aside");
    banner.id = "kr7-service-status";
    banner.hidden = true;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-atomic", "true");
    const copy = document.createElement("div");
    copy.className = "kr7-service-copy";
    heading = document.createElement("strong");
    message = document.createElement("p");
    copy.append(heading, message);
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", () => window.location.reload());
    banner.append(copy, retry);
    document.body.prepend(banner);
    render();
  }

  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, options) {
      let key;
      try {
        const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, window.location.href);
        if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
          key = `${String(options?.method || input?.method || "GET").toUpperCase()} ${url.pathname}`;
        }
      } catch {
        // Let fetch preserve its normal validation and error behavior.
      }
      try {
        const response = await originalFetch(input, options);
        if (key) {
          if (response.status >= 500) failures.add(key);
          else failures.delete(key);
          render();
        }
        return response;
      } catch (error) {
        const signal = options?.signal || input?.signal;
        const timedOut = error.name === "TimeoutError" || signal?.reason?.name === "TimeoutError";
        if (key && (timedOut || (error.name !== "AbortError" && !signal?.aborted))) {
          failures.add(key);
          render();
        }
        throw error;
      }
    };
  }

  window.addEventListener("offline", render);
  window.addEventListener("online", render);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once:true });
  else mount();

  function registerFallback() {
    if (window.isSecureContext && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js", { scope:"/" }).catch(() => {
        // The in-page notice still works when browser policy disables offline storage.
      });
    }
  }
  if (document.readyState === "complete") registerFallback();
  else window.addEventListener("load", registerFallback, { once:true });
})();
