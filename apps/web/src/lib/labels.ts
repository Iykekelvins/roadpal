import type { CancelReason, IssueType, VehicleType } from "@repo/shared";

// How the API's enum values read on screen. Record<...> makes TypeScript flag a missing label
// if a new vehicle or issue type is added to the shared enums.
export const VEHICLE_LABELS: Record<VehicleType, string> = {
  car: "Car",
  bus: "Bus",
  truck: "Truck",
  motorcycle: "Motorcycle",
};

export const ISSUE_LABELS: Record<IssueType, string> = {
  flat_tyre: "Flat tyre",
  puncture: "Puncture",
  tyre_burst: "Tyre burst",
  no_spare: "No spare tyre",
  needs_air: "Needs air",
  other: "Something else",
};

/** Neutral wording: shown to both sides in job history. */
export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  provider_no_show: "The vulcanizer didn’t come",
  cant_reach_other_party: "Couldn’t reach each other",
  problem_solved: "Problem solved",
  found_other_help: "Driver found other help",
  emergency: "Emergency",
  other: "Other reason",
};
