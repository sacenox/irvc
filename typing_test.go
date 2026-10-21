package main

import (
	"path/filepath"
	"strings"
	"testing"
)

func testClient(h *hub, id int64, name string) *client {
	c := &client{hub: h, userID: id, username: name, send: make(chan []byte, 8)}
	h.clients[id] = map[*client]bool{c: true}
	return c
}

func got(c *client) bool { return len(c.send) > 0 }

func drain(cs ...*client) {
	for _, c := range cs {
		for len(c.send) > 0 {
			<-c.send
		}
	}
}

// Typing is relayed to everyone for a text channel, only to the two
// participants for a DM, and never faster than typingEvery per connection.
func TestTypingRelay(t *testing.T) {
	db := OpenDB(filepath.Join(t.TempDir(), "t.db"))
	h := newHub(db)
	a, b, outsider := testClient(h, 1, "a"), testClient(h, 2, "b"), testClient(h, 3, "c")

	var text, dm int64
	db.QueryRow(`SELECT id FROM channels WHERE type = 'text' LIMIT 1`).Scan(&text)
	res, err := db.Exec(`INSERT INTO channels (type, name, position, created_at) VALUES ('dm', 'u:1:2', 0, 0)`)
	if err != nil {
		t.Fatal(err)
	}
	dm, _ = res.LastInsertId()

	h.typing(a, text)
	if !got(a) || !got(b) || !got(outsider) {
		t.Fatal("text channel typing should reach everyone")
	}
	if ev := string(<-b.send); !strings.Contains(ev, `"username":"a"`) {
		t.Fatalf("unexpected event %s", ev)
	}

	h.typing(a, text) // within typingEvery
	if got(b) {
		t.Fatal("typing events should be rate limited per connection")
	}

	drain(a, b, outsider)
	a.typedAt = a.typedAt.Add(-2 * typingEvery)
	h.typing(a, dm)
	if !got(b) || got(outsider) {
		t.Fatal("DM typing should reach only its participants")
	}

	outsider.typedAt = outsider.typedAt.Add(-2 * typingEvery)
	drain(a, b, outsider)
	h.typing(outsider, dm)
	if got(b) || got(a) {
		t.Fatal("a non-participant must not be able to type into a DM")
	}
}
