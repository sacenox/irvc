package main

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestFirstLink(t *testing.T) {
	cases := map[string]string{
		"look https://example.com/a?b=1.":                    "https://example.com/a?b=1",
		"(see https://example.com/x)":                        "https://example.com/x",
		"https://en.wikipedia.org/wiki/Go_(language) neat":   "https://en.wikipedia.org/wiki/Go_(language)",
		"![gif](https://media.giphy.com/a.gif)\nno link":     "",
		"![gif](https://x.test/a.gif) then http://b.test/ok": "http://b.test/ok",
		"first https://one.test second https://two.test":     "https://one.test",
		"just text, ftp://nope.test":                         "",
	}
	for in, want := range cases {
		if got := firstLink(in); got != want {
			t.Errorf("firstLink(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPublicIP(t *testing.T) {
	for ip, want := range map[string]bool{
		"8.8.8.8": true, "2606:4700::1111": true,
		"127.0.0.1": false, "::1": false, "10.1.2.3": false, "192.168.0.9": false,
		"172.16.5.5": false, "169.254.169.254": false, "100.64.0.1": false,
		"0.0.0.0": false, "fe80::1": false, "fd00::1": false, "::ffff:127.0.0.1": false,
	} {
		if got := publicIP(net.ParseIP(ip)); got != want {
			t.Errorf("publicIP(%s) = %v, want %v", ip, got, want)
		}
	}
}

func TestPreviewFetch(t *testing.T) {
	png := []byte("\x89PNG\r\n\x1a\n" + strings.Repeat("x", 64))
	mux := http.NewServeMux()
	mux.HandleFunc("/page", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<html><head><title>ignored</title>
			<meta property="og:title" content="  Hello   World ">
			<meta property="og:description" content="A &amp; B">
			<meta name="og:site_name" content="Example">
			<meta property="og:image" content="/pic.png">
			</head><body><meta property="og:title" content="late"></body></html>`))
	})
	mux.HandleFunc("/pic.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write(png)
	})
	mux.HandleFunc("/plain", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<html><head><title>no og</title></head><body>hi</body></html>`))
	})
	mux.HandleFunc("/file", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/zip")
		w.Write([]byte("PK"))
	})
	mux.HandleFunc("/huge", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html><head>"))
		// An endless head with no og tags: reading must stop at the cap.
		junk := []byte(strings.Repeat("<!-- x -->", 1000))
		for {
			if _, err := w.Write(junk); err != nil {
				return
			}
		}
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	dir := t.TempDir()
	p := newPreviewer(dir, true)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	card := p.fetch(ctx, srv.URL+"/page")
	if card == nil || card.Kind != kindCard || card.Title != "Hello World" ||
		card.Description != "A & B" || card.Site != "Example" {
		t.Fatalf("bad card: %+v", card)
	}
	if !strings.HasPrefix(card.Image, "/api/media/") || !strings.HasSuffix(card.Image, ".png") {
		t.Fatalf("thumbnail should be cached locally, got %q", card.Image)
	}
	if _, err := os.Stat(dir + "/" + strings.TrimPrefix(card.Image, "/api/media/")); err != nil {
		t.Fatalf("cached image missing: %v", err)
	}

	for path, kind := range map[string]string{"/pic.png": kindImage, "/file": kindOther, "/plain": kindNone, "/huge": kindNone} {
		if got := p.fetch(ctx, srv.URL+path); got == nil || got.Kind != kind {
			t.Errorf("%s: got %+v, want kind %s", path, got, kind)
		}
	}

	if got := newPreviewer(dir, false).fetch(ctx, srv.URL+"/page"); got != nil {
		t.Errorf("loopback must be blocked by default, got %+v", got)
	}
}

// Meta values are decoded to plain text: single and double encoded entities
// both come out as the characters they stand for, and markup stays literal.
func TestParseOpenGraphEntities(t *testing.T) {
	doc := `<head>
		<meta property="og:title" content="Tom &amp;amp; Jerry &#8217;s &quot;best&quot;">
		<meta property="og:description" content="1 &lt; 2 &amp;&amp; &lt;b&gt;bold&lt;/b&gt;">
		<meta property="og:site_name" content="Plain &amp; simple">
		<meta property="og:image" content="a&#0;b&#7;c">
		</head>`
	og := parseOpenGraph(strings.NewReader(doc), "text/html; charset=utf-8")
	for key, want := range map[string]string{
		"title":       `Tom & Jerry ’s "best"`,
		"description": "1 < 2 && <b>bold</b>",
		"site_name":   "Plain & simple",
	} {
		if og[key] != want {
			t.Errorf("og:%s = %q, want %q", key, og[key], want)
		}
	}
	if strings.ContainsAny(og["image"], "\x00\x07") {
		t.Errorf("control characters survived: %q", og["image"])
	}
}
