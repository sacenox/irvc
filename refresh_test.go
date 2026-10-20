package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// A card that appears after a message was sent must reach connected clients
// as an edit event carrying the preview.
func TestRefreshPreviewBroadcasts(t *testing.T) {
	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<head><meta property="og:title" content="Hi"></head>`))
	}))
	defer page.Close()

	dir := t.TempDir()
	db := OpenDB(filepath.Join(dir, "t.db"))
	s := &Server{db: db, hub: newHub(db), previews: newPreviewer(dir, true)}
	db.Exec(`INSERT INTO users (id, username, pass_hash, created_at) VALUES (1, 'a', 'x', 0)`)
	var ch int64
	db.QueryRow(`SELECT id FROM channels WHERE type = 'text' LIMIT 1`).Scan(&ch)
	res, _ := db.Exec(`INSERT INTO messages (channel_id, user_id, body, created_at) VALUES (?, 1, ?, 0)`, ch, "see "+page.URL)
	id, _ := res.LastInsertId()
	viewer := testClient(s.hub, 9, "viewer")

	s.refreshPreview(id)

	select {
	case data := <-viewer.send:
		if ev := string(data); !strings.Contains(ev, `"message_edit"`) || !strings.Contains(ev, `"kind":"card"`) {
			t.Fatalf("unexpected event %s", ev)
		}
	case <-time.After(time.Second):
		t.Fatal("no event broadcast for the new card")
	}
}

// Only the author can remove a card; removal sticks (the same link is not
// fetched again), deletes the cached thumbnail, and a slow fetch that finishes
// afterwards cannot bring the card back.
func TestRemovePreview(t *testing.T) {
	hits := 0
	page := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits++
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<head><meta property="og:title" content="Hi"></head>`))
	}))
	defer page.Close()

	dir := t.TempDir()
	db := OpenDB(filepath.Join(dir, "t.db"))
	s := &Server{cfg: &Config{MediaDir: dir}, db: db, hub: newHub(db), previews: newPreviewer(dir, true)}
	db.Exec(`INSERT INTO users (id, username, pass_hash, created_at) VALUES (1, 'a', 'x', 0), (2, 'b', 'x', 0)`)
	var ch int64
	db.QueryRow(`SELECT id FROM channels WHERE type = 'text' LIMIT 1`).Scan(&ch)
	res, _ := db.Exec(`INSERT INTO messages (channel_id, user_id, body, created_at) VALUES (?, 1, ?, 0)`, ch, "see "+page.URL)
	id, _ := res.LastInsertId()

	s.refreshPreview(id)
	if p := s.messagePreview(id); p == nil || p.Kind != kindCard {
		t.Fatalf("expected a card, got %+v", p)
	}

	thumb := "thumb.png"
	os.WriteFile(filepath.Join(dir, thumb), []byte("x"), 0o644)
	db.Exec(`UPDATE messages SET preview = ? WHERE id = ?`, `{"url":"`+page.URL+`","kind":"card","title":"Hi","image":"/api/media/`+thumb+`"}`, id)

	if _, err := s.removePreview(id, 2); err == nil {
		t.Fatal("another user must not be able to remove the card")
	}
	if _, err := s.removePreview(id, 1); err != nil {
		t.Fatal(err)
	}
	if p := s.messagePreview(id); p == nil || p.Kind != kindNone || p.URL != page.URL {
		t.Fatalf("removed card should be remembered as none, got %+v", p)
	}
	if _, err := os.Stat(filepath.Join(dir, thumb)); err == nil {
		t.Fatal("cached thumbnail should be deleted")
	}

	before := hits
	s.refreshPreview(id)
	if hits != before || s.messagePreview(id).Kind != kindNone {
		t.Fatal("the removed link must not be fetched or restored")
	}
}
