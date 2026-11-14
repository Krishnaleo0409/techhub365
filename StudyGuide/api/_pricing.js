"use strict";

const REGULAR_MINOR = Object.freeze({ L1:50000, L2:50000, L3:50000, Go:150000, Pro:500000 });
const DISCOUNT_PERCENT = 50;

function tierAmount(tier) {
  const regular = Object.hasOwn(REGULAR_MINOR, tier) ? REGULAR_MINOR[tier] : null;
  return regular && ["Go", "Pro"].includes(tier) ? regular * (100 - DISCOUNT_PERCENT) / 100 : regular;
}

function planOffers() {
  return Object.fromEntries(["Go", "Pro"].map(tier => [tier, {
    currency:"INR", regularAmount:REGULAR_MINOR[tier] / 100,
    amount:tierAmount(tier) / 100, discountPercent:DISCOUNT_PERCENT,
  }]));
}

module.exports = { tierAmount, planOffers };
