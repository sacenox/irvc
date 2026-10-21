import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, Hash, Menu, MoreHorizontal, PhoneOff, ScreenShare, Settings as SettingsIcon, Video } from "lucide-react";
import { cn } from "cn";
import { Button, Centered, IconButton, Menu as MenuPrimitive, MenuItem } from "@/ui";
import { api } from "../lib/api";
import { firstChannel } from "../lib/channels";
import { usePresence } from "../lib/presence";
import { useSettings } from "../lib/settings";
import { useTheme } from "../lib/theme";
import { toast } from "../lib/toast";
import { beep, useVoice, type VoiceState } from "../lib/voice";
import type { Channel, Message, Reaction, User, UserSummary, VoiceOccupant } from "../lib/types";
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

export default function Chat({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [hiddenDms, setHiddenDms] = useState<number[]>(loadHiddenDms);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Message[]>([]);
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [collapsed, setCollapsed] = useState<Set<number>>(loadCollapsed);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [active, setActive] = useState<Message | null>(null);
  const [voiceRooms, setVoiceRooms] = useState<Record<string, VoiceOccupant[]>>({});
  const [view, setView] = useState<"channel" | "settings">("channel");
  const [openShare, setOpenShare] = useState<string | null>(null);
  const [ringing, setRinging] = useState<number | null>(null);
  const desktop = useRef(matchMedia("(min-width: 768px)").matches);
  const [sidebarOpen, setSidebarOpen] = useState(desktop.current);
  const selectedId = useRef<number | null>(null);
  // The channel of the DM call we started, so we can tell the peer when it ends.
  const rangRef = useRef<number | null>(null);
  // The server drops our voice state when the socket dies, so keep the last
  // thing we told it and replay that on every (re)connect.
  const voiceState = useRef<VoiceState>({ channelId: 0, muted: false, deafened: false });
  const { settings, update } = useSettings();

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
      } else if (ev.type === "ring_end" && ev.channelId) {
        setRinging((r) => (r === ev.channelId ? null : r));
      } else if (ev.message) {
        if (ev.type === "message") {
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
          else if (ev.type === "message_edit")
            setMessages((prev) => prev.map((m) => (m.id === ev.message!.id ? ev.message! : m)));
          else if (ev.type === "message_delete")
            setMessages((prev) => prev.filter((m) => m.id !== ev.message!.id));
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
      return;
    }
    api<Message[]>(`/channels/${selected.id}/messages`)
      .then(setMessages)
      .catch(() => {});
  }, [selected]);

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

  function startEdit(m: Message) {
    setEditing({ id: m.id, body: m.body });
    setActive(null);
  }

  function startEditLast() {
    const last = [...messages].reverse().find((m) => m.username === user.username);
    if (last) setEditing({ id: last.id, body: last.body });
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

  function deleteMessage(m: Message) {
    setActive(null);
    api(`/messages/${m.id}`, { method: "DELETE" }).catch(() => {});
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
                  className="ml-auto"
                  trigger={
                    <IconButton label="channel actions" size="sm">
                      <MoreHorizontal />
                    </IconButton>
                  }
                >
                  {(close) => (
                    <MenuItem danger onClick={() => (close(), deleteChannel(selected))}>
                      delete channel
                    </MenuItem>
                  )}
                </MenuPrimitive>
              )}
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
          <>
            {inCall && <CallView voice={voice} className="flex-[3]" />}
            <div className={cn("flex min-h-0 flex-1 flex-col", inCall && "flex-[1] border-t border-line")}>
              <MessageList
                key={selected.id}
                messages={messages}
                username={user.username}
                collapsed={collapsed}
                editing={editing}
                activeId={active?.id ?? null}
                onSelect={(m) => setActive((a) => (a?.id === m.id ? null : m))}
                onToggleImages={toggleImages}
                onEditBody={(body) => setEditing((e) => (e ? { ...e, body } : e))}
                onCancelEdit={() => setEditing(null)}
                onSaveEdit={saveEdit}
              />
              {active && !editing && (
                <MessageActions
                  message={active}
                  own={active.username === user.username}
                  onReact={(r) => react(active, r)}
                  onEdit={() => startEdit(active)}
                  onDelete={() => deleteMessage(active)}
                  onClose={() => setActive(null)}
                />
              )}
              <Composer
                channel={selected}
                users={users}
                onEditLast={startEditLast}
                onCollapseMedia={() =>
                  setCollapsed(
                    (prev) =>
                      new Set([...prev, ...messages.filter((m) => hasMedia(m.body)).map((m) => m.id)]),
                  )
                }
              />
            </div>
          </>
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
