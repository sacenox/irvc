import { useEffect, useRef, useState, type FormEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "../lib/api";
import type { Channel, Message } from "../lib/types";

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

  useEffect(() => {
    endRef.current?.scrollIntoView();
  }, [messages]);

  async function submit(e: FormEvent) {
    e.preventDefault();
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

  if (!channel) {
    return <div className="grid flex-1 place-items-center text-sm text-sepia/40">no channel</div>;
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.map((m) => (
          <div key={m.id} className="py-0.5 text-sm leading-6">
            <span className="text-sepia/40">{clock(m.createdAt)} </span>
            <span className="text-gold/90">{m.username}</span>{" "}
            <span className="text-sepia">{m.body}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-sepia/15 p-3">
        <Input
          placeholder={`message #${channel.name}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" size="icon" title="send">
          <SendHorizontal />
        </Button>
      </form>
    </>
  );
}
