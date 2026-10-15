import { useEffect, useState } from "react";
import { MicOff, ScreenShare, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import Dot from "./Dot";
import type { Voice } from "../lib/voice";

const storageKey = "irvc.peerVolumes";

function load(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
  } catch {
    return {};
  }
}

export default function VoicePeers({
  voice,
  username,
  openShare,
  onOpenShare,
}: {
  voice: Voice;
  username: string;
  openShare: string | null;
  onOpenShare: (id: string) => void;
}) {
  const { peers, muted: selfMuted, setPeerVolume, speaking, shares } = voice;
  const [volumes, setVolumes] = useState<Record<string, number>>(load);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  // Re-apply on join and on any volume/mute change: the volume map lives on
  // each participant, which is a new object every time someone connects.
  useEffect(() => {
    peers.forEach((p) => setPeerVolume(p, muted.has(p) ? 0 : (volumes[p] ?? 1)));
  }, [peers, volumes, muted, setPeerVolume]);

  function setVolume(name: string, v: number) {
    setVolumes((prev) => {
      const next = { ...prev, [name]: v };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }

  function toggleMute(name: string) {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <>
      <div className="flex items-center gap-1.5 text-sm text-sepia/70">
        <Dot on={speaking.includes(username)} />
        {username} <span className="text-sepia/40">(you)</span>
        {selfMuted && <MicOff size={10} className="text-sepia/50" />}
      </div>
      {peers.map((p) => (
        <div key={p}>
          <button
            onClick={() => setOpen((o) => (o === p ? null : p))}
            className="flex w-full items-center gap-1.5 text-left text-sm text-sepia/70 hover:text-sepia"
          >
            <Dot on={speaking.includes(p)} />
            {p}
            {muted.has(p) && <VolumeX size={10} className="text-sepia/50" />}
          </button>
          {open === p && (
            <div className="flex flex-col gap-1 py-1 pl-3.5">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volumes[p] ?? 1}
                onChange={(e) => setVolume(p, Number(e.target.value))}
                className="w-full accent-gold"
              />
              <Button
                size="xs"
                variant="ghost"
                className="w-full justify-start gap-1.5 text-xs text-sepia/50"
                onClick={() => toggleMute(p)}
              >
                {muted.has(p) ? <Volume2 size={12} /> : <VolumeX size={12} />}
                {muted.has(p) ? "unmute" : "mute"}
              </Button>
            </div>
          )}
        </div>
      ))}
      {shares.map((s) => (
        <button
          key={s.id}
          onClick={() => onOpenShare(s.id)}
          className={cn(
            "flex w-full min-w-0 items-center gap-1.5 text-left text-sm hover:text-sepia",
            openShare === s.id ? "text-gold" : "text-sepia/70",
          )}
        >
          <ScreenShare size={10} className="shrink-0" />
          <span className="truncate">{s.name}</span>
          <span className="shrink-0 text-sepia/40">(screen{s.self ? ", you" : ""})</span>
        </button>
      ))}
    </>
  );
}
