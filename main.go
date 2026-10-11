package main

import (
	"database/sql"
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

func main() {
	cfg := LoadConfig()
	db := OpenDB(cfg.DBPath)
	defer db.Close()

	if len(os.Args) > 1 && os.Args[1] == "invite" {
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
	authed.GET("/channels/:id/messages", s.handleMessages)
	authed.POST("/channels/:id/messages", s.handleSendMessage)
	authed.POST("/channels/:id/voice", s.handleVoiceToken)
	authed.POST("/invites", s.handleCreateInvite)
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
