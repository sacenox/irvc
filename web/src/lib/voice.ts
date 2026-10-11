import { useCallback, useEffect, useRef, useState } from "react";
import { AudioPresets, Room, RoomEvent, Track } from "livekit-client";
import type { AudioCaptureOptions } from "livekit-client";
import { api } from "./api";
import type { Settings } from "./settings";
import type { Channel } from "./types";

interface VoiceToken {
  url: string;
  token: string;
  room: string;
}

// capture maps our settings to LiveKit/browser microphone constraints.
function capture(s: Settings): AudioCaptureOptions {
  return {
    echoCancellation: s.echoCancellation,
    noiseSuppression: s.noiseSuppression,
    autoGainControl: s.autoGainControl,
    voiceIsolation: s.voiceIsolation,
    ...(s.micDeviceId ? { deviceId: s.micDeviceId } : {}),
  };
}

function publish(s: Settings) {
  return { audioPreset: AudioPresets[s.audioPreset] };
}

// micSignature identifies the applied capture + encoding config, so live
// changes can be detected without republishing on every render.
function micSignature(s: Settings): string {
  return JSON.stringify([
    s.echoCancellation,
    s.noiseSuppression,
    s.autoGainControl,
    s.voiceIsolation,
    s.audioPreset,
    s.micDeviceId,
  ]);
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
// Voice settings are read from a ref so `join` always uses the latest values,
// while live changes (device, processing, quality) are applied via effects.
export function useVoice(settings: Settings): Voice {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState("");
  const [peers, setPeers] = useState<string[]>([]);
  const [muted, setMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLAudioElement[]>([]);
  const genRef = useRef(0);
  const settingsRef = useRef(settings);
  const mutedRef = useRef(false);
  const appliedRef = useRef("");
  settingsRef.current = settings;
  mutedRef.current = muted;

  const leave = useCallback(() => {
    genRef.current++;
    const room = roomRef.current;
    roomRef.current = null;
    appliedRef.current = "";
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
      const s = settingsRef.current;
      setChannel(c);
      setStatus("connecting");
      try {
        const t = await api<VoiceToken>(`/channels/${c.id}/voice`, { method: "POST" });
        if (gen !== genRef.current) return;
        const room = new Room({
          audioCaptureDefaults: capture(s),
          publishDefaults: publish(s),
        });
        roomRef.current = room;
        const sync = () =>
          setPeers([...room.remoteParticipants.values()].map((p) => p.name || p.identity));
        room.on(RoomEvent.ParticipantConnected, sync);
        room.on(RoomEvent.ParticipantDisconnected, sync);
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach() as HTMLAudioElement;
          el.muted = settingsRef.current.deafened;
          audioRef.current.push(el);
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
        await room.localParticipant.setMicrophoneEnabled(true, capture(s), publish(s));
        if (s.speakerDeviceId) {
          await room.switchActiveDevice("audiooutput", s.speakerDeviceId).catch(() => {});
        }
        appliedRef.current = micSignature(s);
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

  // Apply mic device / processing / quality changes to a live call. LiveKit
  // only honours new options on publish, so the mic track is republished.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "live") return;
    const sig = micSignature(settings);
    if (sig === appliedRef.current) return;
    appliedRef.current = sig;
    (async () => {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (pub?.track) await room.localParticipant.unpublishTrack(pub.track);
      const p = await room.localParticipant.setMicrophoneEnabled(
        true,
        capture(settings),
        publish(settings),
      );
      if (mutedRef.current) await p?.mute();
    })().catch((err) => setError((err as Error).message));
  }, [settings, status]);

  // Speaker changes route through setSinkId on browsers that support it.
  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "live" || !settings.speakerDeviceId) return;
    room.switchActiveDevice("audiooutput", settings.speakerDeviceId).catch(() => {});
  }, [settings.speakerDeviceId, status]);

  // Deafen mutes all remote audio locally, without affecting the server.
  useEffect(() => {
    audioRef.current.forEach((el) => {
      el.muted = settings.deafened;
    });
  }, [settings.deafened]);

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
