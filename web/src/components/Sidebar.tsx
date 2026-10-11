import type { ReactNode } from "react";
import { Hash, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Channel } from "../lib/types";
import type { Voice } from "../lib/voice";

export default function Sidebar({
  channels,
  selected,
  onSelect,
  voice,
}: {
  channels: Channel[];
  selected: Channel | null;
  onSelect: (c: Channel) => void;
  voice: Voice;
}) {
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
              <VoiceChannel
                key={c.id}
                channel={c}
                selected={selected}
                onSelect={onSelect}
                voice={voice}
              />
            ))}
        </div>
      </nav>
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
  selected,
  onSelect,
  voice,
}: {
  channel: Channel;
  selected: Channel | null;
  onSelect: (c: Channel) => void;
  voice: Voice;
}) {
  const active = voice.channel?.id === channel.id;
  return (
    <div className="pb-1">
      <Button
        variant={selected?.id === channel.id ? "secondary" : "ghost"}
        onClick={() => onSelect(channel)}
        className="w-full justify-start gap-2 font-normal"
      >
        <Volume2 size={14} />
        {channel.name}
      </Button>
      <div className="flex items-center gap-1 px-2 pt-0.5">
        {active ? (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-sepia/50">
              {voice.status === "connecting"
                ? "connecting…"
                : voice.error
                  ? voice.error
                  : voice.muted
                    ? "in voice · muted"
                    : "in voice"}
            </span>
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
    </div>
  );
}
