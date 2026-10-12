package main

import (
	"encoding/base64"
	"testing"
)

// randToken backs --gen-secret, so it must never repeat and must carry
// the full 32 bytes of entropy.
func TestRandTokenUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		tok := randToken()
		if seen[tok] {
			t.Fatalf("duplicate token after %d calls: %s", i, tok)
		}
		seen[tok] = true

		raw, err := base64.RawURLEncoding.DecodeString(tok)
		if err != nil || len(raw) != 32 {
			t.Fatalf("token %q: want 32 decodable bytes, got %d (err %v)", tok, len(raw), err)
		}
	}
}
