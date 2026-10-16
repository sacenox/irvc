import type { FormEventHandler, ReactNode } from "react";

// AuthShell is the chrome shared by sign-in and invite claim.
export default function AuthShell({
  subtitle,
  onSubmit,
  children,
}: {
  subtitle: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-6">
      <div className="w-full max-w-xs">
        <div className="mb-6 flex items-baseline gap-2">
          <span className="text-lg font-semibold text-accent">irvc</span>
          <span className="text-xs text-faint">{subtitle}</span>
        </div>
        <form onSubmit={onSubmit} className="space-y-2">
          {children}
        </form>
      </div>
    </div>
  );
}
