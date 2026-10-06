import type { JobView } from "@repo/shared";
import { api } from "./api";

export async function getActiveJob() {
  return (await api<{ job: JobView | null }>("/jobs/active")).job;
}

/** Throws ApiError with OFFER_NOT_PENDING, PROVIDER_BUSY or REQUEST_NOT_OPEN when someone got there first. */
export function acceptOffer(offerId: string) {
  return api<JobView>(`/offers/${offerId}/accept`, { method: "POST", body: "{}" });
}
