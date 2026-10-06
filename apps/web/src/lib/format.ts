const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

/** 4000 -> "₦4,000". Prices are whole naira throughout the app. */
export const formatNaira = (amount: number): string => naira.format(amount);

/** 450 -> "450 m", 1234 -> "1.2 km". Rounded: it's "how far", not surveying. */
export const formatDistance = (meters: number): string =>
  meters < 1000 ? `${Math.max(50, Math.round(meters / 50) * 50)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;

/** +2348031234567 -> "+234 803 123 4567", easier to read back and check. */
export const formatPhone = (phone: string): string => phone.replace(/^(\+234)(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3 $4");
