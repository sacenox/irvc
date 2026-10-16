import { useEffect, useRef } from "react";
import { cn } from "cn";
import type { Camera, Voice } from "../lib/voice";

// Tile shows one camera publication. Our own preview is muted (it would feed
// back) and mirrored so it reads like a mirror, matching every video app.
function Tile({ cam, className }: { cam: Camera; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    cam.track.attach(el);
    return () => {
      cam.track.detach(el);
    };
  }, [cam.track]);

  return (
    <div className={cn("relative min-h-0 overflow-hidden rounded-md border border-line bg-black", className)}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={cam.self}
        className={cn("absolute inset-0 h-full w-full object-cover", cam.self && "-scale-x-100")}
      />
      <span className="absolute bottom-1 left-1 rounded bg-scrim px-1.5 py-0.5 text-xs text-fg">
        {cam.self ? "you" : cam.name}
      </span>
    </div>
  );
}

// CallView fills the call pane of a DM: peers fill the pane, our own camera
// sits as a small picture-in-picture in the corner so we can see what we send.
export default function CallView({ voice, className }: { voice: Voice; className?: string }) {
  const { cameras } = voice;
  const self = cameras.find((c) => c.self) ?? null;
  const remotes = cameras.filter((c) => !c.self);
  return (
    <div className={cn("relative min-h-0 bg-surface", className)}>
      <div
        className={cn(
          "grid h-full min-h-0 auto-rows-fr gap-1 p-1",
          remotes.length > 1 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {remotes.length > 0 ? (
          remotes.map((c) => <Tile key={c.id} cam={c} />)
        ) : (
          <div className="grid place-items-center text-sm text-faint">
            {voice.status === "live" ? "waiting for video…" : voice.error || voice.status}
          </div>
        )}
      </div>
      {self && (
        <div className="absolute right-2 bottom-2 aspect-video w-28 overflow-hidden rounded-md border border-line shadow-lg md:w-40">
          <Tile cam={self} className="h-full" />
        </div>
      )}
    </div>
  );
}
