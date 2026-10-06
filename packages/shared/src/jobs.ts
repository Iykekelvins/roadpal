import type { IssueType, JobStatus, UserRole, VehicleType } from './enums';
import type { CancelReason } from './job-state-machine';
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
  // Lifecycle timestamps (ISO 8601); null until the job reaches that status.
  acceptedAt: string;
  enRouteAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: UserRole | null;
  cancelReason: CancelReason | null;
  driver: { id: string; name: string | null; phone: string };
  provider: { id: string; name: string | null; phone: string; ratingAvg: number | null; ratingCount: number };
}
