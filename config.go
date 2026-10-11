package main

import (
	"os"
	"strconv"
)

type Config struct {
	ListenAddr    string
	DBPath        string
	SessionSecret string
	LiveKitURL    string
	LiveKitKey    string
	LiveKitSecret string
	MediaDir      string
	MaxUpload     int64
}

func LoadConfig() *Config {
	return &Config{
		ListenAddr:    env("IRVC_LISTEN_ADDR", ":8080"),
		DBPath:        env("IRVC_DB_PATH", "irvc.db"),
		SessionSecret: env("IRVC_SESSION_SECRET", ""),
		LiveKitURL:    env("IRVC_LIVEKIT_URL", ""),
		LiveKitKey:    env("IRVC_LIVEKIT_API_KEY", ""),
		LiveKitSecret: env("IRVC_LIVEKIT_SECRET", ""),
		MediaDir:      env("IRVC_MEDIA_DIR", "media"),
		MaxUpload:     envInt("IRVC_MAX_UPLOAD", 8<<20),
	}
}

func envInt(key string, def int64) int64 {
	v, err := strconv.ParseInt(os.Getenv(key), 10, 64)
	if err != nil || v <= 0 {
		return def
	}
	return v
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
