import { useEffect, useRef, useState } from "react";
import { LogOut, PanelRight, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import type { Channel, Message, User, UserSummary, WSEvent } from "../lib/types";
import ChatPane from "../components/ChatPane";
import Sidebar from "../components/Sidebar";
import UserList from "../components/UserList";
import VoiceRoom from "../components/VoiceRoom";

export default function Chat({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<Message[]>([]);
  const [showUsers, setShowUsers] = useState(true);
  const selectedId = useRef<number | null>(null);

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

  async function logout() {
    await api("/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  return (
    <div className="flex h-full">
      <Sidebar channels={channels} selected={selected} onSelect={setSelected} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-sepia/15 px-4 py-2">
          <span className="text-sm text-sepia/70">
            {selected ? `${selected.type === "text" ? "#" : "🔊"} ${selected.name}` : ""}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowUsers((v) => !v)}
              title="toggle users"
            >
              {showUsers ? <PanelRightClose /> : <PanelRight />}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={logout} title="log out">
              <LogOut />
            </Button>
          </div>
        </header>
        {selected?.type === "voice" ? (
          <VoiceRoom channel={selected} username={user.username} />
        ) : (
          <ChatPane channel={selected} messages={messages} />
        )}
      </main>
      {showUsers && <UserList users={users} online={online} />}
    </div>
  );
}
