import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ImagePlus, SendHorizontal, Smile, X } from "lucide-react";
import { cn } from "cn";
import { Button, IconButton } from "@/ui";
import { api, gifs, upload } from "../lib/api";
import { toast } from "../lib/toast";
import type { Channel, Gif, UserSummary } from "../lib/types";

const maxInputHeight = 200;
const maxSuggestions = 8;

export default function Composer({
  channel,
  users,
  onEditLast,
  onCollapse,
  onTyping,
}: {
  channel: Channel;
  users: UserSummary[];
  onEditLast: () => void;
  onCollapse: () => void;
  onTyping: () => void;
}) {
  const [body, setBody] = useState("");
  const [mention, setMention] = useState<{ query: string; start: number; index: number } | null>(
    null,
  );
  const [picker, setPicker] = useState<{ gifs: Gif[]; query: string } | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxInputHeight)}px`;
  }, [body]);

  function insert(text: string) {
    const el = textarea.current;
    if (!el) return setBody((b) => b + text);
    const { selectionStart: start, selectionEnd: end } = el;
    setBody((b) => b.slice(0, start) + text + b.slice(end));
  }

  function suggest(query: string) {
    const q = query.toLowerCase();
    return users.filter((u) => u.username.toLowerCase().startsWith(q)).slice(0, maxSuggestions);
  }

  // detectMention looks for an "@partial" token ending at the caret.
  function detectMention(value: string, caret: number) {
    const query = /(?:^|\s)@([\w-]*)$/.exec(value.slice(0, caret))?.[1];
    setMention(
      query !== undefined && suggest(query).length > 0
        ? { query, start: caret - query.length, index: 0 }
        : null,
    );
  }

  function chooseMention(name: string) {
    const el = textarea.current;
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
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const { url } = await upload(f);
        insert(`![${f.name}](${url})\n`);
      } catch {
        // a failed upload should not block the rest
      }
    }
  }

  async function openGifs(query: string) {
    try {
      setPicker({ gifs: await gifs(query), query });
    } catch {
      // the picker simply stays closed
    }
  }

  function pickGif(g: Gif) {
    insert(`![gif](${g.url})\n`);
    setPicker(null);
    textarea.current?.focus();
  }

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBody("");
    setMention(null);
    if (text === "/collapse") return onCollapse();
    const gif = /^\/gif(?:\s+(.*))?$/.exec(text);
    if (gif) return void openGifs(gif[1]?.trim() ?? "");
    try {
      await api(`/channels/${channel.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: text }),
      });
    } catch (e) {
      setBody(text);
      toast(e instanceof Error ? e.message : "could not send message");
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const matches = mention ? suggest(mention.query) : [];
    if (mention && matches.length > 0) {
      const keys = ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"];
      if (keys.includes(e.key)) {
        e.preventDefault();
        if (e.key === "ArrowDown")
          setMention({ ...mention, index: (mention.index + 1) % matches.length });
        else if (e.key === "ArrowUp")
          setMention({ ...mention, index: (mention.index - 1 + matches.length) % matches.length });
        else if (e.key === "Escape") setMention(null);
        else chooseMention(matches[mention.index].username);
        return;
      }
    }
    if (e.key === "ArrowUp" && !body) {
      e.preventDefault();
      onEditLast();
    } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  // Images pasted anywhere in the composer are uploaded and inlined.
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const images = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    e.preventDefault();
    attach(images);
  }

  // Dropping an image anywhere on the page attaches it. The listener is
  // registered once and reads attach through a ref.
  const attachRef = useRef(attach);
  attachRef.current = attach;
  useEffect(() => {
    const files = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const onDragOver = (e: DragEvent) => {
      if (files(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!files(e)) return;
      e.preventDefault();
      attachRef.current([...(e.dataTransfer?.files ?? [])]);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <div className="relative shrink-0 px-2 pt-1 pb-2 md:px-3 md:pb-3">
      {picker && (
        <GifPicker
          state={picker}
          onChange={setPicker}
          onSearch={openGifs}
          onPick={pickGif}
          onClose={() => setPicker(null)}
        />
      )}
      {mention && suggest(mention.query).length > 0 && (
        <div className="absolute bottom-full left-2 z-40 mb-1 w-56 overflow-hidden rounded-lg border border-line bg-raised py-1 shadow-xl md:left-3">
          {suggest(mention.query).map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => chooseMention(u.username)}
              className={cn("menu-item", i === mention.index && "bg-surface")}
            >
              {u.username}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-1.5 rounded-lg border border-line bg-raised p-1.5 focus-within:border-accent"
      >
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            attach([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <IconButton
          label="attach image"
          size="sm"
          onClick={() => file.current?.click()}
          className="mb-0.5"
        >
          <ImagePlus />
        </IconButton>
        <IconButton label="gif picker" size="sm" className="mb-0.5" onClick={() => openGifs("")}>
          <Smile />
        </IconButton>
        <textarea
          ref={textarea}
          rows={1}
          placeholder={`message ${channel.type === "dm" ? "@" : "#"}${channel.name}`}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (e.target.value.trim()) onTyping();
            detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          className="max-h-[200px] min-h-7 flex-1 resize-none self-center bg-transparent py-1 text-base leading-6 outline-none md:text-sm"
        />
        <Button
          type="submit"
          variant="primary"
          size="sm"
          className="mb-0.5"
          disabled={!body.trim()}
          aria-label="send message"
        >
          <SendHorizontal />
        </Button>
      </form>
    </div>
  );
}

function GifPicker({
  state,
  onChange,
  onSearch,
  onPick,
  onClose,
}: {
  state: { gifs: Gif[]; query: string };
  onChange: (state: { gifs: Gif[]; query: string }) => void;
  onSearch: (query: string) => void;
  onPick: (g: Gif) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-2 bottom-full z-40 mb-1 w-[min(24rem,calc(100vw-1rem))] rounded-lg border border-line bg-raised p-2 shadow-xl md:right-3">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={state.query}
          onChange={(e) => onChange({ ...state, query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSearch(state.query.trim());
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="search gifs"
          className="input input-md"
        />
        <IconButton label="close gif picker" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      {state.gifs.length === 0 ? (
        <p className="px-1 py-3 text-sm text-faint">no results</p>
      ) : (
        <div className="mt-1.5 grid max-h-72 grid-cols-3 gap-1 overflow-y-auto">
          {state.gifs.map((g) => (
            <button
              key={g.url}
              type="button"
              onClick={() => onPick(g)}
              className="overflow-hidden rounded-md border border-line transition-colors hover:border-accent/60"
            >
              <img src={g.preview} alt="" loading="lazy" className="h-24 w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
