import { cn } from "cn";

// Toggle is a labelled on/off row, used for every boolean preference.
export function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="min-w-0">
        <span className="block truncate">{label}</span>
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </span>
      <span
        className={cn(
          "flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition-colors",
          checked ? "border-accent bg-accent/25" : "border-line bg-surface",
        )}
      >
        <span
          className={cn(
            "size-3.5 rounded-full transition-transform",
            checked ? "translate-x-4 bg-accent" : "bg-faint",
          )}
        />
      </span>
    </button>
  );
}
