import { useEffect, useState } from "react";
import {
  HeadphoneOff,
  Headphones,
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "cn";
import { Dot, IconButton, Menu, MenuItem, VoiceMarks } from "@/ui";
import type { VoiceOccupant } from "../lib/types";
import type { Voice } from "../lib/voice";
import { userColor } from "../lib/scheme";

const volumesKey = "irvc.peerVolumes";

function loadVolumes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(volumesKey) ?? "{}");
  } catch {
    return {};
  }
}

// Screen sharing needs getDisplayMedia: absent on mobile and on plain http.
const canShare = typeof navigator.mediaDevices?.getDisplayMedia === "function";

// VoiceBar is the persistent "you are in a call" panel. It docks in the
// sidebar on desktop and at the bottom of the screen on mobile, so the call
// controls never depend on the sidebar being open.
export default function VoiceBar({
  voice,
  self,
  deafened,
  onDeafen,
  openShare,
  onOpenShare,
  occupants,
  className,
}: {
  voice: Voice;
  self: string;
  deafened: boolean;
  onDeafen: (value: boolean) => void;
  openShare?: string | null;
  onOpenShare?: (id: string) => void;
  occupants?: VoiceOccupant[];
  className?: string;
}) {
  const [volumes, setVolumes] = useState<Record<string, number>>(loadVolumes);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const { peers, shares, speaking } = voice;

  // Volumes live on participant objects, which are recreated on every
  // connect, so re-apply them whenever the roster or the map changes.
  useEffect(() => {
    peers.forEach((p) => voice.setPeerVolume(p, muted.has(p) ? 0 : (volumes[p] ?? 1)));
  }, [peers, volumes, muted, voice]);

  if (!voice.channel) return null;

  function setVolume(name: string, v: number) {
    setVolumes((prev) => {
      const next = { ...prev, [name]: v };
      localStorage.setItem(volumesKey, JSON.stringify(next));
      return next;
    });
  }

  function togglePeerMute(name: string) {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const status =
    voice.status === "live"
      ? "connected"
      : voice.status === "connecting"
        ? "connecting…"
        : voice.error || "disconnected";

  return (
    <div className={cn("rounded-lg border border-line bg-raised p-2", className)}>
      <div className="flex items-center gap-2 px-1">
        {voice.channel.type === "dm" ? (
          <Dot on={voice.status === "live"} />
        ) : (
          <Volume2 size={14} className={voice.status === "live" ? "text-accent" : "text-faint"} />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{voice.channel.name}</span>
        <span className="max-w-1/2 shrink-0 truncate text-xs text-faint">{status}</span>
      </div>

      {voice.status === "live" && (
        <ul className="mt-1 space-y-0.5">
          <li className="row py-1 text-sm">
            <Dot on={speaking.includes(self)} />
            <span className="flex-1 truncate" style={{ color: userColor(self) }}>
              {self}
            </span>
            <VoiceMarks muted={voice.muted} deafened={deafened} />
          </li>
          {peers.map((p) => {
            const them = occupants?.find((o) => o.name === p);
            return (
              <li key={p} className="flex items-center gap-1">
                <PeerMenu
                  name={p}
                  speaking={speaking.includes(p)}
                  muted={muted.has(p)}
                  volume={volumes[p] ?? 1}
                  onVolume={setVolume}
                  onToggleMute={togglePeerMute}
                />
                <VoiceMarks muted={!!them?.muted} deafened={!!them?.deafened} />
                {muted.has(p) && <VolumeX size={12} className="shrink-0 text-faint" />}
              </li>
            );
          })}
          {shares.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onOpenShare?.(s.id)}
                className={cn(
                  "row w-full py-1 text-sm",
                  openShare === s.id && "text-accent",
                )}
              >
                <ScreenShare size={12} />
                <span className="flex-1 truncate">
                  {s.self ? "your screen" : `${s.name}'s screen`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1.5 flex items-center gap-1">
        <IconButton
          label={voice.muted ? "unmute microphone" : "mute microphone"}
          variant={voice.muted ? "danger" : "ghost"}
          onClick={voice.toggleMute}
        >
          {voice.muted ? <MicOff /> : <Mic />}
        </IconButton>
        <IconButton
          label={deafened ? "undeafen" : "deafen"}
          variant={deafened ? "danger" : "ghost"}
          onClick={() => onDeafen(!deafened)}
        >
          {deafened ? <HeadphoneOff /> : <Headphones />}
        </IconButton>
        {voice.channel.type === "dm" && (
          <IconButton
            label={voice.cameraOn ? "turn camera off" : "turn camera on"}
            variant={voice.cameraOn ? "secondary" : "ghost"}
            onClick={voice.toggleCamera}
          >
            {voice.cameraOn ? <Video /> : <VideoOff />}
          </IconButton>
        )}
        <IconButton
          label={!canShare ? "screen share needs https" : voice.sharing ? "stop sharing" : "share screen"}
          variant={voice.sharing ? "secondary" : "ghost"}
          disabled={!canShare}
          onClick={voice.toggleShare}
        >
          {voice.sharing ? <ScreenShareOff /> : <ScreenShare />}
        </IconButton>
        <IconButton label="leave call" variant="danger" className="ml-auto" onClick={voice.leave}>
          <PhoneOff />
        </IconButton>
      </div>
    </div>
  );
}

function PeerMenu({
  name,
  speaking,
  muted,
  volume,
  onVolume,
  onToggleMute,
}: {
  name: string;
  speaking: boolean;
  muted: boolean;
  volume: number;
  onVolume: (name: string, value: number) => void;
  onToggleMute: (name: string) => void;
}) {
  return (
    <Menu
      align="start"
      className="min-w-0 flex-1"
      trigger={
        <button type="button" aria-label={`${name} volume`} className="row w-full py-1 text-sm">
          <Dot on={speaking} />
          <span className="flex-1 truncate" style={{ color: userColor(name) }}>
            {name}
          </span>
        </button>
      }
    >
      {() => (
        <>
          <div className="px-2.5 py-1.5 text-xs text-faint">volume {Math.round(volume * 100)}%</div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolume(name, Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <MenuItem onClick={() => onToggleMute(name)}>{muted ? "unmute" : "mute"}</MenuItem>
        </>
      )}
    </Menu>
  );
}
