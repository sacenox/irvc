package main

import "os"

type Config struct {
	ListenAddr    string
	DBPath        string
	SessionSecret string
	LiveKitURL    string
	LiveKitKey    string
	LiveKitSecret string
}

func LoadConfig() *Config {
	return &Config{
		ListenAddr:    env("IRVC_LISTEN_ADDR", ":8080"),
		DBPath:        env("IRVC_DB_PATH", "irvc.db"),
		SessionSecret: env("IRVC_SESSION_SECRET", ""),
		LiveKitURL:    env("IRVC_LIVEKIT_URL", ""),
		LiveKitKey:    env("IRVC_LIVEKIT_API_KEY", ""),
		LiveKitSecret: env("IRVC_LIVEKIT_SECRET", ""),
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
