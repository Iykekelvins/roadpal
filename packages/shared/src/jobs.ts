import type { IssueType, JobStatus, VehicleType } from './enums';
import type { LatLng } from './geo';

/**
 * A job as both participants see it. Exact location and phone numbers appear only here,
 * i.e. only after the driver has accepted an offer.
 */
export interface JobView {
  id: string;
  status: JobStatus;
  requestId: string;
  offerId: string;
  priceNaira: number;
  etaMinutes: number;
  location: LatLng;
  vehicleType: VehicleType;
  issueType: IssueType;
  note: string | null;
  acceptedAt: string; // ISO 8601
  driver: { id: string; name: string | null; phone: string };
  provider: { id: string; name: string | null; phone: string; ratingAvg: number | null; ratingCount: number };
}
