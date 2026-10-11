import { useEffect, useState } from "react";
import { HeadphoneOff, Headphones } from "lucide-react";
import { Room } from "livekit-client";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { AudioPresetName, Settings } from "../lib/settings";

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
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}) {
  const mics = useDevices("audioinput");
  const speakers = useDevices("audiooutput");

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-l border-sepia/15">
      <div className="px-4 py-3 text-[10px] uppercase tracking-widest text-sepia/40">Settings</div>
      <div className="space-y-4 px-3 pb-4">
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
          <Select
            value={settings.audioPreset}
            onChange={(v) => update({ audioPreset: v as AudioPresetName })}
            options={presets}
          />
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
    </aside>
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
