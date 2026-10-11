import { useState, type ReactNode } from "react";
import { Hash, Mic, MicOff, PhoneOff, UserPlus, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import type { Channel } from "../lib/types";
import type { Voice } from "../lib/voice";
import VoicePeers from "./VoicePeers";

interface Invite {
  token: string;
  expiresAt: number;
}

export default function Sidebar({
  channels,
  selected,
  onSelect,
  voice,
  username,
}: {
  channels: Channel[];
  selected: Channel | null;
  onSelect: (c: Channel) => void;
  voice: Voice;
  username: string;
}) {
  const [label, setLabel] = useState("create invite");

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
    <aside className="flex w-56 shrink-0 flex-col border-r border-sepia/15">
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
              <VoiceChannel key={c.id} channel={c} voice={voice} username={username} />
            ))}
        </div>
      </nav>
      <div className="p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 font-normal text-sepia/50"
          onClick={invite}
        >
          <UserPlus size={14} />
          {label}
        </Button>
      </div>
    </aside>
  );
}

function Group({
  label,
  channels,
  selected,
  onSelect,
  icon,
}: {
  label: string;
  channels: Channel[];
  selected: Channel | null;
  onSelect: (c: Channel) => void;
  icon: ReactNode;
}) {
  return (
    <div>
      <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-sepia/40">{label}</div>
      {channels.map((c) => (
        <Button
          key={c.id}
          variant={selected?.id === c.id ? "secondary" : "ghost"}
          onClick={() => onSelect(c)}
          className="w-full justify-start gap-2 font-normal"
        >
          {icon}
          {c.name}
        </Button>
      ))}
    </div>
  );
}

function VoiceChannel({
  channel,
  voice,
  username,
}: {
  channel: Channel;
  voice: Voice;
  username: string;
}) {
  const active = voice.channel?.id === channel.id;
  return (
    <div className="pb-1">
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-sepia/70">
        <Volume2 size={14} />
        <span className="flex-1 truncate">{channel.name}</span>
        {active && (
          <>
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={() => voice.toggleMute()}
              title={voice.muted ? "unmute" : "mute"}
            >
              {voice.muted ? <MicOff /> : <Mic />}
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={() => voice.leave()} title="leave">
              <PhoneOff />
            </Button>
          </>
        )}
      </div>
      {active && (
        <div className="flex flex-col gap-0.5 px-2 pb-0.5">
          {voice.status !== "live" ? (
            <span className="truncate text-xs text-sepia/50">
              {voice.status === "connecting" ? "connecting…" : voice.error || "disconnected"}
            </span>
          ) : (
            <VoicePeers voice={voice} username={username} />
          )}
        </div>
      )}
      {!active && (
        <div className="px-2 pt-0.5">
          <Button
            size="xs"
            variant="ghost"
            className="text-xs text-sepia/50"
            onClick={() => voice.join(channel)}
          >
            join
          </Button>
        </div>
      )}
    </div>
  );
}
