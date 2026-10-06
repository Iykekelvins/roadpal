"use client";

import { Star } from "lucide-react";

/** 1–5 stars as real radio buttons: arrow keys and screen readers work, and it's one tab stop. */
export function StarPicker({ name, value, onChange, size = "lg" }: { name: string; value: number; onChange: (score: number) => void; size?: "sm" | "lg" }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="rounded-lg p-1 has-focus-visible:outline-3 has-focus-visible:outline-primary">
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" />
          <span className="sr-only">
            {n} star{n > 1 ? "s" : ""}
          </span>
          <Star
            className={`${size === "lg" ? "size-10" : "size-7"} transition-colors ${n <= value ? "fill-signal text-signal" : "text-border"}`}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </label>
      ))}
    </div>
  );
}

/** Read-only stars, e.g. "you gave 4". */
export function Stars({ score }: { score: number }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${score} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`size-4 ${n <= score ? "fill-signal text-signal" : "text-border"}`} strokeWidth={1.5} aria-hidden="true" />
      ))}
    </span>
  );
}
