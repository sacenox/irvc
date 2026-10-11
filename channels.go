package main

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func (s *Server) handleChannels(c *gin.Context) {
	rows, err := s.db.Query(`SELECT id, type, name, position FROM channels ORDER BY position, id`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	defer rows.Close()
	channels := []Channel{}
	for rows.Next() {
		var ch Channel
		if err := rows.Scan(&ch.ID, &ch.Type, &ch.Name, &ch.Position); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
			return
		}
		channels = append(channels, ch)
	}
	c.JSON(http.StatusOK, channels)
}

func (s *Server) handleMessages(c *gin.Context) {
	channelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad channel"})
		return
	}
	rows, err := s.db.Query(
		`SELECT m.id, m.channel_id, m.user_id, u.username, m.body, m.created_at
		 FROM messages m JOIN users u ON u.id = m.user_id
		 WHERE m.channel_id = ? ORDER BY m.id DESC LIMIT 200`,
		channelID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	defer rows.Close()
	messages := []Message{}
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Username, &m.Body, &m.CreatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
			return
		}
		messages = append(messages, m)
	}
	// reverse to chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	c.JSON(http.StatusOK, messages)
}

type sendMessageRequest struct {
	Body string `json:"body"`
}

func (s *Server) handleSendMessage(c *gin.Context) {
	channelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad channel"})
		return
	}
	var req sendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	body := strings.TrimSpace(req.Body)
	if body == "" || len(body) > maxMessageLen {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid message"})
		return
	}
	user := c.MustGet("user").(User)
	var channelType string
	if err := s.db.QueryRow(`SELECT type FROM channels WHERE id = ?`, channelID).Scan(&channelType); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	if channelType != "text" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a text channel"})
		return
	}
	now := time.Now().Unix()
	res, err := s.db.Exec(
		`INSERT INTO messages (channel_id, user_id, body, created_at) VALUES (?, ?, ?, ?)`,
		channelID, user.ID, body, now,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	id, _ := res.LastInsertId()
	msg := Message{ID: id, ChannelID: channelID, UserID: user.ID, Username: user.Username, Body: body, CreatedAt: now}
	s.hub.broadcast(event{Type: "message", Message: &msg})
	c.JSON(http.StatusOK, msg)
}
