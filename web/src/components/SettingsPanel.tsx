import { useEffect, useRef, useState } from "react";
import { HeadphoneOff, Headphones } from "lucide-react";
import { Room } from "livekit-client";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { AudioPresetName, FontSize, ScreenShareQuality, Settings } from "../lib/settings";
import type { Theme } from "../lib/theme";
import { useMicPreview, type Voice } from "../lib/voice";

const minDb = -60;
const maxDb = -10;

// dbPct maps a dBFS value onto 0..100 across the slider's range.
function dbPct(db: number) {
  return Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb))) * 100;
}

const presets: { value: AudioPresetName; label: string }[] = [
  { value: "telephone", label: "telephone · 12 kbps" },
  { value: "speech", label: "speech · 24 kbps" },
  { value: "music", label: "music · 48 kbps" },
  { value: "musicStereo", label: "music stereo · 64 kbps" },
  { value: "musicHighQuality", label: "high quality · 96 kbps" },
  { value: "musicHighQualityStereo", label: "high quality stereo · 128 kbps" },
];

// useDevices lists available input/output devices. Labels stay blank until the
// user grants mic permission (i.e. joins voice), which is fine.
function useDevices(kind: MediaDeviceKind) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const list = await Room.getLocalDevices(kind, false).catch(() => []);
      if (alive) setDevices(list.filter((d) => d.deviceId));
    };
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => {
      alive = false;
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
    };
  }, [kind]);

  return devices;
}

export default function SettingsPanel({
  settings,
  update,
  voice,
  theme,
  onThemeChange,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  voice: Voice;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const mics = useDevices("audioinput");
  const speakers = useDevices("audiooutput");
  // Outside a call there is no published track to meter, so open the mic for a
  // preview. In a call, reuse the live level to avoid capturing twice.
  const preview = useMicPreview(settings, voice.status !== "live");
  const meter = voice.status === "live" ? voice.micLevel : preview;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Group label="User preferences">
          <Field label="theme">
            <Select
              value={theme}
              onChange={(v) => onThemeChange(v as Theme)}
              options={[
                { value: "80s-nicotine", label: "80s nicotine" },
                { value: "tuxedo", label: "tuxedo" },
              ]}
            />
          </Field>
          <Field label="font size">
            <Select
              value={settings.fontSize}
              onChange={(v) => update({ fontSize: v as FontSize })}
              options={[
                { value: "normal", label: "normal" },
                { value: "default", label: "browser default" },
                { value: "large", label: "Help, I'm old" },
              ]}
            />
          </Field>
        </Group>

        <Group label="Sounds">
          <Toggle
            label="join/leave sound"
            value={settings.joinSound}
            onChange={(v) => update({ joinSound: v })}
          />
        </Group>

        <Group label="Voice">
          <Button
            variant={settings.deafened ? "secondary" : "ghost"}
            size="sm"
            className="w-full justify-start gap-2 font-normal"
            onClick={() => update({ deafened: !settings.deafened })}
          >
            {settings.deafened ? <HeadphoneOff size={14} /> : <Headphones size={14} />}
            {settings.deafened ? "deafened" : "deafen"}
          </Button>
        </Group>

        <Group label="Voice activation">
          <Level meter={meter} threshold={settings.gateThreshold} />
          <input
            type="range"
            min={minDb}
            max={maxDb}
            step={1}
            value={settings.gateThreshold}
            onChange={(e) => update({ gateThreshold: Number(e.target.value) })}
            className="w-full accent-gold"
          />
          <div className="px-1 text-xs text-sepia/50">
            transmits above {settings.gateThreshold} dB
          </div>
        </Group>

        <Group label="Devices">
          <Field label="microphone">
            <Select
              value={settings.micDeviceId}
              onChange={(v) => update({ micDeviceId: v })}
              options={[
                { value: "", label: "system default" },
                ...mics.map((d) => ({ value: d.deviceId, label: d.label || "microphone" })),
              ]}
            />
          </Field>
          <Field label="speaker">
            <Select
              value={settings.speakerDeviceId}
              onChange={(v) => update({ speakerDeviceId: v })}
              options={[
                { value: "", label: "system default" },
                ...speakers.map((d) => ({ value: d.deviceId, label: d.label || "speaker" })),
              ]}
            />
          </Field>
        </Group>

        <Group label="Quality">
          <Field label="audio">
            <Select
              value={settings.audioPreset}
              onChange={(v) => update({ audioPreset: v as AudioPresetName })}
              options={presets}
            />
          </Field>
          <Field label="screen share">
            <Select
              value={settings.screenShareQuality}
              onChange={(v) => update({ screenShareQuality: v as ScreenShareQuality })}
              options={[
                { value: "720p", label: "720p · 30 fps" },
                { value: "1080p", label: "1080p · 30 fps" },
              ]}
            />
          </Field>
        </Group>

        <Group label="Microphone processing">
          <Toggle
            label="echo cancellation"
            value={settings.echoCancellation}
            onChange={(v) => update({ echoCancellation: v })}
          />
          <Toggle
            label="noise suppression"
            value={settings.noiseSuppression}
            onChange={(v) => update({ noiseSuppression: v })}
          />
          <Toggle
            label="auto gain"
            value={settings.autoGainControl}
            onChange={(v) => update({ autoGainControl: v })}
          />
          <Toggle
            label="voice isolation"
            value={settings.voiceIsolation}
            onChange={(v) => update({ voiceIsolation: v })}
          />
        </Group>
      </div>
    </div>
  );
}

// Level draws the live mic level and marks where the gate threshold sits, so
// the slider can be placed above the room's background noise.
function Level({ meter, threshold }: { meter: () => number; threshold: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (ref.current) ref.current.style.width = `${dbPct(meter())}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [meter]);

  return (
    <div className="relative mx-1 h-1.5 overflow-hidden rounded bg-muted">
      <div ref={ref} className="h-full bg-gold/70" />
      <div
        className="absolute inset-y-0 w-0.5 bg-sepia/60"
        style={{ left: `${dbPct(threshold)}%` }}
      />
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="px-1 text-[10px] uppercase tracking-widest text-sepia/40">{label}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 px-1">
      <span className="text-xs text-sepia/50">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm text-sepia outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-sm font-normal text-sepia hover:bg-muted"
    >
      {label}
      <span
        className={cn(
          "h-4 w-4 rounded border",
          value ? "border-gold bg-gold/30" : "border-sepia/25",
        )}
      />
    </button>
  );
}
