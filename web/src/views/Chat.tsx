import { useEffect, useRef, useState } from "react";
import { AtSign, Hash, Menu, ScreenShare, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import { usePresence } from "../lib/presence";
import { useSettings } from "../lib/settings";
import { useTheme } from "../lib/theme";
import { useVoice } from "../lib/voice";
import type { Channel, Message, User, UserSummary } from "../lib/types";
import ChatPane from "../components/ChatPane";
import ScreenShareView from "../components/ScreenShare";
import SettingsPanel from "../components/SettingsPanel";
import Sidebar from "../components/Sidebar";

const voiceMessage = (channelId: number) => JSON.stringify({ type: "voice", channelId });
const hiddenDmsKey = "irvc.hiddenDms";

function loadHiddenDms(): number[] {
  try {
    return JSON.parse(localStorage.getItem(hiddenDmsKey) ?? "[]");
  } catch {
    return [];
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openShare, setOpenShare] = useState<string | null>(null);
  const desktop = useRef(window.matchMedia("(min-width: 768px)").matches);
  const [sidebarOpen, setSidebarOpen] = useState(desktop.current);
  const selectedId = useRef<number | null>(null);
  const [voiceRooms, setVoiceRooms] = useState<Record<string, string[]>>({});
  const voiceChannel = useRef(0);
  const { settings, update } = useSettings();
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
          if (ev.message.channelId === selectedId.current) {
            markRead(ev.message.channelId);
          } else if (ev.message.username !== user.username) {
            setUnread((u) => ({ ...u, [ev.message!.channelId]: (u[ev.message!.channelId] ?? 0) + 1 }));
          }
        }
        if (ev.message.channelId === selectedId.current) {
          if (ev.type === "message") {
            setMessages((prev) => [...prev, ev.message!]);
          } else if (ev.type === "message_edit") {
            setMessages((prev) => prev.map((m) => (m.id === ev.message!.id ? ev.message! : m)));
          } else if (ev.type === "message_delete") {
            setMessages((prev) => prev.filter((m) => m.id !== ev.message!.id));
          }
        }
      }
    },
    () => send(voiceMessage(voiceChannel.current)),
  );
  const voice = useVoice(settings, (channelId) => {
    voiceChannel.current = channelId ?? 0;
    send(voiceMessage(voiceChannel.current));
  });
  const { mode, toggleMode, theme, setTheme } = useTheme();
  // The watched share lives in the LiveKit room, so it vanishes when the sharer
  // stops; the pane then falls back to the selected text channel.
  const share = voice.shares.find((s) => s.id === openShare) ?? null;

  useEffect(() => {
    document.documentElement.style.fontSize = { default: "", normal: "16px", large: "18px" }[
      settings.fontSize
    ];
  }, [settings.fontSize]);

  useEffect(() => {
    localStorage.setItem(hiddenDmsKey, JSON.stringify(hiddenDms));
  }, [hiddenDms]);

  useEffect(() => {
    selectedId.current = selected?.id ?? null;
  }, [selected]);

  useEffect(() => {
    if (selected && !channels.some((c) => c.id === selected.id)) {
      setSelected(channels.find((c) => c.type === "text") ?? channels[0] ?? null);
    }
  }, [channels, selected]);

  useEffect(() => {
    api<Channel[]>("/channels")
      .then((cs) => {
        setChannels(cs);
        setUnread(
          Object.fromEntries(cs.filter((c) => c.unread).map((c) => [c.id, c.unread as number])),
        );
        setSelected(cs.find((c) => c.type === "text") ?? cs[0] ?? null);
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

  // Opening a channel clears its unread badge and tells the server, so the
  // count stays right on the next cold start and on the user's other devices.
  useEffect(() => {
    if (selected && (selected.type === "text" || selected.type === "dm")) markRead(selected.id);
  }, [selected]);

  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) irvc` : "irvc";
  }, [totalUnread]);

  function markRead(id: number) {
    setUnread((u) => {
      if (!u[id]) return u;
      const next = { ...u };
      delete next[id];
      return next;
    });
    api(`/channels/${id}/read`, { method: "POST" }).catch(() => {});
  }

  async function selectUser(u: UserSummary) {
    try {
      const dm = await api<Channel>(`/dms/${u.id}`, { method: "POST" });
      setChannels((cs) => (cs.some((c) => c.id === dm.id) ? cs : [...cs, dm]));
      setHiddenDms((ids) => ids.filter((id) => id !== dm.id));
      selectChannel(dm);
    } catch {
      // ignore
    }
  }

  function closeDM(dm: Channel) {
    setHiddenDms((ids) => (ids.includes(dm.id) ? ids : [...ids, dm.id]));
    if (selected?.id === dm.id) {
      setSelected(channels.find((c) => c.type === "text") ?? null);
    }
  }

  function selectChannel(c: Channel) {
    setSelected(c);
    setOpenShare(null);
    setSettingsOpen(false);
    if (!desktop.current) setSidebarOpen(false);
  }

  function selectShare(id: string) {
    setOpenShare(id);
    setSettingsOpen(false);
    if (!desktop.current) setSidebarOpen(false);
  }

  function toggleSettings() {
    setSettingsOpen((v) => !v);
    if (!desktop.current) setSidebarOpen(false);
  }

  async function logout() {
    await api("/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  return (
    <div className="relative flex h-full">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {sidebarOpen && (
        <Sidebar
          channels={channels.filter((c) => c.type !== "dm" || !hiddenDms.includes(c.id))}
          unread={unread}
          selected={selected}
          onSelect={selectChannel}
          onCloseDM={closeDM}
          onSelectUser={selectUser}
          voice={voice}
          voiceRooms={voiceRooms}
          openShare={openShare}
          onOpenShare={selectShare}
          username={user.username}
          users={users}
          online={online}
          mode={mode}
          onToggleMode={toggleMode}
          settingsOpen={settingsOpen}
          onToggleSettings={toggleSettings}
          onLogout={logout}
        />
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-1 border-b border-sepia/15 px-2 py-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarOpen((v) => !v)}
            title="toggle sidebar"
          >
            <Menu />
          </Button>
          <span className="flex items-center gap-1.5 text-sm text-sepia/70">
            {settingsOpen ? (
              <>
                <Settings size={14} />
                Settings
              </>
            ) : share ? (
              <>
                <ScreenShare size={14} />
                {share.self ? "your screen" : `${share.name}'s screen`}
              </>
            ) : (
              <>
                {selected && (selected.type === "dm" ? <AtSign size={14} /> : <Hash size={14} />)}
                {selected?.name}
              </>
            )}
          </span>
          {!connected && (
            // Presence is stale until the socket is back, so say so instead of
            // showing a silently wrong roster.
            <span className="ml-auto text-xs text-sepia/50">reconnecting…</span>
          )}
        </header>
        {settingsOpen ? (
          <SettingsPanel
            settings={settings}
            update={update}
            voice={voice}
            theme={theme}
            onThemeChange={setTheme}
          />
        ) : share ? (
          <ScreenShareView track={share.track} />
        ) : (
          <ChatPane channel={selected} messages={messages} users={users} username={user.username} />
        )}
      </main>
    </div>
  );
}
