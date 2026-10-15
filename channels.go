package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

func dmName(u1, u2 int64) string {
	if u1 > u2 {
		u1, u2 = u2, u1
	}
	return fmt.Sprintf("u:%d:%d", u1, u2)
}

func parseDM(name string) (int64, int64, bool) {
	var u1, u2 int64
	if _, err := fmt.Sscanf(name, "u:%d:%d", &u1, &u2); err != nil {
		return 0, 0, false
	}
	return u1, u2, true
}

func (s *Server) notifyChannel(channelType, channelName string, ev event) {
	if channelType == "dm" {
		if u1, u2, ok := parseDM(channelName); ok {
			s.hub.sendTo(ev, u1, u2)
		}
		return
	}
	s.hub.broadcast(ev)
}

func validChannelName(name string) bool {
	if len(name) < 1 || len(name) > 32 {
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

func (s *Server) handleChannels(c *gin.Context) {
	user := c.MustGet("user").(User)
	users := map[int64]string{}
	for _, u := range s.hub.roster() {
		users[u.ID] = u.Username
	}
	rows, err := s.db.Query(
		`SELECT c.id, c.type, c.name, c.position, c.permanent,
		        (SELECT COUNT(*) FROM messages m
		         WHERE m.channel_id = c.id AND m.user_id != ?
		           AND m.id > COALESCE((SELECT r.last_read_message_id FROM read_state r
		                                WHERE r.user_id = ? AND r.channel_id = c.id), 0))
		 FROM channels c ORDER BY c.position, c.id`,
		user.ID, user.ID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	defer rows.Close()
	channels := []Channel{}
	for rows.Next() {
		var ch Channel
		if err := rows.Scan(&ch.ID, &ch.Type, &ch.Name, &ch.Position, &ch.Permanent, &ch.Unread); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
			return
		}
		if ch.Type == "dm" {
			u1, u2, ok := parseDM(ch.Name)
			if !ok || (u1 != user.ID && u2 != user.ID) {
				continue
			}
			peerID := u1
			if u1 == user.ID {
				peerID = u2
			}
			ch.Name = users[peerID]
			if ch.Name == "" {
				continue
			}
		}
		channels = append(channels, ch)
	}
	c.JSON(http.StatusOK, channels)
}

// handleMarkRead advances the caller's read cursor for a channel to the latest
// message, clearing its unread count for every device they use.
func (s *Server) handleMarkRead(c *gin.Context) {
	channelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad channel"})
		return
	}
	user := c.MustGet("user").(User)
	if _, _, ok := s.checkTextOrDM(c, channelID, user.ID); !ok {
		return
	}
	var lastID int64
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(id), 0) FROM messages WHERE channel_id = ?`, channelID,
	).Scan(&lastID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	if _, err := s.db.Exec(
		`INSERT INTO read_state (user_id, channel_id, last_read_message_id, updated_at)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(user_id, channel_id) DO UPDATE SET
		   last_read_message_id = MAX(last_read_message_id, excluded.last_read_message_id),
		   updated_at = excluded.updated_at`,
		user.ID, channelID, lastID, time.Now().Unix(),
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	c.Status(http.StatusNoContent)
}

type createChannelRequest struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

func (s *Server) handleCreateChannel(c *gin.Context) {
	var req createChannelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	if req.Type != "text" && req.Type != "voice" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel type"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if !validChannelName(name) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid channel name"})
		return
	}
	var pos int
	if err := s.db.QueryRow(
		`SELECT COALESCE(MAX(position), 0) + 1 FROM channels WHERE type = ?`, req.Type,
	).Scan(&pos); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	res, err := s.db.Exec(
		`INSERT INTO channels (type, name, position, created_at) VALUES (?, ?, ?, ?)`,
		req.Type, name, pos, time.Now().Unix(),
	)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "channel already exists"})
		return
	}
	id, _ := res.LastInsertId()
	ch := Channel{ID: id, Type: req.Type, Name: name, Position: pos}
	s.hub.broadcast(event{Type: "channel", Channel: &ch})
	c.JSON(http.StatusOK, ch)
}

func (s *Server) handleDeleteChannel(c *gin.Context) {
	channelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad channel"})
		return
	}
	var ch Channel
	err = s.db.QueryRow(
		`SELECT id, type, name, position, permanent FROM channels WHERE id = ?`, channelID,
	).Scan(&ch.ID, &ch.Type, &ch.Name, &ch.Position, &ch.Permanent)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	if ch.Type == "dm" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a channel"})
		return
	}
	if ch.Permanent {
		c.JSON(http.StatusForbidden, gin.H{"error": "channel is permanent"})
		return
	}
	if ch.Type == "voice" && s.hub.voiceOccupied(channelID) {
		c.JSON(http.StatusConflict, gin.H{"error": "channel is not empty"})
		return
	}
	if _, err := s.db.Exec(`DELETE FROM messages WHERE channel_id = ?`, channelID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	if _, err := s.db.Exec(`DELETE FROM channels WHERE id = ?`, channelID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	s.hub.broadcast(event{Type: "channel_delete", ChannelID: channelID})
	c.Status(http.StatusNoContent)
}

func (s *Server) handleOpenDM(c *gin.Context) {
	peerID, err := strconv.ParseInt(c.Param("userId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad user"})
		return
	}
	user := c.MustGet("user").(User)
	var peerName string
	if err := s.db.QueryRow(`SELECT username FROM users WHERE id = ?`, peerID).Scan(&peerName); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	name := dmName(user.ID, peerID)
	s.db.Exec(
		`INSERT OR IGNORE INTO channels (type, name, position, created_at) VALUES ('dm', ?, 0, ?)`,
		name, time.Now().Unix(),
	)
	var ch Channel
	if err := s.db.QueryRow(`SELECT id, type, position FROM channels WHERE type = 'dm' AND name = ?`, name).Scan(&ch.ID, &ch.Type, &ch.Position); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	ch.Name = peerName
	c.JSON(http.StatusOK, ch)
}

func (s *Server) checkTextOrDM(c *gin.Context, channelID, userID int64) (string, string, bool) {
	var chType, chName string
	if err := s.db.QueryRow(`SELECT type, name FROM channels WHERE id = ?`, channelID).Scan(&chType, &chName); err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
			return "", "", false
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return "", "", false
	}
	if chType == "dm" {
		u1, u2, ok := parseDM(chName)
		if !ok || (u1 != userID && u2 != userID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return "", "", false
		}
		return chType, chName, true
	}
	if chType != "text" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "not a text channel"})
		return "", "", false
	}
	return chType, chName, true
}

func (s *Server) handleMessages(c *gin.Context) {
	channelID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad channel"})
		return
	}
	user := c.MustGet("user").(User)
	if _, _, ok := s.checkTextOrDM(c, channelID, user.ID); !ok {
		return
	}
	rows, err := s.db.Query(
		`SELECT m.id, m.channel_id, m.user_id, u.username, m.body, m.created_at, COALESCE(m.edited_at, 0)
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
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Username, &m.Body, &m.CreatedAt, &m.EditedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
			return
		}
		messages = append(messages, m)
	}
	// reverse to chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	if len(messages) > 0 {
		byID := make(map[int64]*Message, len(messages))
		for i := range messages {
			byID[messages[i].ID] = &messages[i]
		}
		rRows, err := s.db.Query(
			`SELECT r.message_id, r.reaction, u.username
			 FROM reactions r JOIN users u ON u.id = r.user_id
			 WHERE r.message_id >= ? AND r.message_id <= ?
			 ORDER BY r.rowid`,
			messages[0].ID, messages[len(messages)-1].ID,
		)
		if err == nil {
			defer rRows.Close()
			for rRows.Next() {
				var mid int64
				var react, uname string
				if rRows.Scan(&mid, &react, &uname) == nil {
					if m := byID[mid]; m != nil {
						if m.Reactions == nil {
							m.Reactions = map[string][]string{}
						}
						m.Reactions[react] = append(m.Reactions[react], uname)
					}
				}
			}
		}
	}
	c.JSON(http.StatusOK, messages)
}

func (s *Server) messageReactions(msgID int64) map[string][]string {
	rows, err := s.db.Query(
		`SELECT r.reaction, u.username FROM reactions r JOIN users u ON u.id = r.user_id WHERE r.message_id = ? ORDER BY r.rowid`,
		msgID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out map[string][]string
	for rows.Next() {
		var react, uname string
		if rows.Scan(&react, &uname) == nil {
			if out == nil {
				out = map[string][]string{}
			}
			out[react] = append(out[react], uname)
		}
	}
	return out
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
	chType, chName, ok := s.checkTextOrDM(c, channelID, user.ID)
	if !ok {
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
	s.notifyChannel(chType, chName, event{Type: "message", Message: &msg})
	c.JSON(http.StatusOK, msg)
}

func (s *Server) handleEditMessage(c *gin.Context) {
	msgID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad message"})
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
	now := time.Now().Unix()
	var m Message
	err = s.db.QueryRow(
		`UPDATE messages SET body = ?, edited_at = ?
		 WHERE id = ? AND user_id = ?
		 RETURNING id, channel_id, user_id, body, created_at, edited_at`,
		body, now, msgID, user.ID,
	).Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Body, &m.CreatedAt, &m.EditedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	m.Username = user.Username
	m.Reactions = s.messageReactions(m.ID)
	var chType, chName string
	s.db.QueryRow(`SELECT type, name FROM channels WHERE id = ?`, m.ChannelID).Scan(&chType, &chName)
	s.notifyChannel(chType, chName, event{Type: "message_edit", Message: &m})
	c.JSON(http.StatusOK, m)
}

var validReactions = map[string]bool{
	"+1":    true,
	"-1":    true,
	"heart": true,
	"laugh": true,
}

type reactionRequest struct {
	Reaction string `json:"reaction"`
}

func (s *Server) handleToggleReaction(c *gin.Context) {
	msgID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad message"})
		return
	}
	var req reactionRequest
	if err := c.ShouldBindJSON(&req); err != nil || !validReactions[req.Reaction] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid reaction"})
		return
	}
	var m Message
	err = s.db.QueryRow(
		`SELECT m.id, m.channel_id, m.user_id, u.username, m.body, m.created_at, COALESCE(m.edited_at, 0)
		 FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`,
		msgID,
	).Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Username, &m.Body, &m.CreatedAt, &m.EditedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	user := c.MustGet("user").(User)
	chType, chName, ok := s.checkTextOrDM(c, m.ChannelID, user.ID)
	if !ok {
		return
	}
	res, err := s.db.Exec(
		`DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND reaction = ?`,
		msgID, user.ID, req.Reaction,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		if _, err := s.db.Exec(
			`INSERT INTO reactions (message_id, user_id, reaction) VALUES (?, ?, ?)`,
			msgID, user.ID, req.Reaction,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
			return
		}
	}
	m.Reactions = s.messageReactions(m.ID)
	s.notifyChannel(chType, chName, event{Type: "message_edit", Message: &m})
	c.JSON(http.StatusOK, m)
}

func (s *Server) handleDeleteMessage(c *gin.Context) {
	msgID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad message"})
		return
	}
	user := c.MustGet("user").(User)
	var m Message
	err = s.db.QueryRow(
		`DELETE FROM messages WHERE id = ? AND user_id = ? RETURNING id, channel_id`,
		msgID, user.ID,
	).Scan(&m.ID, &m.ChannelID)
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	var chType, chName string
	s.db.QueryRow(`SELECT type, name FROM channels WHERE id = ?`, m.ChannelID).Scan(&chType, &chName)
	s.notifyChannel(chType, chName, event{Type: "message_delete", Message: &m})
	c.Status(http.StatusNoContent)
}
