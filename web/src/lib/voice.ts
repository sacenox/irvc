import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { api } from "./api";
import type { Channel } from "./types";

interface VoiceToken {
  url: string;
  token: string;
  room: string;
}

export type VoiceStatus = "idle" | "connecting" | "live" | "error";

export interface Voice {
  channel: Channel | null;
  status: VoiceStatus;
  error: string;
  peers: string[];
  muted: boolean;
  join: (c: Channel) => void;
  leave: () => void;
  toggleMute: () => void;
}

// useVoice owns the single LiveKit connection for the session so it survives
// switching panes. Chat holds it and passes it to the sidebar controls.
export function useVoice(): Voice {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState("");
  const [peers, setPeers] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLElement[]>([]);
  const genRef = useRef(0);

  const leave = useCallback(() => {
    genRef.current++;
    const room = roomRef.current;
    roomRef.current = null;
    audioRef.current.forEach((el) => el.remove());
    audioRef.current = [];
    room?.disconnect();
    setChannel(null);
    setStatus("idle");
    setError("");
    setPeers([]);
    setMuted(false);
  }, []);

  const join = useCallback(
    async (c: Channel) => {
      leave();
      const gen = genRef.current;
      setChannel(c);
      setStatus("connecting");
      try {
        const t = await api<VoiceToken>(`/channels/${c.id}/voice`, { method: "POST" });
        if (gen !== genRef.current) return;
        const room = new Room();
        roomRef.current = room;
        const sync = () =>
          setPeers([...room.remoteParticipants.values()].map((p) => p.name || p.identity));
        room.on(RoomEvent.ParticipantConnected, sync);
        room.on(RoomEvent.ParticipantDisconnected, sync);
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) audioRef.current.push(track.attach());
        });
        room.on(RoomEvent.Disconnected, () => {
          if (roomRef.current === room) {
            roomRef.current = null;
            setStatus("error");
            setError("disconnected");
          }
        });
        await room.connect(t.url, t.token);
        if (gen !== genRef.current) {
          room.disconnect();
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        setStatus("live");
        sync();
      } catch (err) {
        if (gen !== genRef.current) return;
        setStatus("error");
        setError((err as Error).message);
      }
    },
    [leave],
  );

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }, [muted]);

  useEffect(
    () => () => {
      roomRef.current?.disconnect();
    },
    [],
  );

  return { channel, status, error, peers, muted, join, leave, toggleMute };
}
