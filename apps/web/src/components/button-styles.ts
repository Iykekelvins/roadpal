// Shared button look for <button> and <Link> alike. Hover only applies on devices that can hover
// (Tailwind v4 default), press feedback is a small scale, and keyboard focus gets a visible ring.

const base =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-extrabold select-none " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-out " +
  "active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 " +
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary";

const variants = {
  /** "I need help": amber, used sparingly so it keeps its meaning. */
  signal: "bg-signal text-on-signal hover:bg-signal-hover",
  primary: "bg-primary text-on-primary hover:bg-primary-hover",
  outline: "border-2 border-text text-text hover:bg-text hover:text-ground",
  /** Light button on a primary-coloured section. */
  inverse: "bg-surface text-text hover:bg-primary-soft focus-visible:outline-on-primary",
} as const;

const sizes = {
  sm: "h-11 px-4 text-sm",
  lg: "h-14 px-7 text-lg",
} as const;

export function buttonStyles({
  variant = "primary",
  size = "lg",
  className = "",
}: {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
} = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}
