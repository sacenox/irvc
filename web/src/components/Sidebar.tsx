import { useState, type ReactNode } from "react";
import {
  AtSign,
  ChevronDown,
  ChevronRight,
  Hash,
  LogOut,
  Mic,
  MicOff,
  Moon,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Settings,
  Sun,
  UserPlus,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import type { Channel, UserSummary } from "../lib/types";
import type { Mode } from "../lib/theme";
import type { Voice } from "../lib/voice";
import UserList from "./UserList";
import VoicePeers from "./VoicePeers";

interface Invite {
  token: string;
  expiresAt: number;
}

// getDisplayMedia is absent on non-secure origins and on mobile browsers. The
// button still renders, disabled, so its absence is never a silent mystery.
const canShare = typeof navigator.mediaDevices?.getDisplayMedia === "function";

export default function Sidebar({
  channels,
  selected,
  onSelect,
  onCloseDM,
  onSelectUser,
  voice,
  voiceRooms,
  openShare,
  onOpenShare,
  username,
  users,
  online,
  mode,
  onToggleMode,
  settingsOpen,
  onToggleSettings,
  onLogout,
}: {
  channels: Channel[];
  selected: Channel | null;
  onSelect: (c: Channel) => void;
  onCloseDM: (c: Channel) => void;
  onSelectUser: (u: UserSummary) => void;
  voice: Voice;
  voiceRooms: Record<string, string[]>;
  openShare: string | null;
  onOpenShare: (id: string) => void;
  username: string;
  users: UserSummary[];
  online: Set<string>;
  mode: Mode;
  onToggleMode: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onLogout: () => void;
}) {
  const [label, setLabel] = useState("create invite");
  const [showUsers, setShowUsers] = useState(true);

  async function invite() {
    try {
      const { token } = await api<Invite>("/invites", { method: "POST" });
      await navigator.clipboard.writeText(`${window.location.origin}/join?token=${token}`);
      setLabel("copied!");
    } catch {
      setLabel("failed");
    }
    setTimeout(() => setLabel("create invite"), 1500);
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sepia/15 bg-bg max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20">
      <div className="px-4 py-3 text-sm font-semibold text-gold">irvc</div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-3">
        <Group
          label="Text"
          channels={channels.filter((c) => c.type === "text")}
          selected={selected}
          onSelect={onSelect}
          icon={<Hash size={14} />}
        />
        <div>
          <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-sepia/40">Voice</div>
          {channels
            .filter((c) => c.type === "voice")
            .map((c) => (
              <VoiceChannel
                key={c.id}
                channel={c}
                voice={voice}
                occupants={voiceRooms[String(c.id)] ?? []}
                openShare={openShare}
                onOpenShare={onOpenShare}
                username={username}
              />
            ))}
        </div>
        {channels.some((c) => c.type === "dm") && (
          <Group
            label="DMs"
            channels={channels.filter((c) => c.type === "dm")}
            selected={selected}
            onSelect={onSelect}
            onClose={onCloseDM}
            icon={<AtSign size={14} />}
          />
        )}
        <div>
          <button
            type="button"
            onClick={() => setShowUsers((v) => !v)}
            className="flex w-full items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-widest text-sepia/40 hover:text-sepia/70"
          >
            {showUsers ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Users
          </button>
          {showUsers && <UserList users={users} online={online} onSelectUser={onSelectUser} />}
        </div>
      </nav>
      <div className="space-y-2 p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 font-normal text-sepia/50"
          onClick={invite}
        >
          <UserPlus size={14} />
          {label}
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleMode}
            title={mode === "dark" ? "light mode" : "dark mode"}
          >
            {mode === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button
            variant={settingsOpen ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={onToggleSettings}
            title="settings"
          >
            <Settings />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onLogout} title="log out">
            <LogOut />
          </Button>
        </div>
      </div>
    </aside>
  );
}

function Group({
  label,
  channels,
  selected,
  onSelect,
  onClose,
  icon,
}: {
  label: string;
  channels: Channel[];
  selected: Channel | null;
  onSelect: (c: Channel) => void;
  onClose?: (c: Channel) => void;
  icon: ReactNode;
}) {
  return (
    <div>
      <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-sepia/40">{label}</div>
      {channels.map((c) => (
        <div key={c.id} className="group/dm relative">
          <Button
            variant={selected?.id === c.id ? "secondary" : "ghost"}
            onClick={() => onSelect(c)}
            className="w-full justify-start gap-2 pr-7 font-normal"
          >
            {icon}
            {c.name}
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onClose(c)}
              title="close dm"
              className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/dm:opacity-100"
            >
              <X />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

function VoiceChannel({
  channel,
  voice,
  occupants,
  openShare,
  onOpenShare,
  username,
}: {
  channel: Channel;
  voice: Voice;
  occupants: string[];
  openShare: string | null;
  onOpenShare: (id: string) => void;
  username: string;
}) {
  const active = voice.channel?.id === channel.id;
  return (
    <div className="pb-1">
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-sepia/70">
        <Volume2 size={14} />
        <span className="flex-1 truncate">{channel.name}</span>
        {active ? (
          <>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => voice.toggleMute()}
              title={voice.muted ? "unmute" : "mute"}
            >
              {voice.muted ? <MicOff /> : <Mic />}
            </Button>
            <Button
              size="icon-xs"
              variant={voice.sharing ? "secondary" : "ghost"}
              className={voice.sharing ? "text-gold" : undefined}
              aria-pressed={voice.sharing}
              disabled={!canShare}
              onClick={() => voice.toggleShare()}
              title={
                !canShare
                  ? "screen share needs https (or localhost)"
                  : voice.sharing
                    ? "stop sharing"
                    : "share screen"
              }
            >
              {voice.sharing ? <ScreenShareOff /> : <ScreenShare />}
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={() => voice.leave()} title="leave">
              <PhoneOff />
            </Button>
          </>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            className="text-xs text-sepia/50"
            onClick={() => voice.join(channel)}
          >
            join
          </Button>
        )}
      </div>
      {active && (
        <div className="flex flex-col gap-0.5 px-2 pb-0.5">
          {voice.status !== "live" ? (
            <span className="truncate text-xs text-sepia/50">
              {voice.status === "connecting" ? "connecting…" : voice.error || "disconnected"}
            </span>
          ) : (
            <VoicePeers
              voice={voice}
              username={username}
              openShare={openShare}
              onOpenShare={onOpenShare}
            />
          )}
        </div>
      )}
      {!active && occupants.length > 0 && (
        <div className="flex flex-col gap-0.5 pb-0.5 pl-3.5 pr-2">
          {occupants.map((name) => (
            <span key={name} className="truncate text-sm text-sepia/70">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
