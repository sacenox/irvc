package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type videoGrant struct {
	Room         string `json:"room"`
	RoomJoin     bool   `json:"roomJoin"`
	CanPublish   bool   `json:"canPublish"`
	CanSubscribe bool   `json:"canSubscribe"`
}

type livekitClaims struct {
	Exp   int64      `json:"exp"`
	Nbf   int64      `json:"nbf"`
	Iss   string     `json:"iss"`
	Sub   string     `json:"sub"`
	Jti   string     `json:"jti"`
	Name  string     `json:"name"`
	Video videoGrant `json:"video"`
}

// livekitToken builds a LiveKit access token (HS256 JWT) by hand.
func livekitToken(apiKey, apiSecret, identity, name, room string) string {
	now := time.Now()
	claims := livekitClaims{
		Exp:  now.Add(6 * time.Hour).Unix(),
		Nbf:  now.Add(-10 * time.Second).Unix(),
		Iss:  apiKey,
		Sub:  identity,
		Jti:  identity,
		Name: name,
		Video: videoGrant{
			Room:         room,
			RoomJoin:     true,
			CanPublish:   true,
			CanSubscribe: true,
		},
	}
	header, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	payload, _ := json.Marshal(claims)
	enc := base64.RawURLEncoding.EncodeToString
	signingInput := enc(header) + "." + enc(payload)
	mac := hmac.New(sha256.New, []byte(apiSecret))
	mac.Write([]byte(signingInput))
	return signingInput + "." + enc(mac.Sum(nil))
}

func (s *Server) handleVoiceToken(c *gin.Context) {
	channelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad channel"})
		return
	}
	var channelType, channelName string
	if err := s.db.QueryRow(`SELECT type, name FROM channels WHERE id = ?`, channelID).Scan(&channelType, &channelName); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}
	user := c.MustGet("user").(User)
	// A DM call is a call in the DM, so it mints the same kind of token; only
	// voice channels and the caller's own DMs may be joined.
	if channelType == "dm" {
		if _, ok := dmPeer(channelName, user.ID); !ok {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
	} else if channelType != "voice" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a voice channel"})
		return
	}
	if s.cfg.LiveKitKey == "" || s.cfg.LiveKitSecret == "" || s.cfg.LiveKitURL == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "voice not configured"})
		return
	}
	room := fmt.Sprintf("voice-%d", channelID)
	token := livekitToken(s.cfg.LiveKitKey, s.cfg.LiveKitSecret, strconv.FormatInt(user.ID, 10), user.Username, room)
	c.JSON(http.StatusOK, gin.H{"url": s.cfg.LiveKitURL, "token": token, "room": room})
}
