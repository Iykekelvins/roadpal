import type { CreateOfferInput, EarningsView, IssueType, LatLng, NearbyRequest, OfferView, ProviderProfileInput } from "@repo/shared";
import { api, ApiError } from "./api";

export interface ProviderProfile {
  services: IssueType[];
  serviceRadiusKm: number;
  isOnline: boolean;
  lastLocation: LatLng | null;
  lastLocationAt: string | null;
  ratingAvg: number | null;
  ratingCount: number;
}

/** Null when this vulcanizer hasn't set up their profile yet (the API answers 404). */
export async function getProfile(): Promise<ProviderProfile | null> {
  try {
    return await api<ProviderProfile>("/providers/me/profile");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function saveProfile(input: ProviderProfileInput) {
  return api<ProviderProfile>("/providers/me/profile", { method: "PUT", body: JSON.stringify(input) });
}

export function goOnline(location: LatLng) {
  return api<ProviderProfile>("/providers/me/status", { method: "PATCH", body: JSON.stringify({ isOnline: true, location }) });
}

export function goOffline() {
  return api<ProviderProfile>("/providers/me/status", { method: "PATCH", body: JSON.stringify({ isOnline: false }) });
}

/** The idle heartbeat. `accepted: false` just means "too soon after the last one", not an error. */
export function sendLocation(location: LatLng) {
  return api<{ accepted: boolean; lastLocationAt: string }>("/providers/me/location", {
    method: "POST",
    body: JSON.stringify(location),
  });
}

export function getEarnings() {
  return api<EarningsView>("/providers/me/earnings");
}

export async function getNearbyRequests() {
  return (await api<{ requests: NearbyRequest[] }>("/providers/me/nearby-requests")).requests;
}

export function makeOffer(requestId: string, input: CreateOfferInput) {
  return api<OfferView>(`/requests/${requestId}/offers`, { method: "POST", body: JSON.stringify(input) });
}
