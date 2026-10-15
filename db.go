package main

import (
	"database/sql"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

type User struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	PassHash  string `json:"-"`
	CreatedAt int64  `json:"createdAt"`
}

type Channel struct {
	ID       int64  `json:"id"`
	Type     string `json:"type"`
	Name     string `json:"name"`
	Position int    `json:"position"`
}

type Message struct {
	ID        int64  `json:"id"`
	ChannelID int64  `json:"channelId"`
	UserID    int64  `json:"userId"`
	Username  string `json:"username"`
	Body      string `json:"body"`
	CreatedAt int64  `json:"createdAt"`
	EditedAt  int64  `json:"editedAt,omitempty"`
}

func OpenDB(path string) *sql.DB {
	dsn := path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	if err := db.Ping(); err != nil {
		log.Fatalf("ping db: %v", err)
	}
	migrate(db)
	return db
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	username   TEXT NOT NULL UNIQUE,
	pass_hash  TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
	token      TEXT PRIMARY KEY,
	created_by INTEGER,
	expires_at INTEGER NOT NULL,
	used_by    INTEGER,
	used_at    INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
	id         TEXT PRIMARY KEY,
	user_id    INTEGER NOT NULL,
	expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channels (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	type       TEXT NOT NULL,
	name       TEXT NOT NULL,
	position   INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	channel_id INTEGER NOT NULL,
	user_id    INTEGER NOT NULL,
	body       TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	edited_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);
`

func migrate(db *sql.DB) {
	if _, err := db.Exec(schema); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	db.Exec(`ALTER TABLE messages ADD COLUMN edited_at INTEGER`)
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM channels`).Scan(&n); err != nil {
		log.Fatalf("count channels: %v", err)
	}
	if n > 0 {
		return
	}
	now := time.Now().Unix()
	seed := []struct {
		kind, name string
		pos        int
	}{
		{"text", "general", 0},
		{"voice", "general", 1},
	}
	for _, c := range seed {
		if _, err := db.Exec(
			`INSERT INTO channels (type, name, position, created_at) VALUES (?, ?, ?, ?)`,
			c.kind, c.name, c.pos, now,
		); err != nil {
			log.Fatalf("seed channels: %v", err)
		}
	}
}
