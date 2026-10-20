import { useToasts } from "../lib/toast";

// Toasts is the one place transient errors surface. It sits at the top of the
// window, out of the composer's way, and is inert to the pointer.
export default function Toasts() {
  const toasts = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-1 px-4">
      {toasts.map((t) => (
        <div key={t.id} role="status" className="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}
