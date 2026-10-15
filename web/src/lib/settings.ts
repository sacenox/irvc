import { useCallback, useEffect, useState } from "react";

// "normal" is our own pinned 16px default. "default" means the browser's root
// font size, which the user may have changed. Old stored "default" values are
// intentionally left as-is (no migration).
export type FontSize = "default" | "normal" | "large";

export type ScreenShareQuality = "720p" | "1080p";

export type AudioPresetName =
  | "telephone"
  | "speech"
  | "music"
  | "musicStereo"
  | "musicHighQuality"
  | "musicHighQualityStereo";

export interface Settings {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  voiceIsolation: boolean;
  audioPreset: AudioPresetName;
  micDeviceId: string;
  speakerDeviceId: string;
  deafened: boolean;
  gateThreshold: number;
  joinSound: boolean;
  screenShareQuality: ScreenShareQuality;
  fontSize: FontSize;
}

export const defaultSettings: Settings = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceIsolation: false,
  audioPreset: "speech",
  micDeviceId: "",
  speakerDeviceId: "",
  deafened: false,
  gateThreshold: -60,
  joinSound: true,
  screenShareQuality: "720p",
  fontSize: "normal",
};

const key = "irvc.settings";

function load(): Settings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
  } catch {
    return defaultSettings;
  }
}

// useSettings persists voice + UI preferences to localStorage. The empty
// deviceId means "system default" for both mic and speaker.
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(settings));
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  return { settings, update };
}
