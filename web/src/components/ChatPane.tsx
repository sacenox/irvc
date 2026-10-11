import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import type { Channel, Message } from "../lib/types";
import Markdown from "./Markdown";

const maxInputHeight = 200;

// prose supplies the block-level markdown styling; the CSS vars retune its
// palette to the sepia theme.
const bodyClass =
  "prose prose-sm dark:prose-invert max-w-none min-w-0 flex-1 break-words [--tw-prose-body:var(--sepia)] [--tw-prose-headings:var(--sepia)] [--tw-prose-links:var(--gold)] [--tw-prose-bold:var(--sepia)] [--tw-prose-bullets:var(--sepia)] [--tw-prose-counters:var(--sepia)] [--tw-prose-quote-borders:color-mix(in_srgb,var(--sepia)_30%,transparent)] [--tw-prose-code:var(--sepia)] [--tw-prose-pre-code:var(--sepia)] [--tw-prose-pre-bg:color-mix(in_srgb,var(--sepia)_10%,transparent)] [--tw-prose-hr:color-mix(in_srgb,var(--sepia)_20%,transparent)] [--tw-prose-th-borders:color-mix(in_srgb,var(--sepia)_20%,transparent)] [--tw-prose-td-borders:color-mix(in_srgb,var(--sepia)_20%,transparent)]";

function clock(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatPane({
  channel,
  messages,
}: {
  channel: Channel | null;
  messages: Message[];
}) {
  const [body, setBody] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxInputHeight)}px`;
  }, [body]);

  async function send() {
    const text = body.trim();
    if (!text || !channel) return;
    setBody("");
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
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <div key={m.id} className="flex gap-1.5 py-0.5 text-sm leading-6">
            <span className="shrink-0">
              <span className="text-sepia/40">{clock(m.createdAt)}</span>{" "}
              <span className="text-gold/90">{m.username}</span>
            </span>
            <div className={bodyClass}>
              <Markdown text={m.body} />
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-sepia/15 p-3">
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={`message #${channel.name}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          className="max-h-[200px] w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1 text-base leading-6 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 md:text-sm"
        />
        <Button type="submit" size="icon" title="send">
          <SendHorizontal />
        </Button>
      </form>
    </>
  );
}
