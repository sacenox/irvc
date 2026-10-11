package main

import (
	"database/sql"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type event struct {
	Type    string        `json:"type"`
	Message *Message      `json:"message,omitempty"`
	Users   []string      `json:"users,omitempty"`
	Roster  []userSummary `json:"roster,omitempty"`
}

type client struct {
	hub      *hub
	userID   int64
	username string
	conn     *websocket.Conn
	send     chan []byte
}

type hub struct {
	mu      sync.Mutex
	clients map[int64]map[*client]bool
	db      *sql.DB
}

func newHub(db *sql.DB) *hub {
	return &hub{clients: map[int64]map[*client]bool{}, db: db}
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
	h.mu.Unlock()
	close(c.send)
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

func (h *hub) broadcastPresence() {
	h.broadcast(event{Type: "presence", Users: h.users(), Roster: h.roster()})
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

func (s *Server) handleWS(c *gin.Context) {
	user := c.MustGet("user").(User)
	upgrader.CheckOrigin = func(r *http.Request) bool {
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
	pongWait   = 60 * time.Second
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
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
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
