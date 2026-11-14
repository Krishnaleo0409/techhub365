(() => {
  "use strict";

  const SESSION_KEY = "visual-memory-lab.auth-session";
  const statuses = document.querySelectorAll("[data-google-auth-status]");
  const showStatus = message => statuses.forEach(node => { node.textContent = message; });
  const returns = new Set(["/Company-Interviews.html#access-heading", "/Membership.html"]);

  async function request(body) {
    const response = await fetch("/api/google-auth", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Google sign-in could not be completed.");
    return result;
  }

  async function completeSignIn() {
    const params = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", location.pathname);
    if (params.has("error") || fragment.has("error")) {
      if (params.get("state")) await request({ action: "cancel", state: params.get("state") }).catch(() => {});
      showStatus("Google sign-in was cancelled or not completed. Return to the account page and try again.");
      return;
    }
    if (!params.get("code") || !params.get("state")) {
      showStatus("No Google sign-in response was found. Start sign-in from the account page.");
      return;
    }
    try {
      const result = await request({ action: "exchange", code: params.get("code"), state: params.get("state") });
      const target = new URL(result.returnTo, location.origin);
      if (target.origin !== location.origin || target.search || !returns.has(target.pathname + target.hash)) {
        throw new Error("The sign-in service returned an invalid account page.");
      }
      if (!result.session?.access_token || !result.session?.refresh_token) throw new Error("No sign-in session was returned.");
      const sync = await fetch("/api/session", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: result.session.access_token }),
      });
      if (!sync.ok) throw new Error("Your account could not be verified. Please start sign-in again.");
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(result.session));
      } catch {
        await fetch("/api/session", { method: "DELETE", credentials: "same-origin" }).catch(() => {});
        throw new Error("Browser storage is blocked. Allow storage for this website, then try signing in again.");
      }
      window.location.replace(target.href);
    } catch (error) {
      showStatus(error.message || "Google sign-in could not be completed. Please try again.");
    }
  }

  if (document.getElementById("google-auth-callback")) {
    completeSignIn();
    return;
  }
  const buttons = [...document.querySelectorAll("[data-google-sign-in]")];
  if (!buttons.length) return;
  let config;
  let busy = false;
  buttons.forEach(button => button.addEventListener("click", async () => {
    if (!config?.enabled || busy) return;
    busy = true;
    buttons.forEach(item => { item.disabled = true; });
    showStatus("Opening Google sign-in. Your Google password is never entered on KR7Tech.");
    try {
      const result = await request({ action: "start", returnTo: button.dataset.authReturn || "/Company-Interviews.html#access-heading" });
      const url = new URL(result.url);
      if (url.origin !== config.authorizationOrigin || url.pathname !== "/auth/v1/authorize" ||
          url.username || url.password || url.searchParams.get("provider") !== "google") {
        throw new Error("The sign-in service returned an invalid login link.");
      }
      window.location.assign(url.href);
    } catch (error) {
      showStatus(error.message || "Google sign-in could not be started.");
      busy = false;
      buttons.forEach(item => { item.disabled = false; });
    }
  }));
  fetch("/api/google-auth", { credentials: "same-origin", cache: "no-store" }).then(async response => {
    config = await response.json();
    if (!response.ok || config.enabled !== true) throw new Error(config.error || "Google sign-in is not configured yet.");
    buttons.forEach(button => { button.disabled = false; });
    showStatus("Use your Google account to sign in or create an account. Sign-in does not purchase or unlock Pro.");
  }).catch(error => showStatus(error.message || "Google sign-in is not available yet. Email sign-in and free previews are unchanged."));
})();
