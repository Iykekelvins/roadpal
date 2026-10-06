import type { LatLng } from "@repo/shared";

export type Fix =
  | { state: "idle" }
  | { state: "locating" }
  | { state: "found"; location: LatLng; accuracyMeters: number }
  | { state: "failed"; message: string };

const MESSAGES = {
  unsupported: "This browser can’t share your location.",
  denied: "Location is blocked. Allow it for this site in your browser settings, then try again.",
  unavailable: "Couldn’t get your location. Move to open sky if you can, and try again.",
};

const failure = (error: GeolocationPositionError): Fix => ({
  state: "failed",
  message: error.code === error.PERMISSION_DENIED ? MESSAGES.denied : MESSAGES.unavailable,
});

const found = (position: GeolocationPosition): Fix => ({
  state: "found",
  location: { lat: position.coords.latitude, lng: position.coords.longitude },
  accuracyMeters: Math.round(position.coords.accuracy),
});

// GPS-quality fix; a reading up to 30s old is fine.
const OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 };

/** One location reading, with a plain-language message when it fails. */
export function locate(): Promise<Fix> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ state: "failed", message: MESSAGES.unsupported });
    navigator.geolocation.getCurrentPosition((p) => resolve(found(p)), (e) => resolve(failure(e)), OPTIONS);
  });
}

/** Keeps reporting the location as it changes (the browser decides how often). Returns a stop function. */
export function watchLocation(onFix: (fix: Fix) => void): () => void {
  if (!("geolocation" in navigator)) {
    onFix({ state: "failed", message: MESSAGES.unsupported });
    return () => {};
  }
  const id = navigator.geolocation.watchPosition((p) => onFix(found(p)), (e) => onFix(failure(e)), OPTIONS);
  return () => navigator.geolocation.clearWatch(id);
}
