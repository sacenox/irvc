import { useEffect, useRef, useState } from "react";
import { Moon, RotateCcw, Sun } from "lucide-react";
import { Room } from "livekit-client";
import { Button, Field, Section, Select, Toggle } from "@/ui";
import type { AudioPresetName, FontSize, ScreenShareQuality, Settings as Prefs } from "../lib/settings";
import {
  TOKENS,
  effective,
  presets,
  tokenLabels,
  type Mode,
  type PresetId,
  type ThemePrefs,
  type Token,
} from "../lib/theme";
import { useMicPreview, type Voice } from "../lib/voice";

const minDb = -60;
const maxDb = -10;

// dbPct maps a dBFS value onto 0..100 across the slider's range.
const dbPct = (db: number) =>
  Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb))) * 100;

const audioPresets: { value: AudioPresetName; label: string }[] = [
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

export default function SettingsView({
  settings,
  update,
  voice,
  theme,
}: {
  settings: Prefs;
  update: (patch: Partial<Prefs>) => void;
  voice: Voice;
  theme: {
    prefs: ThemePrefs;
    setMode: (m: Mode) => void;
    setPreset: (p: PresetId) => void;
    setToken: (t: Token, color: string) => void;
    resetTokens: () => void;
  };
}) {
  const mics = useDevices("audioinput");
  const speakers = useDevices("audiooutput");
  // Outside a call there is no published track to meter, so open the mic for a
  // preview. In a call, reuse the live level to avoid capturing twice.
  const preview = useMicPreview(settings, voice.status !== "live");
  const meter = voice.status === "live" ? voice.micLevel : preview;
  const { prefs, setMode, setPreset, setToken, resetTokens } = theme;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 md:p-6">
      <Section label="Appearance">
        <div className="flex gap-2 px-2">
          {(["light", "dark"] as const).map((m) => (
            <Button
              key={m}
              variant={prefs.mode === m ? "primary" : "secondary"}
              className="flex-1"
              onClick={() => setMode(m)}
            >
              {m === "light" ? <Sun /> : <Moon />} {m}
            </Button>
          ))}
        </div>
        <Field label="palette">
          <Select
            value={prefs.preset}
            onChange={(v) => setPreset(v as PresetId)}
            options={presets.map((p) => ({ value: p.id, label: p.label }))}
          />
        </Field>
        <Field label="text size">
          <Select
            value={settings.fontSize}
            onChange={(v) => update({ fontSize: v as FontSize })}
            options={[
              { value: "normal", label: "normal" },
              { value: "default", label: "browser default" },
              { value: "large", label: "Help I'm old" },
            ]}
          />
        </Field>
      </Section>

      <Section label={`Colors · ${prefs.mode} mode`}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {TOKENS.map((t) => (
            <ColorField
              key={t}
              token={t}
              mode={prefs.mode}
              preset={prefs.preset}
              override={prefs.overrides[prefs.mode][t]}
              onChange={(color) => setToken(t, color)}
            />
          ))}
        </div>
        <div className="px-2 pt-1">
          <Button variant="ghost" onClick={resetTokens}>
            <RotateCcw /> reset to palette
          </Button>
        </div>
      </Section>

      <Section label="Sounds">
        <Toggle
          label="join/leave tone"
          checked={settings.joinSound}
          onChange={(v) => update({ joinSound: v })}
        />
        <Toggle
          label="ringing"
          checked={settings.ringSound}
          onChange={(v) => update({ ringSound: v })}
        />
      </Section>

      <Section label="Voice activation">
        <div className="px-2">
          <Level meter={meter} threshold={settings.gateThreshold} />
        </div>
        <div className="px-2">
          <input
            type="range"
            min={minDb}
            max={maxDb}
            step={1}
            value={settings.gateThreshold}
            onChange={(e) => update({ gateThreshold: Number(e.target.value) })}
            className="w-full accent-[var(--accent)]"
          />
        </div>
        <p className="px-2 text-xs text-faint">transmits above {settings.gateThreshold} dB</p>
      </Section>

      <Section label="Devices">
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
      </Section>

      <Section label="Quality">
        <Field label="audio">
          <Select
            value={settings.audioPreset}
            onChange={(v) => update({ audioPreset: v as AudioPresetName })}
            options={audioPresets}
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
      </Section>

      <Section label="Microphone processing">
        <Toggle
          label="echo cancellation"
          checked={settings.echoCancellation}
          onChange={(v) => update({ echoCancellation: v })}
        />
        <Toggle
          label="noise suppression"
          checked={settings.noiseSuppression}
          onChange={(v) => update({ noiseSuppression: v })}
        />
        <Toggle
          label="auto gain"
          checked={settings.autoGainControl}
          onChange={(v) => update({ autoGainControl: v })}
        />
        <Toggle
          label="voice isolation"
          checked={settings.voiceIsolation}
          onChange={(v) => update({ voiceIsolation: v })}
        />
      </Section>
    </div>
  );
}

function ColorField({
  token,
  mode,
  preset,
  override,
  onChange,
}: {
  token: Token;
  mode: Mode;
  preset: PresetId;
  override?: string;
  onChange: (color: string) => void;
}) {
  // Re-read the palette after the theme has been applied to the DOM, so the
  // swatch never shows the previous mode's or preset's colors.
  const [value, setValue] = useState(() => effective(token));
  useEffect(() => setValue(effective(token)), [token, override, mode, preset]);
  return (
    <label className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-raised">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-7 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
      />
      <span className="min-w-0 flex-1 truncate">{tokenLabels[token]}</span>
      <span className="text-xs text-faint">{override ? "custom" : "palette"}</span>
    </label>
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
    <div className="relative h-2 overflow-hidden rounded-md border border-line bg-surface">
      <div ref={ref} className="h-full bg-accent/70" />
      <div className="absolute inset-y-0 w-0.5 bg-fg/60" style={{ left: `${dbPct(threshold)}%` }} />
    </div>
  );
}
