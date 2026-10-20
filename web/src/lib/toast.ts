import { useSyncExternalStore } from "react";

export type Toast = { id: number; text: string };

// How long a toast lives, matching the fade-out in index.css (.toast).
const life = 5000;

let toasts: Toast[] = [];
let nextId = 1;
const subs = new Set<() => void>();

function publish() {
  subs.forEach((fn) => fn());
}

// toast surfaces a transient error and lets it fade away on its own.
export function toast(text: string) {
  const t = { id: nextId++, text };
  toasts = [...toasts, t];
  publish();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    publish();
  }, life);
}

export function useToasts() {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    () => toasts,
  );
}
