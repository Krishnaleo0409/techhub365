(() => {
  "use strict";
  const panel = document.getElementById("preview-registration");
  const form = document.getElementById("preview-registration-form");
  const status = document.getElementById("account-status");
  let signedIn = !document.getElementById("account-dashboard").hidden;
  let busy = false;
  document.getElementById("account-heading").textContent = "Create an account or log in";
  document.querySelector(".hero-copy").textContent = "Create a local preview account, log in, explore, and sign out. Accounts stay on this computer; they are not production accounts.";
  document.querySelector("#local-admin-panel h3").textContent = "Log in to your local account";
  document.querySelector('label[for="local-admin-username"]').textContent = "Username or email";
  document.querySelector('label[for="local-admin-password"]').textContent = "Password";
  document.getElementById("local-admin-username").maxLength = 254;
  document.getElementById("local-admin-sign-in").textContent = "Log in";
  document.addEventListener("kr7:account-change", event => {
    signedIn = event.detail.signedIn === true;
    panel.hidden = signedIn;
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const password = document.getElementById("preview-password");
    const confirmation = document.getElementById("preview-confirm-password");
    if (password.value !== confirmation.value) {
      status.textContent = "Passwords do not match.";
      confirmation.focus();
      return;
    }
    busy = true;
    form.querySelectorAll("input, select, button").forEach(node => { node.disabled = true; });
    status.textContent = "Creating your local account...";
    try {
      const response = await fetch("/api/local-preview-accounts", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: document.getElementById("preview-username").value.trim(),
          email: document.getElementById("preview-email").value.trim(), password: password.value,
          role: document.getElementById("preview-role").value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your local account could not be created.");
      location.reload();
    } catch (error) { status.textContent = error.message; }
    finally {
      password.value = "";
      confirmation.value = "";
      form.querySelectorAll("input, select, button").forEach(node => { node.disabled = false; });
      busy = false;
    }
  });
  (async () => {
    try {
      const response = await fetch("/api/local-preview-accounts", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Local account creation is unavailable.");
      const availability = await response.json();
      panel.hidden = signedIn || availability.signedIn;
      document.getElementById("preview-learning-role").hidden = availability.firstAdminAvailable;
      document.getElementById("preview-registration-heading").textContent = availability.firstAdminAvailable
        ? "Create your Admin account" : "Create a local learning account";
      document.getElementById("preview-create-account").textContent = availability.firstAdminAvailable
        ? "Create Admin account & sign in" : "Create account & sign in";
      document.getElementById("preview-registration-note").textContent = availability.firstAdminAvailable
        ? "The first account you create becomes this computer's local Admin with Pro preview access. Choose your own credentials. Nothing is sent to MongoDB or an email provider."
        : "Your account stays on this computer. New accounts can be Student or Expert, not Admin. Email is not verified, and paid access is not included.";
    } catch (error) { status.textContent = error.message; }
  })();
})();
