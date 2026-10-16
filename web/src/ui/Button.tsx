import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "cn";

export type Variant = "primary" | "secondary" | "ghost" | "danger";
export type Size = "sm" | "md" | "lg";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cn("btn", `btn-${variant}`, `btn-${size}`, className)}
      {...props}
    />
  );
}

// IconButton is a square button. `label` is required: it is the only thing
// screen readers and tooltips have to go on.
export function IconButton({
  label,
  variant = "ghost",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "btn",
        `btn-${variant}`,
        "icon-btn",
        `icon-btn-${size}`,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
