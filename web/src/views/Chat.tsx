import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Hash, Menu, MoreHorizontal, PhoneOff, Pin, ScreenShare, Settings as SettingsIcon, Trash2, Video, X } from "lucide-react";
import { cn } from "cn";
import { Button, Centered, IconButton, Menu as MenuPrimitive, MenuItem } from "@/ui";
import { api } from "../lib/api";
import { firstChannel } from "../lib/channels";
import { usePresence } from "../lib/presence";
import { useSettings } from "../lib/settings";
import { useTheme } from "../lib/theme";
import { toast } from "../lib/toast";
import { beep, useVoice, type VoiceState } from "../lib/voice";
import type { Channel, Message, MessagePage, Reaction, User, UserSummary, VoiceOccupant } from "../lib/types";
import CallView from "../components/CallView";
import Composer from "../components/Composer";
import MessageActions from "../components/MessageActions";
import MessageList from "../components/MessageList";
import { hasMedia } from "../lib/media";
import ScreenShareView from "../components/ScreenShare";
import Sidebar from "../components/Sidebar";
import VoiceBar from "../components/VoiceBar";
import SettingsView from "./Settings";

const voiceMessage = (state: VoiceState) => JSON.stringify({ type: "voice", ...state });
const hiddenDmsKey = "irvc.hiddenDms";

function loadHiddenDms(): number[] {
  try {
    return JSON.parse(localStorage.getItem(hiddenDmsKey) ?? "[]");
  } catch {
    return [];
  }
}

// Message ids whose images the user collapsed. Ids are global, so one flat set
// works across channels; only the newest are kept so it can't grow forever.
const collapsedKey = "irvc.collapsedImages";
const collapsedMax = 2000;

function loadCollapsed(): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(collapsedKey) ?? "[]"));
  } catch {
    return new Set();
  }
}

// The text channel or DM last opened, per user, so a reload lands back in it.
// Voice is deliberately never restored: rejoining a call must be an explicit act.
const lastChannelKey = (userId: number) => `irvc.lastChannel.${userId}`;

function loadLastChannel(userId: number): number | null {
  try {
    const id = Number(localStorage.getItem(lastChannelKey(userId)));
    return id > 0 ? id : null;
  } catch {
    return null;
  }
}

// How long a "typing" event keeps someone listed. Clients resend every few
// seconds while typing, so this only has to outlast that gap.
const typingTtl = 5_000;
const typingEvery = 3_000;

// typingLabel is the line shown under the message list.
function typingLabel(names: string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]} are typing…`;
  return "several people are typing…";
}

// Per-message preview state the user chose by hand (true = collapsed). Anything
// absent follows the "collapse previews by default" setting, so flipping that
// setting never fights an explicit choice. Only the newest entries are kept.
const previewKey = "irvc.previewCollapsed";
const previewMax = 2000;

function loadPreviewState(): Record<number, boolean> {
  try {
    return JSON.parse(localStorage.getItem(previewKey) ?? "{}");
  } catch {
    return {};
  }
}

export default function Chat({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [hiddenDms, setHiddenDms] = useState<number[]>(loadHiddenDms);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [collapsed, setCollapsed] = useState<Set<number>>(loadCollapsed);
  const [previewState, setPreviewState] = useState<Record<number, boolean>>(loadPreviewState);
  // The message being edited, and whether the pinned sidebar started it.
  // Only that view shows the editor, so a message on screen twice never opens
  // two textareas at once.
  const [editing, setEditing] = useState<{ id: number; body: string; pane: boolean } | null>(null);
  // The message whose actions are open, the element they are anchored to (the
  // same message can be on screen twice), and the view they were opened from.
  const [active, setActive] = useState<{
    message: Message;
    anchor: HTMLElement;
    pane: boolean;
  } | null>(null);
  // Pinned messages of the channel on screen, and whether the pane showing
  // them is open. Both only ever describe the selected channel.
  const [pins, setPins] = useState<Message[]>([]);
  const [showPins, setShowPins] = useState(false);
  const [voiceRooms, setVoiceRooms] = useState<Record<string, VoiceOccupant[]>>({});
  const [view, setView] = useState<"channel" | "settings">("channel");
  const [openShare, setOpenShare] = useState<string | null>(null);
  const [ringing, setRinging] = useState<number | null>(null);
  const desktop = useRef(matchMedia("(min-width: 768px)").matches);
  const [sidebarOpen, setSidebarOpen] = useState(desktop.current);
  const selectedId = useRef<number | null>(null);
  // The channel the messages in state came from.
  const loaded = useRef<number | null>(null);
  // The channel of the DM call we started, so we can tell the peer when it ends.
  const rangRef = useRef<number | null>(null);
  // The server drops our voice state when the socket dies, so keep the last
  // thing we told it and replay that on every (re)connect.
  const voiceState = useRef<VoiceState>({ channelId: 0, muted: false, deafened: false });
  const { settings, update } = useSettings();
  // channel id -> username -> when we last heard them type
  const [typing, setTyping] = useState<Record<number, Record<string, number>>>({});
  const lastTypingSent = useRef({ channel: 0, at: 0 });

  const markRead = useCallback((id: number) => {
    setUnread((u) => {
      if (!u[id]) return u;
      const next = { ...u };
      delete next[id];
      return next;
    });
    api(`/channels/${id}/read`, { method: "POST" }).catch(() => {});
  }, []);

  // Presence arrives as a snapshot on every connect, so a reconnect resyncs the
  // roster and voice occupancy. Replay our own voice channel on connect, since
  // the server drops occupancy when the socket dies.
  const { connected, send } = usePresence(
    (ev) => {
      if (ev.type === "presence") {
        setOnline(new Set(ev.users ?? []));
        if (ev.roster) setUsers(ev.roster);
        setVoiceRooms(ev.voice ?? {});
      } else if (ev.type === "channel" && ev.channel) {
        setChannels((cs) => (cs.some((c) => c.id === ev.channel!.id) ? cs : [...cs, ev.channel!]));
      } else if (ev.type === "channel_delete" && ev.channelId) {
        setChannels((cs) => cs.filter((c) => c.id !== ev.channelId));
      } else if (ev.type === "ring" && ev.channelId) {
        // Answering sends its own ring; ignore it when already in that call.
        if (voice.channel?.id === ev.channelId) return;
        setRinging(ev.channelId);
        // Answering means opening the DM, so surface it for the callee.
        const dm = channels.find((c) => c.id === ev.channelId);
        if (dm) open(dm);
        else
          api<Channel[]>("/channels")
            .then((cs) => {
              setChannels(cs);
              const c = cs.find((x) => x.id === ev.channelId);
              if (c) open(c);
            })
            .catch(() => {});
      } else if (ev.type === "typing") {
        if (!settings.typingIndicator || !ev.channelId || !ev.username) return;
        if (ev.username === user.username) return;
        setTyping((t) => ({
          ...t,
          [ev.channelId!]: { ...t[ev.channelId!], [ev.username!]: Date.now() },
        }));
      } else if (ev.type === "ring_end" && ev.channelId) {
        setRinging((r) => (r === ev.channelId ? null : r));
      } else if ((ev.type === "pin" || ev.type === "unpin") && ev.message) {
        const pinned = ev.message;
        if (pinned.channelId !== selectedId.current) return;
        // Pins read oldest first, like the channel they came from.
        setPins((p) =>
          ev.type === "pin"
            ? [...p.filter((m) => m.id !== pinned.id), pinned].sort((a, b) => a.id - b.id)
            : p.filter((m) => m.id !== pinned.id),
        );
      } else if (ev.message) {
        if (ev.type === "message") {
          // A sent message ends that person's typing.
          setTyping((t) => {
            const { [ev.message!.username]: _, ...rest } = t[ev.message!.channelId] ?? {};
            return t[ev.message!.channelId] ? { ...t, [ev.message!.channelId]: rest } : t;
          });
          setChannels((cs) => {
            if (!cs.some((c) => c.id === ev.message!.channelId)) {
              api<Channel[]>("/channels")
                .then(setChannels)
                .catch(() => {});
            }
            return cs;
          });
          if (ev.message.channelId === selectedId.current) markRead(ev.message.channelId);
          else if (ev.message.username !== user.username)
            setUnread((u) => ({
              ...u,
              [ev.message!.channelId]: (u[ev.message!.channelId] ?? 0) + 1,
            }));
        }
        if (ev.message.channelId === selectedId.current) {
          if (ev.type === "message") setMessages((prev) => [...prev, ev.message!]);
          else if (ev.type === "message_edit") {
            setMessages((prev) => prev.map((m) => (m.id === ev.message!.id ? ev.message! : m)));
            setPins((prev) => prev.map((m) => (m.id === ev.message!.id ? ev.message! : m)));
          } else if (ev.type === "message_delete") {
            setMessages((prev) => prev.filter((m) => m.id !== ev.message!.id));
            setPins((prev) => prev.filter((m) => m.id !== ev.message!.id));
          }
        }
      }
    },
    () => send(voiceMessage(voiceState.current)),
  );

  const voice = useVoice(settings, (state) => {
    voiceState.current = state;
    send(voiceMessage(state));
  });
  const theme = useTheme();

  // Ring while a peer calls us. The slow beep repeats (when enabled) until we
  // answer, they hang up, or the call times out as missed.
  useEffect(() => {
    if (ringing === null) return;
    const timeout = setTimeout(() => setRinging(null), 30_000);
    const sound = settings.ringSound ? (beep(880), setInterval(() => beep(880), 2000)) : 0;
    return () => {
      clearTimeout(timeout);
      clearInterval(sound);
    };
  }, [ringing, settings.ringSound]);

  // Joining the call answers the ring.
  useEffect(() => {
    if (ringing !== null && voice.channel?.id === ringing) setRinging(null);
  }, [ringing, voice.channel]);

  // Tell the peer when a DM call we started is over.
  useEffect(() => {
    const started = rangRef.current;
    if (started === null || voice.channel?.id === started) return;
    rangRef.current = null;
    api(`/channels/${started}/ring`, { method: "DELETE" }).catch(() => {});
  }, [voice.channel]);

  // The watched share lives in the LiveKit room, so it vanishes when the sharer
  // stops; the pane then falls back to the selected channel.
  const share = voice.shares.find((s) => s.id === openShare) ?? null;
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) irvc` : "irvc";
  }, [totalUnread]);

  useEffect(() => {
    localStorage.setItem(hiddenDmsKey, JSON.stringify(hiddenDms));
  }, [hiddenDms]);

  useEffect(() => {
    try {
      const ids = [...collapsed].sort((a, b) => a - b).slice(-collapsedMax);
      localStorage.setItem(collapsedKey, JSON.stringify(ids));
    } catch {
      // storage unavailable; collapse state just won't persist
    }
  }, [collapsed]);

  // Expire stale typing entries; the interval only runs while there are any.
  const anyTyping = Object.values(typing).some((c) => Object.keys(c).length > 0);
  useEffect(() => {
    if (!anyTyping) return;
    const id = setInterval(() => {
      const cutoff = Date.now() - typingTtl;
      setTyping((t) => {
        let changed = false;
        const next: typeof t = {};
        for (const [ch, users] of Object.entries(t)) {
          const live = Object.fromEntries(Object.entries(users).filter(([, at]) => at > cutoff));
          if (Object.keys(live).length !== Object.keys(users).length) changed = true;
          if (Object.keys(live).length) next[Number(ch)] = live;
          else if (Object.keys(users).length) changed = true;
        }
        return changed ? next : t;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [anyTyping]);

  // Turning the setting off hides everything already showing.
  useEffect(() => {
    if (!settings.typingIndicator) setTyping({});
  }, [settings.typingIndicator]);

  function sendTyping() {
    if (!settings.typingIndicator || !selected) return;
    const now = Date.now();
    const last = lastTypingSent.current;
    if (last.channel === selected.id && now - last.at < typingEvery) return;
    lastTypingSent.current = { channel: selected.id, at: now };
    send(JSON.stringify({ type: "typing", channelId: selected.id }));
  }

  // Escape dismisses the message actions pane, same as its close button.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  useEffect(() => {
    selectedId.current = selected?.id ?? null;
    setEditing(null);
    setActive(null);
  }, [selected]);

  useEffect(() => {
    if (selected?.type !== "text" && selected?.type !== "dm") return;
    try {
      localStorage.setItem(lastChannelKey(user.id), String(selected.id));
    } catch {
      // storage unavailable; the last channel just won't be remembered
    }
  }, [selected, user.id]);

  useEffect(() => {
    if (selected && !channels.some((c) => c.id === selected.id)) {
      setSelected(firstChannel(channels));
    }
  }, [channels, selected]);

  useEffect(() => {
    api<Channel[]>("/channels")
      .then((cs) => {
        setChannels(cs);
        setUnread(
          Object.fromEntries(cs.filter((c) => c.unread).map((c) => [c.id, c.unread as number])),
        );
        const last = loadLastChannel(user.id);
        const restored = cs.find(
          (c) =>
            c.id === last &&
            (c.type === "text" || (c.type === "dm" && !loadHiddenDms().includes(c.id))),
        );
        setSelected((s) => s ?? restored ?? firstChannel(cs));
      })
      .catch(() => {});
    api<UserSummary[]>("/users")
      .then(setUsers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selected?.type !== "text" && selected?.type !== "dm") {
      setMessages([]);
      setHasMore(false);
      return;
    }
    const id = selected.id;
    // The channel the loaded messages belong to, so a click on the hint can
    // never page a channel that is not on screen.
    loaded.current = null;
    setHasMore(false);
    setLoadingOlder(false);
    api<MessagePage>(`/channels/${id}/messages`)
      .then((page) => {
        if (selectedId.current !== id) return;
        loaded.current = id;
        setMessages(page.messages);
        setHasMore(page.hasMore);
      })
      .catch(() => {});
  }, [selected]);

  // Pins are per channel and only matter for the one on screen: the header
  // button and the pane both read this list. Asking for them here keeps the
  // pane instant when it opens, and keeps the button honest about whether the
  // channel has any.
  useEffect(() => {
    setPins([]);
    setShowPins(false);
    if (selected?.type !== "text" && selected?.type !== "dm") return;
    const id = selected.id;
    api<Message[]>(`/channels/${id}/pins`)
      .then((p) => {
        if (selectedId.current === id) setPins(p);
      })
      .catch(() => {});
  }, [selected]);

  // loadOlder appends the page above the first loaded message. It only runs
  // when the reader asks for it, so a slow channel costs nothing to scroll.
  async function loadOlder() {
    const id = selected?.id;
    const before = messages[0]?.id;
    if (id === undefined || before === undefined || loaded.current !== id || loadingOlder || !hasMore)
      return;
    setLoadingOlder(true);
    try {
      const page = await api<MessagePage>(`/channels/${id}/messages?before=${before}`);
      if (selectedId.current !== id) return;
      setMessages((prev) => [...page.messages, ...prev]);
      setHasMore(page.hasMore);
    } catch {
      // The hint stays put, so the reader can try again.
    } finally {
      if (selectedId.current === id) setLoadingOlder(false);
    }
  }

  // Opening a channel clears its badge and tells the server, so the count stays
  // right on the next cold start and on the user's other devices.
  useEffect(() => {
    if (selected && (selected.type === "text" || selected.type === "dm")) markRead(selected.id);
  }, [selected, markRead]);

  // Opening a share also leaves the settings pane, so the stream is visible
  // straight away no matter where the click came from.
  function showShare(id: string) {
    setOpenShare(id);
    setView("channel");
  }

  function open(c: Channel) {
    setSelected(c);
    if (c.type === "dm") setHiddenDms((ids) => ids.filter((id) => id !== c.id));
    setView("channel");
    setOpenShare(null);
    if (!desktop.current) setSidebarOpen(false);
  }

  // startCall opens a DM video call and rings the peer. Joining leaves any
  // voice channel first, since only one call can use the mic and camera.
  function startCall(c: Channel) {
    rangRef.current = c.id;
    voice.join(c);
    api(`/channels/${c.id}/ring`, { method: "POST" }).catch(() => {});
  }

  async function selectUser(u: UserSummary) {
    try {
      const dm = await api<Channel>(`/dms/${u.id}`, { method: "POST" });
      setChannels((cs) => (cs.some((c) => c.id === dm.id) ? cs : [...cs, dm]));
      open(dm);
    } catch {
      // a DM that will not open is not worth an error state
    }
  }

  async function createChannel(type: "text" | "voice", name: string) {
    try {
      const channel = await api<Channel>("/channels", {
        method: "POST",
        body: JSON.stringify({ type, name }),
      });
      setChannels((cs) => (cs.some((c) => c.id === channel.id) ? cs : [...cs, channel]));
    } catch {
      // A rejected name keeps the sidebar form open; nothing else to do.
    }
  }

  async function deleteChannel(c: Channel) {
    if (c.type === "text" && !confirm(`Delete #${c.name} and all its messages?`)) return;
    await api(`/channels/${c.id}`, { method: "DELETE" }).catch(() => {});
  }

  function react(m: Message, reaction: Reaction) {
    api(`/messages/${m.id}/reactions`, {
      method: "POST",
      body: JSON.stringify({ reaction }),
    }).catch(() => {});
  }

  // The actions overlay pins and unpins with the same click. The server pushes
  // the change back to every client, this one included.
  function pinMessage(m: Message, pinned: boolean) {
    api(`/messages/${m.id}/pin`, { method: pinned ? "DELETE" : "POST" }).catch((e: Error) =>
      toast(e.message),
    );
  }

  function togglePin(m: Message) {
    setActive(null);
    pinMessage(m, pins.some((p) => p.id === m.id));
  }

  function startEdit(m: Message, pane: boolean) {
    setEditing({ id: m.id, body: m.body, pane });
    setActive(null);
  }

  function startEditLast() {
    const last = [...messages].reverse().find((m) => m.username === user.username);
    if (last) startEdit(last, false);
  }

  async function saveEdit() {
    if (!editing) return;
    const { id } = editing;
    const body = editing.body.trim();
    setEditing(null);
    if (!body || body === messages.find((m) => m.id === id)?.body) return;
    await api(`/messages/${id}`, { method: "PATCH", body: JSON.stringify({ body }) }).catch(
      (e: Error) => toast(e.message),
    );
  }

  // Removing a preview removes it for everyone; the server pushes the updated
  // message to all clients, so only failures need handling here.
  function removePreview(m: Message) {
    setActive(null);
    api<Message>(`/messages/${m.id}/preview`, { method: "DELETE" }).catch((e) =>
      toast(e instanceof Error ? e.message : "could not remove preview"),
    );
  }

  // /collapse: fold every image and link preview in the open channel.
  function collapseAll() {
    setCollapsed(
      (prev) => new Set([...prev, ...messages.filter((m) => hasMedia(m.body)).map((m) => m.id)]),
    );
    const cards = messages.filter((m) => m.preview?.kind === "card").map((m) => [m.id, true]);
    setPreviewState((prev) => ({ ...prev, ...Object.fromEntries(cards) }));
  }

  // openActions toggles the popover for the message acted on, remembering the
  // row it came from so the popover lands next to it.
  function openActions(m: Message, anchor: HTMLElement, pane: boolean) {
    setActive((a) => (a?.message.id === m.id ? null : { message: m, anchor, pane }));
  }

  function deleteMessage(m: Message) {
    setActive(null);
    api(`/messages/${m.id}`, { method: "DELETE" }).catch(() => {});
  }

  useEffect(() => {
    try {
      const keep = Object.keys(previewState)
        .map(Number)
        .sort((a, b) => a - b)
        .slice(-previewMax);
      localStorage.setItem(previewKey, JSON.stringify(Object.fromEntries(keep.map((k) => [k, previewState[k]]))));
    } catch {
      // storage unavailable; choices just won't persist
    }
  }, [previewState]);

  const previewCollapsed = (id: number) => previewState[id] ?? settings.collapsePreviews;

  function togglePreview(id: number) {
    setPreviewState((prev) => ({ ...prev, [id]: !(prev[id] ?? settings.collapsePreviews) }));
  }

  function toggleImages(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function logout() {
    await api("/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  const chat = selected?.type === "text" || selected?.type === "dm";
  const showingShare = view === "channel" && share !== null;
  const inCall = selected?.type === "dm" && voice.channel?.id === selected.id;

  return (
    <div className="flex h-dvh overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-scrim md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div
        inert={!sidebarOpen}
        className={cn(
          "z-40 w-64 shrink-0 transition-transform duration-200",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-[80vw] max-md:max-w-72",
          !sidebarOpen && "max-md:-translate-x-full",
        )}
      >
        <Sidebar
          channels={channels.filter(
            (c) => c.type !== "dm" || !hiddenDms.includes(c.id) || unread[c.id],
          )}
          unread={unread}
          selected={selected}
          users={users}
          online={online}
          username={user.username}
          voice={voice}
          voiceRooms={voiceRooms}
          deafened={settings.deafened}
          onDeafen={(v) => update({ deafened: v })}
          openShare={openShare}
          onOpenShare={showShare}
          onSelect={open}
          onSelectUser={selectUser}
          onCloseDM={(dm) => {
            setHiddenDms((ids) => (ids.includes(dm.id) ? ids : [...ids, dm.id]));
            if (selected?.id === dm.id) setSelected(firstChannel(channels));
          }}
          onCreateChannel={createChannel}
          onDeleteChannel={deleteChannel}
          onOpenSettings={() => {
            setView("settings");
            if (!desktop.current) setSidebarOpen(false);
          }}
          onLogout={logout}
        />
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 md:px-3">
          <IconButton
            label={sidebarOpen ? "close navigation" : "open navigation"}
            className="md:hidden"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <Menu />
          </IconButton>
          {view === "settings" ? (
            <>
              <SettingsIcon size={16} className="text-faint" />
              <span className="truncate text-sm font-medium">settings</span>
            </>
           ) : showingShare && share ? (
            <>
              <ScreenShare size={16} className="text-faint" />
              <span className="truncate text-sm font-medium">
                {share.self ? "your screen" : `${share.name}'s screen`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setOpenShare(null)}
              >
                close
              </Button>
            </>
          ) : (
            <>
              {selected &&
                (selected.type === "dm" ? (
                  <AtSign size={16} className="text-faint" />
                ) : (
                  <Hash size={16} className="text-faint" />
                ))}
              <span className="truncate text-sm font-medium">{selected?.name}</span>
              <div className="ml-auto flex items-center gap-1">
                {pins.length > 0 && (
                  <IconButton
                    label={showPins ? "hide pinned messages" : "show pinned messages"}
                    variant={showPins ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setShowPins((v) => !v)}
                  >
                    <Pin />
                  </IconButton>
                )}
                {selected?.type === "dm" && (
                  <IconButton
                    label={inCall ? "leave call" : ringing === selected.id ? "answer call" : "start video call"}
                    variant={inCall ? "danger" : ringing === selected.id ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => (inCall ? voice.leave() : startCall(selected))}
                  >
                    {inCall ? <PhoneOff /> : <Video />}
                  </IconButton>
                )}
                {selected?.type === "text" && !selected.permanent && (
                  <MenuPrimitive
                    trigger={
                      <IconButton label="channel actions" size="sm">
                        <MoreHorizontal />
                      </IconButton>
                    }
                  >
                    {(close) => (
                      <MenuItem danger onClick={() => (close(), deleteChannel(selected))}>
                        <Trash2 size={14} /> delete channel
                      </MenuItem>
                    )}
                  </MenuPrimitive>
                )}
              </div>
            </>
          )}
          {!connected && <span className="ml-auto pr-1 text-xs text-faint">reconnecting…</span>}
        </header>

        {view === "settings" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SettingsView settings={settings} update={update} voice={voice} theme={theme} />
          </div>
         ) : showingShare && share ? (
          <ScreenShareView track={share.track} />
        ) : chat && selected ? (
          <div className="relative flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {inCall && <CallView voice={voice} className="flex-[3]" />}
              <div className={cn("flex min-h-0 flex-1 flex-col", inCall && "flex-[1] border-t border-line")}>
                <MessageList
                  key={selected.id}
                  messages={messages}
                  hasMore={hasMore}
                  loadingOlder={loadingOlder}
                  username={user.username}
                  collapsed={collapsed}
                  previewCollapsed={previewCollapsed}
                  hidePreviews={settings.hidePreviews}
                  onTogglePreview={togglePreview}
                  onRemovePreview={removePreview}
                  editing={editing?.pane ? null : editing}
                  activeId={active?.message.id ?? null}
                  onSelect={(m, anchor) => openActions(m, anchor, false)}
                  onLoadOlder={loadOlder}
                  onToggleImages={toggleImages}
                  onEditBody={(body) => setEditing((e) => (e ? { ...e, body } : e))}
                  onCancelEdit={() => setEditing(null)}
                  onSaveEdit={saveEdit}
                />
                <div className="h-5 shrink-0 truncate px-3 text-xs text-faint md:px-4" aria-live="polite">
                  {settings.typingIndicator &&
                    typingLabel(Object.keys(typing[selected.id] ?? {}).sort())}
                </div>
                {active && !editing && (
                  <MessageActions
                    message={active.message}
                    anchor={active.anchor}
                    own={active.message.username === user.username}
                    pinned={pins.some((p) => p.id === active.message.id)}
                    onReact={(r) => react(active.message, r)}
                    onPin={() => togglePin(active.message)}
                    onEdit={() => startEdit(active.message, active.pane)}
                    onDelete={() => deleteMessage(active.message)}
                    onRemovePreview={() => removePreview(active.message)}
                    onClose={() => setActive(null)}
                  />
                )}
                <Composer
                  channel={selected}
                  users={users}
                  onEditLast={startEditLast}
                  onTyping={sendTyping}
                  onCollapse={collapseAll}
                />
              </div>
            </div>
            {showPins && pins.length > 0 && (
              <aside className="flex w-72 shrink-0 flex-col border-l border-line bg-surface max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:w-full max-md:shadow-xl">
                <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 md:px-3">
                  <Pin size={16} className="text-faint" />
                  <span className="truncate text-sm font-medium">pinned</span>
                  <IconButton
                    label="close pinned messages"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setShowPins(false)}
                  >
                    <X />
                  </IconButton>
                </div>
                <MessageList
                  messages={pins}
                  hasMore={false}
                  loadingOlder={false}
                  username={user.username}
                  collapsed={collapsed}
                  previewCollapsed={previewCollapsed}
                  hidePreviews={settings.hidePreviews}
                  editing={editing?.pane ? editing : null}
                  activeId={active?.message.id ?? null}
                  onSelect={(m, anchor) => openActions(m, anchor, true)}
                  onLoadOlder={() => {}}
                  onToggleImages={toggleImages}
                  onTogglePreview={togglePreview}
                  onRemovePreview={removePreview}
                  onEditBody={(body) => setEditing((e) => (e ? { ...e, body } : e))}
                  onCancelEdit={() => setEditing(null)}
                  onSaveEdit={saveEdit}
                />
              </aside>
            )}
          </div>
        ) : (
          <Centered>select a channel</Centered>
        )}

        {voice.channel && (
          <div className="shrink-0 px-2 pb-2 md:hidden">
            <VoiceBar
              voice={voice}
              self={user.username}
              deafened={settings.deafened}
              onDeafen={(v) => update({ deafened: v })}
              openShare={openShare}
              onOpenShare={showShare}
              occupants={voiceRooms[String(voice.channel.id)] ?? []}
            />
          </div>
        )}
      </main>
    </div>
  );
}
