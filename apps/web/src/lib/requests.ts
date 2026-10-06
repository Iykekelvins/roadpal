import type { CreateRequestInput, IssueType, LatLng, RequestStatus, VehicleType } from "@repo/shared";
import { api } from "./api";

/** A driver's own request, as the requests endpoints return it. */
export interface DriverRequest {
  id: string;
  status: RequestStatus;
  location: LatLng;
  vehicleType: VehicleType;
  issueType: IssueType;
  note: string | null;
  searchRadiusKm: number;
  createdAt: string;
  expiresAt: string;
}

export async function getActiveRequest() {
  return (await api<{ request: DriverRequest | null }>("/requests/active")).request;
}

export function createRequest(input: CreateRequestInput) {
  return api<DriverRequest & { matchedProviderCount: number }>("/requests", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelRequest(id: string) {
  return api<DriverRequest>(`/requests/${id}/cancel`, { method: "POST", body: "{}" });
}
