import type { ReactNode } from "react";
import { HeadphoneOff, MicOff } from "lucide-react";
import { cn } from "cn";

// Dot is the shared presence/speaking indicator.
export function Dot({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "size-2 shrink-0 rounded-full transition-colors",
        on ? "bg-accent" : "bg-faint/50",
        className,
      )}
    />
  );
}

// VoiceMarks is the dim "cannot hear me" marker next to a name in every voice
// roster: microphone muted, deafened, or both.
export function VoiceMarks({
  muted,
  deafened,
  className,
}: {
  muted: boolean;
  deafened: boolean;
  className?: string;
}) {
  if (!muted && !deafened) return null;
  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-faint", className)}>
      {muted && <MicOff role="img" aria-label="microphone muted" className="size-3" />}
      {deafened && <HeadphoneOff role="img" aria-label="deafened" className="size-3" />}
    </span>
  );
}

export function Section({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <h2 className="section-label px-0">{label}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-4 animate-spin rounded-full border-2 border-line border-t-accent",
        className,
      )}
    />
  );
}

export function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-6 text-sm text-muted">{children}</div>
  );
}
