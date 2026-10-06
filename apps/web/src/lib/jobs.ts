import type { CancelJobInput, JobView, RateJobInput, RatingView } from "@repo/shared";
import { api } from "./api";

export async function getActiveJob() {
  return (await api<{ job: JobView | null }>("/jobs/active")).job;
}

/** Throws ApiError with OFFER_NOT_PENDING, PROVIDER_BUSY or REQUEST_NOT_OPEN when someone got there first. */
export function acceptOffer(offerId: string) {
  return api<JobView>(`/offers/${offerId}/accept`, { method: "POST", body: "{}" });
}

export function cancelJob(id: string, input: CancelJobInput) {
  return api<JobView>(`/jobs/${id}/cancel`, { method: "POST", body: JSON.stringify(input) });
}

export function rateJob(id: string, input: RateJobInput) {
  return api<RatingView>(`/jobs/${id}/rating`, { method: "POST", body: JSON.stringify(input) });
}
