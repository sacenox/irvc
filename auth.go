package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/argon2"
)

const (
	cookieName    = "irvc_session"
	sessionTTL    = 30 * 24 * time.Hour
	inviteTTL     = 14 * 24 * time.Hour
	argonTime     = 1
	argonMemory   = 64 * 1024
	argonThreads  = 4
	argonKeyLen   = 32
	minPassword   = 8
	maxMessageLen = 4000
)

func randToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func hashPassword(pw string) string {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		panic(err)
	}
	key := argon2.IDKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return base64.RawStdEncoding.EncodeToString(salt) + "$" + base64.RawStdEncoding.EncodeToString(key)
}

func checkPassword(pw, encoded string) bool {
	saltB64, keyB64, ok := strings.Cut(encoded, "$")
	if !ok {
		return false
	}
	salt, err1 := base64.RawStdEncoding.DecodeString(saltB64)
	want, err2 := base64.RawStdEncoding.DecodeString(keyB64)
	if err1 != nil || err2 != nil {
		return false
	}
	got := argon2.IDKey([]byte(pw), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return subtle.ConstantTimeCompare(got, want) == 1
}

func (s *Server) sign(token string) string {
	mac := hmac.New(sha256.New, []byte(s.cfg.SessionSecret))
	mac.Write([]byte(token))
	return token + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (s *Server) verifyToken(signed string) (string, bool) {
	token, sig, ok := strings.Cut(signed, ".")
	if !ok {
		return "", false
	}
	mac := hmac.New(sha256.New, []byte(s.cfg.SessionSecret))
	mac.Write([]byte(token))
	if subtle.ConstantTimeCompare([]byte(sig), []byte(base64.RawURLEncoding.EncodeToString(mac.Sum(nil)))) != 1 {
		return "", false
	}
	return token, true
}

func (s *Server) setSession(c *gin.Context, userID int64) error {
	token := randToken()
	expires := time.Now().Add(sessionTTL)
	if _, err := s.db.Exec(
		`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
		token, userID, expires.Unix(),
	); err != nil {
		return err
	}
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     cookieName,
		Value:    s.sign(token),
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
	return nil
}

func (s *Server) currentUser(c *gin.Context) (User, bool) {
	cookie, err := c.Cookie(cookieName)
	if err != nil {
		return User{}, false
	}
	token, ok := s.verifyToken(cookie)
	if !ok {
		return User{}, false
	}
	var u User
	err = s.db.QueryRow(
		`SELECT u.id, u.username, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.id = ? AND s.expires_at > ?`,
		token, time.Now().Unix(),
	).Scan(&u.ID, &u.Username, &u.CreatedAt)
	if err != nil {
		return User{}, false
	}
	return u, true
}

func (s *Server) requireAuth(c *gin.Context) {
	u, ok := s.currentUser(c)
	if !ok {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	c.Set("user", u)
	s.db.Exec(`DELETE FROM sessions WHERE expires_at <= ?`, time.Now().Unix())
	c.Next()
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) handleLogin(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	var u User
	err := s.db.QueryRow(
		`SELECT id, username, pass_hash, created_at FROM users WHERE username = ?`,
		req.Username,
	).Scan(&u.ID, &u.Username, &u.PassHash, &u.CreatedAt)
	if err != nil || !checkPassword(req.Password, u.PassHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}
	if err := s.setSession(c, u.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "session"})
		return
	}
	c.JSON(http.StatusOK, u)
}

func (s *Server) handleLogout(c *gin.Context) {
	if cookie, err := c.Cookie(cookieName); err == nil {
		if token, ok := s.verifyToken(cookie); ok {
			s.db.Exec(`DELETE FROM sessions WHERE id = ?`, token)
		}
	}
	http.SetCookie(c.Writer, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1})
	c.Status(http.StatusNoContent)
}

func (s *Server) handleMe(c *gin.Context) {
	c.JSON(http.StatusOK, c.MustGet("user").(User))
}

type userSummary struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
}

func (s *Server) handleUsers(c *gin.Context) {
	rows, err := s.db.Query(`SELECT id, username FROM users ORDER BY username`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	defer rows.Close()
	users := []userSummary{}
	for rows.Next() {
		var u userSummary
		if err := rows.Scan(&u.ID, &u.Username); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
			return
		}
		users = append(users, u)
	}
	c.JSON(http.StatusOK, users)
}

type claimRequest struct {
	Token    string `json:"token"`
	Username string `json:"username"`
	Password string `json:"password"`
}

func validUsername(name string) bool {
	if len(name) < 3 || len(name) > 32 {
		return false
	}
	for _, r := range name {
		ok := r == '_' || r == '-' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')
		if !ok {
			return false
		}
	}
	return true
}

func (s *Server) handleClaim(c *gin.Context) {
	var req claimRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if !validUsername(req.Username) || len(req.Password) < minPassword {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid username or password too short"})
		return
	}
	tx, err := s.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	defer tx.Rollback()

	var usedBy sql.NullInt64
	var expires int64
	err = tx.QueryRow(`SELECT used_by, expires_at FROM invites WHERE token = ?`, req.Token).Scan(&usedBy, &expires)
	if err != nil || usedBy.Valid || expires < time.Now().Unix() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid or expired invite"})
		return
	}
	res, err := tx.Exec(
		`INSERT INTO users (username, pass_hash, created_at) VALUES (?, ?, ?)`,
		req.Username, hashPassword(req.Password), time.Now().Unix(),
	)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username taken"})
		return
	}
	userID, _ := res.LastInsertId()
	if _, err := tx.Exec(
		`UPDATE invites SET used_by = ?, used_at = ? WHERE token = ?`,
		userID, time.Now().Unix(), req.Token,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	if err := s.setSession(c, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "session"})
		return
	}
	c.JSON(http.StatusOK, User{ID: userID, Username: req.Username, CreatedAt: time.Now().Unix()})
}

func (s *Server) handleInviteInfo(c *gin.Context) {
	var usedBy sql.NullInt64
	var expires int64
	err := s.db.QueryRow(
		`SELECT used_by, expires_at FROM invites WHERE token = ?`, c.Param("token"),
	).Scan(&usedBy, &expires)
	if err != nil || usedBy.Valid || expires < time.Now().Unix() {
		c.JSON(http.StatusNotFound, gin.H{"error": "invalid or expired invite"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"valid": true})
}

type rateLimiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{hits: map[string][]time.Time{}, limit: limit, window: window}
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-rl.window)
	kept := rl.hits[key][:0]
	for _, t := range rl.hits[key] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	rl.hits[key] = kept
	if len(kept) >= rl.limit {
		return false
	}
	rl.hits[key] = append(kept, now)
	return true
}

func (s *Server) rateLimited(rl *rateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !rl.allow(c.ClientIP()) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests"})
			return
		}
		c.Next()
	}
}
