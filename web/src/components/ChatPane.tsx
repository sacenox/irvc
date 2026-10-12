import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Paperclip, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { api, upload } from "../lib/api";
import type { Channel, Message, UserSummary } from "../lib/types";
import Markdown from "./Markdown";

const maxInputHeight = 200;
const maxSuggestions = 8;

// isMentioned reports whether body contains "@username" as a whole word.
function isMentioned(body: string, username: string) {
  return new RegExp(`(^|[^\\w-])@${username}(?![\\w-])`, "i").test(body);
}

// hasImage reports whether body contains a markdown image.
function hasImage(body: string) {
  return /!\[[^\]]*\]\([^)]+\)/.test(body);
}

// prose supplies the block-level markdown styling; the CSS vars retune its
// palette to the sepia theme.
const bodyClass =
  "prose prose-sm max-w-none min-w-0 flex-1 break-words [--tw-prose-body:var(--sepia)] [--tw-prose-headings:var(--sepia)] [--tw-prose-links:var(--gold)] [--tw-prose-bold:var(--sepia)] [--tw-prose-bullets:var(--sepia)] [--tw-prose-counters:var(--sepia)] [--tw-prose-quote-borders:color-mix(in_srgb,var(--sepia)_30%,transparent)] [--tw-prose-code:var(--sepia)] [--tw-prose-pre-code:var(--sepia)] [--tw-prose-pre-bg:color-mix(in_srgb,var(--sepia)_10%,transparent)] [--tw-prose-hr:color-mix(in_srgb,var(--sepia)_20%,transparent)] [--tw-prose-th-borders:color-mix(in_srgb,var(--sepia)_20%,transparent)] [--tw-prose-td-borders:color-mix(in_srgb,var(--sepia)_20%,transparent)]";

function clock(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPane({
  channel,
  messages,
  users,
  username,
}: {
  channel: Channel | null;
  messages: Message[];
  users: UserSummary[];
  username: string;
}) {
  const [body, setBody] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [mention, setMention] = useState<{ query: string; start: number; index: number } | null>(
    null,
  );
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Jump to the latest messages on channel switch, regardless of prior position.
  useLayoutEffect(() => {
    stickRef.current = true;
    scrollToBottom();
  }, [channel?.id, scrollToBottom]);

  // Follow appended messages only while the user is pinned to the bottom.
  useLayoutEffect(() => {
    if (stickRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  // Images and markdown grow after the effects above run, so stay pinned while
  // the content resizes — unless the user has scrolled up.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) scrollToBottom();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [channel?.id, scrollToBottom]);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxInputHeight)}px`;
  }, [body]);

  function insert(text: string) {
    const el = textareaRef.current;
    if (!el) {
      setBody((b) => b + text);
      return;
    }
    const { selectionStart: start, selectionEnd: end } = el;
    setBody((b) => b.slice(0, start) + text + b.slice(end));
  }

  function suggest(query: string) {
    const q = query.toLowerCase();
    return users.filter((u) => u.username.toLowerCase().startsWith(q)).slice(0, maxSuggestions);
  }

  // detectMention looks for an "@partial" token ending at the caret.
  function detectMention(value: string, caret: number) {
    const m = /(?:^|\s)@([\w-]*)$/.exec(value.slice(0, caret));
    const query = m?.[1];
    setMention(
      query !== undefined && suggest(query).length > 0
        ? { query, start: caret - query.length, index: 0 }
        : null,
    );
  }

  function chooseMention(name: string) {
    const el = textareaRef.current;
    if (!el || !mention) return;
    const caret = el.selectionStart ?? body.length;
    setBody(body.slice(0, mention.start) + name + " " + body.slice(caret));
    setMention(null);
    const pos = mention.start + name.length + 1;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  async function attach(files: File[]) {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const { url } = await upload(file);
        insert(`![${file.name}](${url})\n`);
      } catch {
        // ignore failed uploads
      }
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const images = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    e.preventDefault();
    attach(images);
  }

  function toggleImage(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // /collapse collapses every image in the current channel.
  function collapseAll() {
    setCollapsed(new Set(messages.filter((m) => hasImage(m.body)).map((m) => m.id)));
  }

  async function send() {
    const text = body.trim();
    if (!text || !channel) return;
    setBody("");
    setMention(null);
    if (text === "/collapse") {
      collapseAll();
      return;
    }
    try {
      await api(`/channels/${channel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
    } catch {
      setBody(text);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const matches = mention ? suggest(mention.query) : [];
    if (mention && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMention({ ...mention, index: (mention.index + 1) % matches.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMention({ ...mention, index: (mention.index - 1 + matches.length) % matches.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        chooseMention(matches[mention.index].username);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  if (!channel) {
    return <div className="grid flex-1 place-items-center text-sm text-sepia/40">no channel</div>;
  }

  return (
    <>
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div ref={contentRef}>
          {messages.map((m) => {
            const action = m.body.startsWith("/me ") ? m.body.slice(4) : null;
            const hit = !action && isMentioned(m.body, username);
            return (
              <div
                key={m.id}
                className={cn(
                  "-mx-1.5 flex gap-1.5 rounded px-1.5 py-0.5 text-sm leading-6",
                  hit && "bg-[color-mix(in_srgb,var(--gold)_14%,transparent)]",
                )}
              >
                <span className="shrink-0">
                  <span className="text-sepia/40">{clock(m.createdAt)}</span>{" "}
                  {!action && <span className="text-gold/90">{m.username}</span>}
                </span>
                {action ? (
                  <div className="min-w-0 flex-1 break-words italic text-gold/90">
                    * {m.username} {action}
                  </div>
                ) : (
                  <div className={bodyClass}>
                    <Markdown
                      text={m.body}
                      collapsed={collapsed.has(m.id)}
                      onToggle={() => toggleImage(m.id)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <form
        onSubmit={submit}
        className="relative flex items-end gap-2 border-t border-sepia/15 p-3"
      >
        {mention && suggest(mention.query).length > 0 && (
          <div className="absolute bottom-full left-2 mb-1 w-56 overflow-hidden rounded-lg border border-border bg-panel shadow-lg">
            {suggest(mention.query).map((u, i) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => chooseMention(u.username)}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-sm",
                  i === mention.index ? "bg-accent text-accent-foreground" : "text-sepia",
                )}
              >
                {u.username}
              </button>
            ))}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            attach([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="attach image"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip />
        </Button>
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={`message #${channel.name}`}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="max-h-[200px] w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1 text-base leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 md:text-sm"
        />
        <Button type="submit" size="icon" title="send">
          <SendHorizontal />
        </Button>
      </form>
    </>
  );
}
