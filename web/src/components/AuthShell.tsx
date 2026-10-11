import type { FormEvent, ReactNode } from "react";

export default function AuthShell({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="w-full max-w-xs">
        <h1 className="text-lg font-semibold text-gold">irvc</h1>
        <p className="mb-6 text-xs text-sepia/50">{title}</p>
        <form onSubmit={onSubmit} className="space-y-3">
          {children}
        </form>
      </div>
    </div>
  );
}
