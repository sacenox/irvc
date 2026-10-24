import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EyeOff, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";
import { Button, IconButton } from "@/ui";
import type { Message, Reaction } from "../lib/types";
import { reactions } from "./MessageList";

// MessageActions is the contextual popover for the selected message: tap the ⋯
// on any message (or the row) and the actions float beside it, reachable on
// touch screens and by keyboard alike. It is portalled and positioned
// absolutely, so opening it never reflows the message list. Its right edge is
// anchored to the element that was acted on, given by the caller, so the same
// message shown twice (the channel and the pinned sidebar) still opens the
// popover where it was clicked.
export default function MessageActions({
  message,
  anchor,
  own,
  pinned,
  onReact,
  onPin,
  onEdit,
  onDelete,
  onRemovePreview,
  onClose,
}: {
  message: Message;
  anchor: HTMLElement;
  own: boolean;
  pinned: boolean;
  onReact: (reaction: Reaction) => void;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRemovePreview: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Track the anchor element through list scrolling, resizes and relayouts.
  useLayoutEffect(() => {
    const place = () => {
      // The row can vanish under us (someone else unpinned or deleted it).
      if (!anchor.isConnected) return;
      const r = anchor.getBoundingClientRect();
      const p = panel.current!.getBoundingClientRect();
      let top = r.bottom + 4;
      if (top + p.height > innerHeight - 8) top = Math.max(8, r.top - p.height - 4);
      const left = Math.max(8, Math.min(r.right - p.width, innerWidth - p.width - 8));
      setPos((prev) => (prev?.top === top && prev.left === left ? prev : { top, left }));
    };
    place();
    addEventListener("scroll", place, true);
    addEventListener("resize", place);
    const ro = new ResizeObserver(place);
    ro.observe(panel.current!);
    return () => {
      removeEventListener("scroll", place, true);
      removeEventListener("resize", place);
      ro.disconnect();
    };
  }, [anchor, own]);

  return createPortal(
    <div
      ref={panel}
      role="toolbar"
      aria-label="message actions"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
      className="fixed z-40 flex w-max max-w-[calc(100vw-1rem)] flex-wrap items-center gap-1 rounded-lg border border-line bg-raised p-1.5 shadow-lg"
    >
      {reactions.map(({ key, label, Icon }) => (
        <IconButton
          key={key}
          label={`react ${label}`}
          size="sm"
          className="size-9"
          onClick={() => onReact(key)}
        >
          <Icon />
        </IconButton>
      ))}
      <span className="mx-1 h-6 w-px bg-line" />
      <Button size="sm" variant="ghost" onClick={onPin}>
        {pinned ? <PinOff /> : <Pin />} {pinned ? "unpin" : "pin"}
      </Button>
      {own && (
        <>
          <span className="mx-1 h-6 w-px bg-line" />
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil /> edit
          </Button>
          {message.preview?.kind === "card" && (
            <Button size="sm" variant="ghost" onClick={onRemovePreview}>
              <EyeOff /> remove preview
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={onDelete}>
            <Trash2 /> delete
          </Button>
        </>
      )}
      <span className="mx-1 h-6 w-px bg-line" />
      <IconButton label="close message actions" size="sm" onClick={onClose}>
        <X />
      </IconButton>
    </div>,
    document.body,
  );
}
