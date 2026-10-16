package main

import (
	"database/sql"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type event struct {
	Type      string                     `json:"type"`
	Message   *Message                   `json:"message,omitempty"`
	Users     []string                   `json:"users,omitempty"`
	Roster    []userSummary              `json:"roster,omitempty"`
	Voice     map[string][]VoiceOccupant `json:"voice,omitempty"`
	Channel   *Channel                   `json:"channel,omitempty"`
	ChannelID int64                      `json:"channelId,omitempty"`
}

// VoiceOccupant is one user in a voice channel, as broadcast with presence.
// A user with several connections counts as muted or deafened only when every
// one of them is, so a second unmuted tab is never hidden.
type VoiceOccupant struct {
	Name     string `json:"name"`
	Muted    bool   `json:"muted"`
	Deafened bool   `json:"deafened"`
}

// wsIn is a message sent from a client over the socket.
type wsIn struct {
	Type      string `json:"type"`
	ChannelID int64  `json:"channelId"`
	Muted     bool   `json:"muted"`
	Deafened  bool   `json:"deafened"`
}

type client struct {
	hub      *hub
	userID   int64
	username string
	voiceID  int64
	muted    bool
	deafened bool
	conn     *websocket.Conn
	send     chan []byte
}

type hub struct {
	mu      sync.Mutex
	clients map[int64]map[*client]bool
	voice   map[int64]map[*client]bool
	db      *sql.DB
}

func newHub(db *sql.DB) *hub {
	return &hub{clients: map[int64]map[*client]bool{}, voice: map[int64]map[*client]bool{}, db: db}
}

func (h *hub) register(c *client) {
	h.mu.Lock()
	if h.clients[c.userID] == nil {
		h.clients[c.userID] = map[*client]bool{}
	}
	h.clients[c.userID][c] = true
	h.mu.Unlock()
	h.broadcastPresence()
}

func (h *hub) unregister(c *client) {
	h.mu.Lock()
	if set, ok := h.clients[c.userID]; ok {
		delete(set, c)
		if len(set) == 0 {
			delete(h.clients, c.userID)
		}
	}
	h.clearVoiceLocked(c)
	h.mu.Unlock()
	close(c.send)
	h.broadcastPresence()
}

// clearVoiceLocked drops a client's voice occupancy. Caller holds h.mu.
func (h *hub) clearVoiceLocked(c *client) {
	if c.voiceID == 0 {
		return
	}
	if set := h.voice[c.voiceID]; set != nil {
		delete(set, c)
		if len(set) == 0 {
			delete(h.voice, c.voiceID)
		}
	}
	c.voiceID = 0
}

// setVoice moves a client into a voice channel (0 for none) with its current
// mute and deafen state, and rebroadcasts. Occupancy is keyed by connection,
// not user, so one tab leaving a channel does not evict another tab that is
// still in it.
func (h *hub) setVoice(c *client, channelID int64, muted, deafened bool) {
	h.mu.Lock()
	h.clearVoiceLocked(c)
	c.voiceID = channelID
	c.muted = muted
	c.deafened = deafened
	if channelID != 0 {
		if h.voice[channelID] == nil {
			h.voice[channelID] = map[*client]bool{}
		}
		h.voice[channelID][c] = true
	}
	h.mu.Unlock()
	h.broadcastPresence()
}

func (h *hub) users() []string {
	h.mu.Lock()
	defer h.mu.Unlock()
	seen := map[string]bool{}
	users := []string{}
	for _, set := range h.clients {
		for c := range set {
			if !seen[c.username] {
				seen[c.username] = true
				users = append(users, c.username)
			}
			break
		}
	}
	return users
}

func (h *hub) broadcast(ev event) {
	data, err := json.Marshal(ev)
	if err != nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, set := range h.clients {
		for c := range set {
			select {
			case c.send <- data:
			default:
			}
		}
	}
}

func (h *hub) sendTo(ev event, userIDs ...int64) {
	data, err := json.Marshal(ev)
	if err != nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, uid := range userIDs {
		for c := range h.clients[uid] {
			select {
			case c.send <- data:
			default:
			}
		}
	}
}

func (h *hub) roster() []userSummary {
	rows, err := h.db.Query(`SELECT id, username FROM users ORDER BY username`)
	if err != nil {
		return nil
	}
	defer rows.Close()
	users := []userSummary{}
	for rows.Next() {
		var u userSummary
		if err := rows.Scan(&u.ID, &u.Username); err != nil {
			return users
		}
		users = append(users, u)
	}
	return users
}

func (h *hub) voiceOccupied(channelID int64) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.voice[channelID]) > 0
}

func (h *hub) voiceUsers() map[string][]VoiceOccupant {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := map[string][]VoiceOccupant{}
	for channelID, set := range h.voice {
		byName := map[string]*VoiceOccupant{}
		for c := range set {
			o := byName[c.username]
			if o == nil {
				o = &VoiceOccupant{Name: c.username, Muted: true, Deafened: true}
				byName[c.username] = o
			}
			o.Muted = o.Muted && c.muted
			o.Deafened = o.Deafened && c.deafened
		}
		names := make([]string, 0, len(byName))
		for name := range byName {
			names = append(names, name)
		}
		sort.Strings(names)
		occupants := make([]VoiceOccupant, 0, len(names))
		for _, name := range names {
			occupants = append(occupants, *byName[name])
		}
		out[strconv.FormatInt(channelID, 10)] = occupants
	}
	return out
}

func (h *hub) broadcastPresence() {
	h.broadcast(event{
		Type:   "presence",
		Users:  h.users(),
		Roster: h.roster(),
		Voice:  h.voiceUsers(),
	})
}

// checkOrigin allows same-host origins. It lives on the (shared) upgrader, so
// it must not be reassigned per request: concurrent upgrades would race.
func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return u.Hostname() == host
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     checkOrigin,
}

func (s *Server) handleWS(c *gin.Context) {
	user := c.MustGet("user").(User)
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	cl := &client{hub: s.hub, userID: user.ID, username: user.Username, conn: conn, send: make(chan []byte, 64)}
	s.hub.register(cl)
	go cl.writePump()
	cl.readPump()
}

const (
	writeWait  = 10 * time.Second
	pongWait   = 30 * time.Second
	pingPeriod = (pongWait * 9) / 10
)

func (c *client) readPump() {
	defer func() {
		c.hub.unregister(c)
		c.conn.Close()
	}()
	c.conn.SetReadLimit(4096)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		var in wsIn
		if json.Unmarshal(msg, &in) != nil {
			continue
		}
		switch in.Type {
		case "voice":
			c.hub.setVoice(c, in.ChannelID, in.Muted, in.Deafened)
		case "ping":
			// Application-level heartbeat: the browser answers protocol pings
			// itself, so a client cannot see them. This lets it detect a
			// half-open socket (sleep, dead network) instead of trusting it.
			select {
			case c.send <- []byte(`{"type":"pong"}`):
			default:
			}
		}
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()
	for {
		select {
		case data, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
