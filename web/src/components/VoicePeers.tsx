import { useEffect, useState } from "react";
import { MicOff, Volume2, VolumeX } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { Voice } from "../lib/voice";

const storageKey = "irvc.peerVolumes";

function load(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "{}");
  } catch {
    return {};
  }
}

export default function VoicePeers({ voice, username }: { voice: Voice; username: string }) {
  const { peers, muted: selfMuted, setPeerVolume, speaking } = voice;
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
      <div className="flex items-center gap-1.5 text-xs text-sepia/70">
        <Dot on={speaking.includes(username)} />
        {username} <span className="text-sepia/40">(you)</span>
        {selfMuted && <MicOff size={10} className="text-sepia/50" />}
      </div>
      {peers.map((p) => (
        <div key={p}>
          <button
            onClick={() => setOpen((o) => (o === p ? null : p))}
            className="flex w-full items-center gap-1.5 text-left text-xs text-sepia/70 hover:text-sepia"
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
    </>
  );
}

// The dot stays dim until the participant is speaking, then lights up.
function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={cn("h-1.5 w-1.5 rounded-full transition-colors", on ? "bg-gold" : "bg-sepia/25")}
    />
  );
}
