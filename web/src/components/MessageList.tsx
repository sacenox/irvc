import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { Heart, Laugh, MoreHorizontal, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "cn";
import { IconButton, TextArea } from "@/ui";
import type { Message, Reaction } from "../lib/types";
import { Time, dayKey, formatDay } from "../lib/time";
import Markdown from "./Markdown";
import { userColor } from "../lib/scheme";

export const reactions: { key: Reaction; label: string; Icon: typeof ThumbsUp }[] = [
  { key: "+1", label: "+1", Icon: ThumbsUp },
  { key: "-1", label: "-1", Icon: ThumbsDown },
  { key: "heart", label: "like", Icon: Heart },
  { key: "laugh", label: "laugh", Icon: Laugh },
];

// isMentioned reports whether body contains "@username" as a whole word.
export function isMentioned(body: string, username: string) {
  return new RegExp(`(^|[^\\w-])@${username}(?![\\w-])`, "i").test(body);
}

// hasImage reports whether body contains a markdown image.
export function hasImage(body: string) {
  return /!\[[^\]]*\]\([^)]+\)/.test(body);
}

export default function MessageList({
  messages,
  username,
  collapsed,
  editing,
  activeId,
  onSelect,
  onToggleImages,
  onEditBody,
  onCancelEdit,
  onSaveEdit,
}: {
  messages: Message[];
  username: string;
  collapsed: Set<number>;
  editing: { id: number; body: string } | null;
  activeId: number | null;
  onSelect: (msg: Message) => void;
  onToggleImages: (id: number) => void;
  onEditBody: (body: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // The scrollTop we last set ourselves. Our scroll-to-bottom can queue a
  // scroll event that is handled only after a lazy image grows the list, so
  // the gap to the bottom reads large even though the reader never scrolled.
  const pinned = useRef(0);

  const pin = () => {
    const el = list.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
    pinned.current = el.scrollTop;
  };

  // Follow new messages while the reader stays at the bottom. The channel is
  // remounted on switch, so this also lands on the newest message.
  useLayoutEffect(pin);

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    // Images load after the effect above, so follow the bottom on resize too.
    const ro = new ResizeObserver(pin);
    ro.observe(el.firstElementChild ?? el);
    const onScroll = () => {
      // A scroll still sitting where we pinned is ours, so leave stick alone.
      if (el.scrollTop === pinned.current) return;
      stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      ref={list}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2 [scrollbar-gutter:stable]"
    >
      <div>
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const action = m.body.startsWith("/me ") ? m.body.slice(4) : null;
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const grouped =
            !action &&
            !newDay &&
            prev !== undefined &&
            !prev.body.startsWith("/me ") &&
            prev.username === m.username &&
            m.createdAt - prev.createdAt < 300;
          return (
            <Fragment key={m.id}>
              {newDay && <DaySeparator ts={m.createdAt} />}
              <Row
                message={m}
                action={action}
                grouped={grouped}
                username={username}
                mentioned={!action && isMentioned(m.body, username)}
                active={activeId === m.id}
                editing={editing?.id === m.id}
                editBody={editing?.body ?? ""}
                collapsed={collapsed.has(m.id)}
                onSelect={() => onSelect(m)}
                onToggleImages={() => onToggleImages(m.id)}
                onEditBody={onEditBody}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
              />
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function DaySeparator({ ts }: { ts: number }) {
  return (
    <div role="separator" className="flex items-center gap-3 px-3 py-2 md:px-4">
      <div className="h-px flex-1 bg-line" />
      <span className="text-[0.7rem] text-fg">{formatDay(ts)}</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

function Row({
  message: m,
  action,
  grouped,
  username,
  mentioned,
  active,
  editing,
  editBody,
  collapsed,
  onSelect,
  onToggleImages,
  onEditBody,
  onSaveEdit,
  onCancelEdit,
}: {
  message: Message;
  action: string | null;
  grouped: boolean;
  username: string;
  mentioned: boolean;
  active: boolean;
  editing: boolean;
  editBody: string;
  collapsed: boolean;
  onSelect: () => void;
  onToggleImages: () => void;
  onEditBody: (body: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    el.focus();
  }, [editing]);

  const menuButton = (hidden: boolean) => (
    <IconButton
      label="message actions"
      size="sm"
      className={cn(
        "size-6 text-faint",
        active && "bg-raised text-fg",
        // Continuation rows keep the actions out of sight so the list stays
        // calm, but the button remains in the accessibility tree and is
        // revealed on keyboard focus. Tapping the row works too.
        hidden && "pointer-events-none opacity-0 focus:pointer-events-auto focus:opacity-100",
      )}
      onClick={onSelect}
    >
      <MoreHorizontal size={14} />
    </IconButton>
  );

  if (action) {
    return (
      <div className="flex items-baseline gap-2 px-3 py-1 text-sm italic md:px-4">
        <span className="not-italic text-accent" style={{ color: userColor(m.username, "var(--accent)") }}>
          * {m.username}
        </span>
        <span className="min-w-0 flex-1">{action}</span>
        <Time ts={m.createdAt} className="text-[0.7rem] not-italic text-faint" />
      </div>
    );
  }

  const chips = [...chipsOf(m.reactions)].filter(([, who]) => who.length > 0);

  return (
    <div
      // Tapping anywhere in the row selects it. Skipped while text is being
      // selected, and when the tap lands on a link or the actions button.
      onClick={(e) => {
        if (!window.getSelection()?.isCollapsed) return;
        if ((e.target as HTMLElement).closest("a,button")) return;
        onSelect();
      }}
      className={cn(
        "relative flex gap-2 px-3 py-0.5 md:px-4",
        mentioned ? "bg-accent/10" : active && "bg-raised",
      )}
    >
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span
              className="text-sm font-medium text-accent"
              style={{ color: userColor(m.username, "var(--accent)") }}
            >
              {m.username}
            </span>
            <Time ts={m.createdAt} className="text-[0.7rem] text-faint" />
            {!!m.editedAt && <span className="text-[0.7rem] text-faint">(edited)</span>}
            <span className="ml-auto -my-0.5">{menuButton(false)}</span>
          </div>
        )}
        {editing ? (
          <div className="py-1 pl-5 md:pl-8">
            <TextArea
              ref={textarea}
              rows={1}
              value={editBody}
              onChange={(e) => onEditBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancelEdit();
                else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  onSaveEdit();
                }
              }}
            />
            <div className="flex gap-1 pt-1">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelEdit}>
                cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onSaveEdit}>
                save
              </button>
            </div>
          </div>
        ) : (
          <div className="md pl-5 md:pl-8">
            <Markdown text={m.body} collapsed={collapsed} onToggle={onToggleImages} />
          </div>
        )}
        {grouped && <span className="absolute top-0 right-2 md:right-3">{menuButton(true)}</span>}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1 pl-5 md:pl-8">
            {chips.map(([key, who]) => {
              const Icon = reactions.find((r) => r.key === key)!.Icon;
              return (
                <button
                  key={key}
                  type="button"
                  title={who.join(", ")}
                  onClick={onSelect}
                  className={cn("chip", who.includes(username) && "chip-active")}
                >
                  <Icon className="size-3" />
                  {who.length}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function chipsOf(reactions?: Partial<Record<Reaction, string[]>>) {
  return Object.entries(reactions ?? {}) as [Reaction, string[]][];
}
