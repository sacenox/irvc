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
import {
  Heart,
  Laugh,
  Paperclip,
  Pencil,
  SendHorizontal,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { api, upload } from "../lib/api";
import type { Channel, Message, Reaction, UserSummary } from "../lib/types";
import Markdown from "./Markdown";

const reactions: { key: Reaction; label: string; Icon: typeof ThumbsUp }[] = [
  { key: "+1", label: "+1", Icon: ThumbsUp },
  { key: "-1", label: "-1", Icon: ThumbsDown },
  { key: "heart", label: "like", Icon: Heart },
  { key: "laugh", label: "laugh", Icon: Laugh },
];

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
  "prose prose-sm max-w-none break-words [--tw-prose-body:var(--sepia)] [--tw-prose-quotes:var(--sepia)] [--tw-prose-headings:var(--sepia)] [--tw-prose-links:var(--gold)] [--tw-prose-bold:var(--sepia)] [--tw-prose-bullets:var(--sepia)] [--tw-prose-counters:var(--sepia)] [--tw-prose-quote-borders:color-mix(in_srgb,var(--sepia)_30%,transparent)] [--tw-prose-code:var(--sepia)] [--tw-prose-pre-code:var(--sepia)] [--tw-prose-pre-bg:color-mix(in_srgb,var(--sepia)_10%,transparent)] [--tw-prose-hr:color-mix(in_srgb,var(--sepia)_20%,transparent)] [--tw-prose-th-borders:color-mix(in_srgb,var(--sepia)_20%,transparent)] [--tw-prose-td-borders:color-mix(in_srgb,var(--sepia)_20%,transparent)]";

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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
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
    setEditingId(null);
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

  // The whole window is a drop target for image files. Keep the latest attach()
  // in a ref so the listeners below are registered once.
  const attachRef = useRef(attach);
  attachRef.current = attach;
  const hasChannel = channel !== null;
  useEffect(() => {
    if (!hasChannel) return;
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    // preventDefault on dragover is what makes the window a valid drop target;
    // on drop it stops the browser from navigating to the file.
    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      attachRef.current([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [hasChannel]);

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

  function startEdit(m: Message) {
    setEditingId(m.id);
    setEditBody(m.body);
  }

  async function saveEdit(id: number) {
    const text = editBody.trim();
    setEditingId(null);
    if (!text) return;
    await api(`/messages/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: text }),
    }).catch(() => {});
  }

  async function remove(id: number) {
    await api(`/messages/${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function toggleReaction(id: number, reaction: Reaction) {
    await api(`/messages/${id}/reactions`, {
      method: "POST",
      body: JSON.stringify({ reaction }),
    }).catch(() => {});
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
    if (e.key === "ArrowUp" && !body) {
      const last = [...messages].reverse().find((m) => m.username === username);
      if (last) {
        e.preventDefault();
        startEdit(last);
      }
      return;
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
            const own = m.username === username;
            const editing = editingId === m.id;
            return (
              <div
                key={m.id}
                className={cn(
                  "group relative -mx-1.5 rounded px-1.5 py-0.5 text-sm leading-6 hover:bg-sepia/5",
                  hit && "bg-[color-mix(in_srgb,var(--gold)_14%,transparent)]",
                )}
              >
                {action && !editing ? (
                  <div className="break-words italic text-gold/90">
                    <span className="mr-1 not-italic text-sepia/40">{clock(m.createdAt)}</span>
                    * {m.username} {action}
                    {m.editedAt ? (
                      <span className="ml-1 not-italic text-xs text-sepia/40">(edited)</span>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="text-sepia/40">
                      {clock(m.createdAt)}
                      {!action && <span className="text-gold/90"> {m.username}</span>}
                      {m.editedAt ? (
                        <span className="ml-1 text-xs text-sepia/40">(edited)</span>
                      ) : null}
                    </div>
                    {editing ? (
                      <textarea
                        autoFocus
                        rows={Math.min(editBody.split("\n").length, 8)}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingId(null);
                          } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            saveEdit(m.id);
                          }
                        }}
                        className="block max-h-[200px] w-full resize-none rounded border border-input bg-transparent px-2 py-0.5 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30"
                      />
                    ) : (
                      <div className={bodyClass}>
                        <Markdown
                          text={m.body}
                          collapsed={collapsed.has(m.id)}
                          onToggle={() => toggleImage(m.id)}
                        />
                      </div>
                    )}
                  </>
                )}
                {!editing && m.reactions && Object.keys(m.reactions).length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1 pb-0.5">
                    {reactions.map(({ key, Icon }) => {
                      const list = m.reactions?.[key];
                      if (!list?.length) return null;
                      const active = list.includes(username);
                      return (
                        <button
                          key={key}
                          type="button"
                          title={list.join(", ")}
                          onClick={() => toggleReaction(m.id, key)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs leading-none transition-colors",
                            active
                              ? "border-gold/50 bg-gold/15 text-gold"
                              : "border-sepia/20 bg-sepia/5 text-sepia/70 hover:border-sepia/40",
                          )}
                        >
                          <Icon className="size-3" />
                          {list.length}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!editing && (
                  <div className="absolute right-1.5 top-0.5 hidden items-center gap-0.5 rounded-md border border-sepia/15 bg-panel px-0.5 shadow-sm group-hover:flex">
                    {reactions.map(({ key, label, Icon }) => (
                      <Button
                        key={key}
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        title={label}
                        onClick={() => toggleReaction(m.id, key)}
                      >
                        <Icon />
                      </Button>
                    ))}
                    {own && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title="edit message"
                          onClick={() => startEdit(m)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title="delete message"
                          onClick={() => remove(m.id)}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
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
          placeholder={`message ${channel.type === "dm" ? "@" : "#"}${channel.name}`}
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
