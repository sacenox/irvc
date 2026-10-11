import { useCallback, useEffect, useState } from "react";

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
