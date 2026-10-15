package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type Server struct {
	cfg *Config
	db  *sql.DB
	hub *hub
}

// usage prints out human readable usage for fs
func usage(fs *flag.FlagSet) func() {
	return func() {
		w := fs.Output()
		fmt.Fprint(w, `irvc - self-hosted WebRTC text and voice chat

Usage:
  irvc [flags]           run the server
  irvc [flags] invite    create an invite and print its token

Flags:
`)
		printFlags(fs)
		fmt.Fprint(w, `
Secrets are read from the environment only:
  IRVC_SESSION_SECRET     signs sessions (required to run the server)
  IRVC_LIVEKIT_API_KEY    LiveKit API key
  IRVC_LIVEKIT_SECRET     LiveKit API secret

See README.md for details.
`)
	}
}

// printFlags prints defaults like flag.PrintDefaults, but with GNU-style "--long" names
func printFlags(fs *flag.FlagSet) {
	fs.VisitAll(func(f *flag.Flag) {
		name, usage := flag.UnquoteUsage(f)
		head := "  --" + f.Name
		if name != "" {
			head += " " + name
		}
		if f.DefValue != "" && f.DefValue != "0" {
			usage += fmt.Sprintf(" (default: %s)", f.DefValue)
		}
		fmt.Fprintf(fs.Output(), "%s\n    \t%s\n", head, usage)
	})
}

func main() {
	cfg := LoadConfig()

	// flags parsed before db/secret check so that --help always works
	fs := flag.NewFlagSet("irvc", flag.ExitOnError)
	fs.Usage = usage(fs)
	fs.StringVar(&cfg.ListenAddr, "listen", cfg.ListenAddr, "IRVC_LISTEN_ADDR, address to listen on")
	fs.StringVar(&cfg.DBPath, "db", cfg.DBPath, "IRVC_DB_PATH, path to the SQLite database")
	fs.StringVar(&cfg.MediaDir, "media-dir", cfg.MediaDir, "IRVC_MEDIA_DIR, directory for uploaded media")
	fs.Int64Var(&cfg.MaxUpload, "max-upload", cfg.MaxUpload, "IRVC_MAX_UPLOAD, max upload size in bytes")
	fs.StringVar(&cfg.LiveKitURL, "livekit-url", cfg.LiveKitURL, "IRVC_LIVEKIT_URL, LiveKit server URL for voice chat")
	genSecret := fs.Bool("gen-secret", false, "generate a random session secret, print it and exit")
	fs.Parse(os.Args[1:])

	if *genSecret {
		fmt.Println(randToken())
		return
	}

	cmd := fs.Arg(0)
	if cmd != "" && cmd != "invite" {
		fmt.Fprintf(fs.Output(), "unknown command %q\n\n", cmd)
		fs.Usage()
		os.Exit(2)
	}

	db := OpenDB(cfg.DBPath)
	defer db.Close()

	if cmd == "invite" {
		makeInvite(db)
		return
	}
	runServer(cfg, db)
}

func makeInvite(db *sql.DB) {
	token := randToken()
	expires := time.Now().Add(inviteTTL).Unix()
	if _, err := db.Exec(
		`INSERT INTO invites (token, created_by, expires_at) VALUES (?, NULL, ?)`,
		token, expires,
	); err != nil {
		log.Fatalf("create invite: %v", err)
	}
	fmt.Printf("invite token: %s\n", token)
	fmt.Printf("expires:      %s\n", time.Unix(expires, 0).Format(time.RFC3339))
	fmt.Printf("invite url:   /join?token=%s\n", token)
}

func runServer(cfg *Config, db *sql.DB) {
	if cfg.SessionSecret == "" {
		log.Fatal("IRVC_SESSION_SECRET is required")
	}
	if err := os.MkdirAll(cfg.MediaDir, 0o755); err != nil {
		log.Fatalf("media dir: %v", err)
	}
	s := &Server{cfg: cfg, db: db, hub: newHub(db)}

	r := gin.Default()
	loginLimiter := newRateLimiter(10, time.Minute)
	claimLimiter := newRateLimiter(10, time.Minute)

	api := r.Group("/api")
	api.POST("/claim", s.rateLimited(claimLimiter), s.handleClaim)
	api.POST("/login", s.rateLimited(loginLimiter), s.handleLogin)
	api.GET("/invites/:token", s.handleInviteInfo)

	authed := api.Group("", s.requireAuth)
	authed.GET("/me", s.handleMe)
	authed.GET("/users", s.handleUsers)
	authed.POST("/logout", s.handleLogout)
	authed.GET("/channels", s.handleChannels)
	authed.POST("/dms/:userId", s.handleOpenDM)
	authed.GET("/channels/:id/messages", s.handleMessages)
	authed.POST("/channels/:id/messages", s.handleSendMessage)
	authed.PATCH("/messages/:id", s.handleEditMessage)
	authed.DELETE("/messages/:id", s.handleDeleteMessage)
	authed.POST("/channels/:id/voice", s.handleVoiceToken)
	authed.POST("/invites", s.handleCreateInvite)
	authed.POST("/upload", s.handleUpload)
	authed.GET("/media/:name", s.handleMedia)
	authed.GET("/ws", s.handleWS)

	serveFrontend(r)

	addr := cfg.ListenAddr
	log.Printf("irvc listening on %s", addr)
	if err := r.Run(addr); err != nil {
		log.Fatal(err)
	}
}

func serveFrontend(r *gin.Engine) {
	index := filepath.Join("web", "dist", "index.html")
	if _, err := os.Stat(index); err != nil {
		return
	}
	r.Static("/assets", filepath.Join("web", "dist", "assets"))
	r.StaticFile("/", index)
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.File(index)
	})
}
