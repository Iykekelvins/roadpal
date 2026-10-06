"use client";

import { useEffect } from "react";

/**
 * Fades `.reveal` elements in the first time they scroll into view; a `.reveal-group` reveals all
 * its `.reveal-item` children together (staggered) when the group enters. Works in every browser
 * (IntersectionObserver). Elements are only hidden once this has run (`reveal-active` on <html>),
 * so if the script never loads, the page is simply fully visible. Skipped for reduced motion.
 */
export function RevealOnScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target); // animate once, not every time it re-enters
        }
      },
      // Trigger a little before the element is fully on screen, so it isn't late.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    root.classList.add("reveal-active");
    document.querySelectorAll(".reveal, .reveal-group").forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      root.classList.remove("reveal-active");
    };
  }, []);

  return null;
}
