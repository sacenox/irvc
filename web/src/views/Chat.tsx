import { useEffect, useRef, useState } from "react";
import { Hash, Menu, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import { useSettings } from "../lib/settings";
import { useTheme } from "../lib/theme";
import { useVoice } from "../lib/voice";
import type { Channel, Message, User, UserSummary, WSEvent } from "../lib/types";
import ChatPane from "../components/ChatPane";
import SettingsPanel from "../components/SettingsPanel";
import Sidebar from "../components/Sidebar";

export default function Chat({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Message[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const desktop = useRef(window.matchMedia("(min-width: 768px)").matches);
  const [sidebarOpen, setSidebarOpen] = useState(desktop.current);
  const selectedId = useRef<number | null>(null);
  const { settings, update } = useSettings();
  const voice = useVoice(settings);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    selectedId.current = selected?.id ?? null;
  }, [selected]);

  useEffect(() => {
    api<Channel[]>("/channels")
      .then((cs) => {
        setChannels(cs);
        setSelected(cs.find((c) => c.type === "text") ?? cs[0] ?? null);
      })
      .catch(() => {});
    api<UserSummary[]>("/users")
      .then(setUsers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/api/ws`);
    ws.onmessage = (e) => {
      const ev = JSON.parse(e.data as string) as WSEvent;
      if (ev.type === "presence") {
        setOnline(new Set(ev.users ?? []));
        if (ev.roster) setUsers(ev.roster);
      } else if (ev.message && ev.message.channelId === selectedId.current) {
        setMessages((prev) => [...prev, ev.message!]);
      }
    };
    return () => ws.close();
  }, []);

  useEffect(() => {
    if (selected?.type !== "text") {
      setMessages([]);
      return;
    }
    api<Message[]>(`/channels/${selected.id}/messages`)
      .then(setMessages)
      .catch(() => {});
  }, [selected]);

  function selectChannel(c: Channel) {
    setSelected(c);
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
          channels={channels}
          selected={selected}
          onSelect={selectChannel}
          voice={voice}
          username={user.username}
          users={users}
          online={online}
          theme={theme}
          onToggleTheme={toggle}
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
            ) : (
              <>
                {selected && <Hash size={14} />}
                {selected?.name}
              </>
            )}
          </span>
        </header>
        {settingsOpen ? (
          <SettingsPanel settings={settings} update={update} voice={voice} />
        ) : (
          <ChatPane channel={selected} messages={messages} />
        )}
      </main>
    </div>
  );
}
