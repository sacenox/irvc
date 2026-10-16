import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "cn";

// Menu is the single way to reveal secondary actions. It opens on a click or
// tap (never on hover, so it works everywhere), renders into a portal so it is
// never clipped by a scrolling parent, and closes on outside click or Escape.
export function Menu({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const r = wrap.current!.getBoundingClientRect();
    const p = panel.current!.getBoundingClientRect();
    let top = r.bottom + 4;
    if (top + p.height > innerHeight - 8) top = Math.max(8, r.top - p.height - 4);
    let left = align === "end" ? r.right - p.width : r.left;
    left = Math.max(8, Math.min(left, innerWidth - p.width - 8));
    setPos({ top, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    // The panel is portalled, so it is outside the wrapper: without this check
    // a press on an item would close the menu before the click landed.
    const down = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!wrap.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={wrap} className={cn("shrink-0", className)}>
      {/* The trigger is itself a button, so this wrapper only forwards the
          click; the child keeps the semantics (label, keyboard, focus). */}
      <div className="contents" onClick={() => setOpen((v) => !v)}>
        {trigger}
      </div>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
            className="menu fixed z-50"
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function MenuItem({
  onClick,
  danger,
  children,
  className,
}: {
  onClick?: () => void;
  danger?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn("menu-item", danger && "menu-item-danger", className)}
    >
      {children}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 py-1.5 text-[0.7rem] tracking-widest text-faint uppercase">{children}</div>;
}
