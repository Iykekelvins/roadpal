/** Average to one decimal place, or null when there are no ratings yet. */
export const ratingAvg = (sum: number, count: number): number | null =>
  count ? Math.round((sum / count) * 10) / 10 : null;
