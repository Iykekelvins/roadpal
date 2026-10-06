const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

/** 4000 -> "₦4,000". Prices are whole naira throughout the app. */
export const formatNaira = (amount: number): string => naira.format(amount);
