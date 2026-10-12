import { cn } from "cn";

// Dim until active (speaking / online), then lights up.
export default function Dot({ on }: { on: boolean }) {
  return <span className={cn("h-2 w-2 rounded-full transition-colors", on ? "bg-gold" : "bg-sepia/25")} />;
}
