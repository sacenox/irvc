import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Channel } from "../lib/types";
import type { Voice } from "../lib/voice";

export default function VoiceRoom({
  channel,
  username,
  voice,
}: {
  channel: Channel;
  username: string;
  voice: Voice;
}) {
  const active = voice.channel?.id === channel.id;

  if (!active) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-sm">
        <div className="text-sepia/50">not in {channel.name}</div>
        <Button variant="outline" onClick={() => voice.join(channel)}>
          <Volume2 />
          join {channel.name}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-sm">
      <div className="text-sepia/50">
        {voice.status === "connecting"
          ? "connecting…"
          : voice.status === "error"
            ? "voice error"
            : `connected to ${channel.name}`}
      </div>
      {voice.error && <div className="text-gold">{voice.error}</div>}
      <div className="flex w-56 flex-col gap-1 rounded border border-sepia/15 p-3">
        <div className="flex items-center gap-2 text-sepia">
          <span className="h-2 w-2 rounded-full bg-gold" />
          {username} <span className="text-sepia/40">(you)</span>
          {voice.muted && <MicOff size={12} className="text-sepia/50" />}
        </div>
        {voice.peers.map((p) => (
          <div key={p} className="flex items-center gap-2 text-sepia">
            <span className="h-2 w-2 rounded-full bg-gold" />
            {p}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => voice.toggleMute()}>
          {voice.muted ? <MicOff /> : <Mic />}
          {voice.muted ? "unmute" : "mute"}
        </Button>
        <Button variant="ghost" onClick={() => voice.leave()}>
          <PhoneOff />
          leave
        </Button>
      </div>
    </div>
  );
}
