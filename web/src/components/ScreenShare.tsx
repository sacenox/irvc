import { useEffect, useRef } from "react";
import type { Track } from "livekit-client";

// ScreenShareView fills the main pane with a screen-share video track. The video
// element stays muted: share audio is a separate track and plays through the
// call's own audio path, where deafen and per-peer volume already apply.
export default function ScreenShareView({ track }: { track: Track }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-black p-2">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-contain"
      />
    </div>
  );
}
