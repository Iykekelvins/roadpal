"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@repo/shared";
import { LngLatBounds, Map as MapLibre, Marker, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed } from "lucide-react";

// The worker can't be found next to the bundled script, so it's served from public/ (see
// scripts/copy-map-worker.mjs).
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

// Free vector tiles from OpenStreetMap data, no API key. Swapping provider = changing these URLs.
const STYLES = {
  light: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
};
const ANIMATE_MS = 1000;

const toLngLat = ({ lat, lng }: LatLng): [number, number] => [lng, lat]; // MapLibre wants [lng, lat]

function pin(kind: "driver" | "provider") {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.className =
    kind === "driver"
      ? "size-5 rounded-full border-[3px] border-surface bg-signal shadow-[0_0_0_6px_color-mix(in_oklab,var(--signal)_30%,transparent)]"
      : "flex size-9 items-center justify-center rounded-full border-[3px] border-surface bg-primary text-on-primary shadow-lg";
  if (kind === "provider") {
    // The RoadPal tyre mark.
    el.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/></svg>';
  }
  return el;
}

/**
 * The driver's pin and, while en route, the vulcanizer moving towards it. Positions arrive every
 * few seconds, so the marker glides between them instead of jumping.
 */
export default function JobMap({
  driver,
  provider,
  label = provider ? "Map of you and your vulcanizer" : "Map of your location",
}: {
  driver: LatLng;
  provider: LatLng | null;
  /** Screen-reader description; each side words it from their own point of view. */
  label?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const providerMarker = useRef<Marker | null>(null);
  // Once the driver pans or zooms, stop re-framing the map under their finger.
  const [followed, setFollowed] = useState(true);

  // Create the map once.
  useEffect(() => {
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const m = new MapLibre({
      container: container.current!,
      style: dark.matches ? STYLES.dark : STYLES.light,
      center: toLngLat(driver),
      zoom: 14,
      attributionControl: { compact: true },
    });
    new Marker({ element: pin("driver") }).setLngLat(toLngLat(driver)).addTo(m);
    // The OpenStreetMap credit is required, but it starts expanded over the pins: collapse it to
    // its (i) button, which still opens it.
    m.once("load", () =>
      container.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"),
    );
    // Only user gestures carry an originalEvent; our own fitBounds/easeTo don't.
    const stopFollowing = (e: { originalEvent?: unknown }) => e.originalEvent && setFollowed(false);
    m.on("dragstart", stopFollowing);
    m.on("zoomstart", stopFollowing);
    const onScheme = () => m.setStyle(dark.matches ? STYLES.dark : STYLES.light);
    dark.addEventListener("change", onScheme);
    map.current = m;
    return () => {
      dark.removeEventListener("change", onScheme);
      m.remove();
      map.current = null;
      providerMarker.current = null;
    };
    // The driver's location is fixed for the job; the map is built once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move (glide) the vulcanizer's marker on every new position.
  useEffect(() => {
    const m = map.current;
    if (!m || !provider) return;
    if (!providerMarker.current) {
      providerMarker.current = new Marker({ element: pin("provider") }).setLngLat(toLngLat(provider)).addTo(m);
      return;
    }
    const marker = providerMarker.current;
    const from = marker.getLngLat();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      marker.setLngLat(toLngLat(provider));
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / ANIMATE_MS);
      marker.setLngLat([from.lng + (provider.lng - from.lng) * t, from.lat + (provider.lat - from.lat) * t]);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [provider]);

  // Keep both pins in view while following.
  useEffect(() => {
    const m = map.current;
    if (!m || !followed) return;
    if (!provider) {
      m.easeTo({ center: toLngLat(driver), zoom: 14 });
      return;
    }
    const bounds = new LngLatBounds(toLngLat(driver), toLngLat(driver)).extend(toLngLat(provider));
    m.fitBounds(bounds, { padding: 56, maxZoom: 16, duration: 800 });
  }, [driver, provider, followed]);

  return (
    <div className="relative h-72 overflow-hidden rounded-2xl border border-border sm:h-80">
      {/* Sized with h-full, not absolute: MapLibre's own CSS sets position: relative on this element,
          and un-layered library CSS beats Tailwind's layered utilities. */}
      <div ref={container} className="h-full w-full" role="img" aria-label={label} />
      {!followed && (
        <button
          type="button"
          onClick={() => setFollowed(true)}
          className="absolute top-3 right-3 inline-flex h-10 items-center gap-2 rounded-xl bg-surface px-3 text-sm font-bold text-text shadow-lg"
        >
          <LocateFixed className="size-4" aria-hidden="true" />
          Recenter
        </button>
      )}
    </div>
  );
}
