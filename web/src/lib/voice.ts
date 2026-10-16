import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioPresets,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  VideoPresets,
} from "livekit-client";
import type {
  AudioCaptureOptions,
  AudioProcessorOptions,
  Participant,
  ScreenShareCaptureOptions,
  TrackProcessor,
  TrackPublishOptions,
} from "livekit-client";
import { api } from "./api";
import type { Settings } from "./settings";
import type { Channel } from "./types";

interface VoiceToken {
  url: string;
  token: string;
  room: string;
}

// beep plays a short tone for call roster changes (someone joined or left the
// call you are in). Web Audio needs no asset; it unlocks on the click that
// joined the call.
function beep(freq: number) {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.1;
  osc.frequency.value = freq;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
  osc.onended = () => ctx.close();
}

// dbfs computes the RMS level, in dBFS, of an analyser's latest time-domain
// samples. Near-silence clamps toward -inf via the epsilon.
function dbfs(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8);
}

// A hard gate that keeps the microphone silent while its level is below the
// user's threshold, so room noise and keyboard clatter are not transmitted.
// The threshold lives in a ref, so the slider takes effect without republishing
// the track. `level` reports dBFS for the settings meter.
interface MicGate {
  processor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>;
  threshold: { current: number };
  level: () => number;
}

function micGate(): MicGate {
  const threshold = { current: -60 };
  const state = { level: -100 };
  let timer = 0;

  const processor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> = {
    name: "irvc-mic-gate",
    async init({ track, audioContext }) {
      clearInterval(timer);
      const source = audioContext.createMediaStreamSource(new MediaStream([track]));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      const gain = audioContext.createGain();
      const dest = audioContext.createMediaStreamDestination();
      source.connect(analyser);
      source.connect(gain);
      gain.connect(dest);
      processor.processedTrack = dest.stream.getAudioTracks()[0];

      const buf = new Float32Array(analyser.fftSize);
      let hold = 0;
      timer = window.setInterval(() => {
        const db = dbfs(analyser, buf);
        state.level = db;
        const now = performance.now();
        if (db >= threshold.current) hold = now + 250;
        gain.gain.value = now < hold ? 1 : 0;
      }, 20);
    },
    async restart(opts) {
      await processor.destroy();
      await processor.init(opts);
    },
    async destroy() {
      clearInterval(timer);
      timer = 0;
      state.level = -100;
    },
  };

  return { processor, threshold, level: () => state.level };
}

// useMicPreview opens the microphone on its own so the settings meter works
// before joining a call. It returns a dBFS level getter. Nothing is published
// or played; the stream exists only for metering.
export function useMicPreview(settings: Settings, enabled: boolean): () => number {
  const level = useRef(-100);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    if (!enabled) return;
    let ctx: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    (async () => {
      try {
        ctx = new AudioContext();
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: capture(settingsRef.current),
        });
        if (cancelled) {
          mic.getTracks().forEach((t) => t.stop());
          ctx.close();
          return;
        }
        stream = mic;
        ctx.resume().catch(() => {});
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(mic).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          level.current = dbfs(analyser, buf);
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        level.current = -100;
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
      level.current = -100;
    };
    // Restart on the device the user actually selected; other processing
    // toggles shift the level only slightly and should not re-prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, settings.micDeviceId]);

  return useCallback(() => level.current, []);
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

// screenShare maps the quality setting to a capture resolution and encoding.
// The simulcast layers are ordered low to high, below the preset's own layer.
const screenSharePresets = {
  "720p": ScreenSharePresets.h720fps30,
  "1080p": ScreenSharePresets.h1080fps30,
};
const screenShareLayers = {
  "720p": [VideoPresets.h180, VideoPresets.h360],
  "1080p": [VideoPresets.h360, VideoPresets.h720],
};

function screenShare(s: Settings): [ScreenShareCaptureOptions, TrackPublishOptions] {
  const preset = screenSharePresets[s.screenShareQuality];
  return [
    { audio: true, resolution: preset.resolution },
    {
      screenShareEncoding: preset.encoding,
      screenShareSimulcastLayers: screenShareLayers[s.screenShareQuality],
    },
  ];
}

// A Share is a screen-share publication, ours or a peer's. LiveKit models it as
// a track on a participant rather than a participant, so the sidebar synthesizes
// one row per share.
export interface Share {
  id: string;
  name: string;
  self: boolean;
  track: Track;
}

function sharesOf(room: Room): Share[] {
  const shares: Share[] = [];
  const collect = (p: Participant, self: boolean) => {
    for (const pub of p.trackPublications.values()) {
      if (pub.source === Track.Source.ScreenShare && pub.track?.kind === Track.Kind.Video) {
        shares.push({
          id: `${p.identity}:${pub.trackSid}`,
          name: p.name || p.identity,
          self,
          track: pub.track,
        });
      }
    }
  };
  collect(room.localParticipant, true);
  for (const p of room.remoteParticipants.values()) collect(p, false);
  return shares;
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

// VoiceState is what we tell the server about our own call: which channel we
// are in (0 for none) and whether we can hear or be heard. It drives the mute
// and deafen markers everyone else sees in their roster.
export interface VoiceState {
  channelId: number;
  muted: boolean;
  deafened: boolean;
}

export interface Voice {
  channel: Channel | null;
  status: VoiceStatus;
  error: string;
  peers: string[];
  speaking: string[];
  shares: Share[];
  sharing: boolean;
  muted: boolean;
  join: (c: Channel) => void;
  leave: () => void;
  toggleMute: () => void;
  toggleShare: () => void;
  setPeerVolume: (name: string, volume: number) => void;
  micLevel: () => number;
}

// useVoice owns the single LiveKit connection for the session so it survives
// switching panes. Chat holds it and passes it to the sidebar controls.
// Voice settings are read from a ref so `join` always uses the latest values,
// while live changes (device, processing, quality) are applied via effects.
export function useVoice(settings: Settings, onVoice?: (state: VoiceState) => void): Voice {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState("");
  const [peers, setPeers] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState<string[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [muted, setMuted] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLAudioElement[]>([]);
  const genRef = useRef(0);
  const readyRef = useRef(false);
  const settingsRef = useRef(settings);
  const mutedRef = useRef(false);
  const appliedRef = useRef("");
  const gateRef = useRef<MicGate | null>(null);
  const onVoiceRef = useRef(onVoice);
  settingsRef.current = settings;
  mutedRef.current = muted;
  onVoiceRef.current = onVoice;

  if (!gateRef.current) gateRef.current = micGate();
  const gate = gateRef.current;
  gate.threshold.current = settings.gateThreshold;
  const micLevel = useCallback(() => gate.level(), [gate]);

  const leave = useCallback(() => {
    genRef.current++;
    const room = roomRef.current;
    roomRef.current = null;
    appliedRef.current = "";
    readyRef.current = false;
    audioRef.current.forEach((el) => el.remove());
    audioRef.current = [];
    room?.disconnect();
    setChannel(null);
    setStatus("idle");
    setError("");
    setPeers([]);
    setSpeaking([]);
    setShares([]);
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
        const sync = () => {
          setPeers([...room.remoteParticipants.values()].map((p) => p.name || p.identity));
          setShares(sharesOf(room));
        };
        room.on(RoomEvent.ParticipantConnected, () => {
          if (readyRef.current && settingsRef.current.joinSound) beep(440);
          sync();
        });
        room.on(RoomEvent.ParticipantDisconnected, () => {
          if (readyRef.current && settingsRef.current.joinSound) beep(660);
          sync();
        });
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) =>
          setSpeaking(speakers.map((p) => p.name || p.identity)),
        );
        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach() as HTMLAudioElement;
          el.muted = settingsRef.current.deafened;
          audioRef.current.push(el);
        });
        // Screen shares surface as a track on a participant, so every event that
        // can add or drop one — publish, subscribe, unpublish — resyncs the rows.
        for (const ev of [
          RoomEvent.TrackPublished,
          RoomEvent.TrackUnpublished,
          RoomEvent.TrackSubscribed,
          RoomEvent.TrackUnsubscribed,
          RoomEvent.LocalTrackPublished,
          RoomEvent.LocalTrackUnpublished,
        ]) {
          room.on(ev, sync);
        }
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
        // Existing participants fired ParticipantConnected during connect; only
        // later connect/disconnect events should beep.
        readyRef.current = true;
        const mic = await room.localParticipant.setMicrophoneEnabled(true, capture(s), publish(s));
        if (mic?.audioTrack) await mic.audioTrack.setProcessor(gate.processor);
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
    [leave, gate],
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
      if (p?.audioTrack) await p.audioTrack.setProcessor(gate.processor);
      if (mutedRef.current) await p?.mute();
    })().catch((err) => setError((err as Error).message));
  }, [settings, status, gate]);

  // Report our own call state whenever any of it changes: joining, leaving,
  // muting, deafening. The server rebroadcasts it as presence.
  useEffect(() => {
    onVoiceRef.current?.({
      channelId: channel?.id ?? 0,
      muted,
      deafened: settings.deafened,
    });
  }, [channel, muted, settings.deafened]);

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

  const toggleShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const on = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const [capture, publishOptions] = screenShare(settingsRef.current);
    try {
      await room.localParticipant.setScreenShareEnabled(!on, capture, publishOptions);
    } catch (err) {
      // Dismissing the picker rejects with NotAllowedError; that is not a fault.
      if ((err as Error).name !== "NotAllowedError") setError((err as Error).message);
    }
    setShares(sharesOf(room));
  }, []);

  const setPeerVolume = useCallback((name: string, volume: number) => {
    const room = roomRef.current;
    if (!room) return;
    for (const p of room.remoteParticipants.values()) {
      if ((p.name || p.identity) === name) p.setVolume(volume);
    }
  }, []);

  useEffect(
    () => () => {
      roomRef.current?.disconnect();
    },
    [],
  );

  return {
    channel,
    status,
    error,
    peers,
    speaking,
    shares,
    sharing: shares.some((s) => s.self),
    muted,
    join,
    leave,
    toggleMute,
    toggleShare,
    setPeerVolume,
    micLevel,
  };
}
