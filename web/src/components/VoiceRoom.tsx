import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import type { Channel } from "../lib/types";

interface VoiceToken {
  url: string;
  token: string;
  room: string;
}

export default function VoiceRoom({ channel, username }: { channel: Channel; username: string }) {
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [error, setError] = useState("");
  const [peers, setPeers] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);

  useEffect(() => {
    let room: Room | null = null;
    let cancelled = false;
    const audio: HTMLElement[] = [];

    (async () => {
      try {
        const t = await api<VoiceToken>(`/channels/${channel.id}/voice`, { method: "POST" });
        if (cancelled) return;
        room = new Room();
        roomRef.current = room;

        const sync = () => {
          setPeers([...room!.remoteParticipants.values()].map((p) => p.name || p.identity));
        };

        room.on(RoomEvent.ParticipantConnected, sync);
        room.on(RoomEvent.ParticipantDisconnected, sync);
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) audio.push(track.attach());
        });
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled) {
            setStatus("error");
            setError("disconnected");
          }
        });

        await room.connect(t.url, t.token);
        await room.localParticipant.setMicrophoneEnabled(true);
        setStatus("live");
        sync();
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setError((err as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
      audio.forEach((el) => el.remove());
      room?.disconnect();
      roomRef.current = null;
    };
  }, [channel.id]);

  async function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(muted);
    setMuted(!muted);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-sm">
      <div className="text-sepia/50">
        {status === "live"
          ? `connected to ${channel.name}`
          : status === "connecting"
            ? "connecting…"
            : "voice error"}
      </div>
      {error && <div className="text-gold">{error}</div>}
      <div className="flex w-56 flex-col gap-1 rounded border border-sepia/15 p-3">
        <div className="flex items-center gap-2 text-sepia">
          <span className="h-2 w-2 rounded-full bg-gold" />
          {username} <span className="text-sepia/40">(you)</span>
        </div>
        {peers.map((p) => (
          <div key={p} className="flex items-center gap-2 text-sepia">
            <span className="h-2 w-2 rounded-full bg-gold" />
            {p}
          </div>
        ))}
      </div>
      <Button variant="outline" onClick={toggleMute}>
        {muted ? <MicOff /> : <Mic />}
        {muted ? "unmute" : "mute"}
      </Button>
    </div>
  );
}
