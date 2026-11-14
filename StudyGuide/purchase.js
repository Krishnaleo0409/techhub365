(() => {
  "use strict";
  function purchaseState(data, id) {
    const purchase = data.purchases?.find(item => item.id === id);
    if (!id) return { verified: false, message: `Your current membership is ${data.plan}. Your recent purchases are listed below.` };
    if (!purchase) return { verified: false, message: "This purchase is not in your recent account history. Check that you are using the account you paid with, or contact support." };
    if (purchase.status === "paid") {
      const active = data.plan === "Pro" || data.plan === purchase.plan;
      return { verified: active, message: active
        ? `Payment confirmed. Your ${purchase.plan} access is active. Continue learning below.`
        : "Payment received, but this membership is not active. Contact support with your purchase reference; do not pay again." };
    }
    return { verified: false, message: purchase.status === "pending"
      ? "Your payment is awaiting confirmation. Refresh shortly. Do not pay again while the first payment is being checked."
      : "This checkout has not activated membership. If your provider shows a debit, contact support before trying another payment." };
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { purchaseState };
    return;
  }
  const status = document.getElementById("purchase-status");
  const history = document.getElementById("purchase-history");
  const refresh = document.getElementById("purchase-refresh");
  const login = document.getElementById("purchase-login");
  const params = new URLSearchParams(location.search);
  const id = params.get("purchase");
  let busy = false;
  let stopped = false;
  let captured = false;
  const controller = new AbortController();
  const next = `${location.pathname}${location.search}`;
  login.href = `Account.html?${new URLSearchParams({ next })}`;
  function authHeaders() {
    try {
      const session = JSON.parse(localStorage.getItem("visual-memory-lab.auth-session") || "null");
      return typeof session?.access_token === "string" ? { Authorization: `Bearer ${session.access_token}` } : {};
    } catch { return {}; }
  }
  async function api(url, body) {
    const response = await fetch(url, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      headers: { ...authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 401) { login.hidden = false; throw new Error("Log in with the account you used for your purchase."); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Your purchase could not be checked. Try Refresh status.");
    login.hidden = true;
    return result;
  }
  function node(tag, text) {
    const item = document.createElement(tag);
    item.textContent = text;
    return item;
  }
  async function check() {
    const data = await api("/api/purchases");
    if (params.get("payment") === "pending" && params.get("token") && !captured) {
      await api("/api/paypal/capture", { orderId: params.get("token") });
      captured = true;
    }
    const state = purchaseState(data, id);
    status.textContent = params.get("payment") === "cancelled" && !state.verified
      ? "Checkout was cancelled. No membership was activated by returning here. If you see a debit, check the purchase below or contact support."
      : state.message;
    document.getElementById("purchase-plan").textContent = `Current plan: ${data.plan}`;
    history.replaceChildren(...data.purchases.map(purchase => {
      const card = node("article", "");
      card.className = "offering-card";
      const amount = new Intl.NumberFormat(undefined, { style: "currency", currency: purchase.currency }).format(purchase.amountMinor / 100);
      card.append(node("h3", `${purchase.plan} membership`), node("p", `${amount} | ${purchase.status}`),
        node("p", `Purchase reference: ${purchase.id}`));
      return card;
    }));
    return state.verified;
  }
  async function update(automatic = false) {
    if (busy || stopped) return;
    busy = true;
    refresh.disabled = true;
    try {
      const attempts = automatic && params.get("payment") === "pending" ? 6 : 1;
      for (let attempt = 0; attempt < attempts && !stopped; attempt++) {
        if (await check()) break;
        if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      if (!stopped) status.textContent = error.message || "Purchase status is temporarily unavailable. Please try again.";
    } finally { busy = false; refresh.disabled = false; }
  }
  refresh.addEventListener("click", () => update());
  window.addEventListener("pagehide", () => { stopped = true; controller.abort(); });
  window.addEventListener("pageshow", event => { if (event.persisted) location.reload(); });
  update(true);
})();
