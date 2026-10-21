package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"golang.org/x/net/html"
	"golang.org/x/net/html/charset"
)

// Link previews ("cards"): the first link in a message is fetched once, by the
// server, and the Open Graph data found in its <head> is stored with the
// message. Clients never contact the linked site, and the thumbnail is copied
// into our own media store so viewers do not leak their address to it either.

const (
	// maxPreviewBytes bounds how much of a page we will read looking for the
	// <head>. Pages are read lazily and abandoned at </head>, so a link to a
	// huge file costs at most this much, and usually nothing: non-HTML content
	// types are rejected before the body is touched.
	maxPreviewBytes = 4 << 20
	maxPreviewImage = 2 << 20
	previewTimeout  = 10 * time.Second
	maxRedirects    = 3
)

// Preview kinds. Only "card" is rendered; the rest are recorded so that we do
// not fetch the same link again.
const (
	kindCard  = "card"
	kindImage = "image" // the link is an image
	kindOther = "other" // not HTML (a download, a PDF, ...) or unreadable
	kindNone  = "none"  // HTML, but without Open Graph data
)

type Preview struct {
	URL         string `json:"url"`
	Kind        string `json:"kind"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Image       string `json:"image,omitempty"`
	Site        string `json:"site,omitempty"`
}

var (
	imageMarkdown = regexp.MustCompile(`!\[[^\]]*\]\([^)]*\)`)
	linkPattern   = regexp.MustCompile(`https?://[^\s<>]+`)
)

// firstLink returns the first http(s) URL in a message body, or "". Markdown
// image embeds (uploads, gifs) are skipped: they are already shown inline.
func firstLink(body string) string {
	loc := linkPattern.FindString(imageMarkdown.ReplaceAllString(body, " "))
	// Trailing punctuation belongs to the sentence, not the URL. A closing
	// paren is kept only when the URL has a matching opening one.
	for loc != "" {
		last := loc[len(loc)-1]
		switch {
		case strings.IndexByte(".,;:!?'\"]}*_", last) >= 0:
		case last == ')' && strings.Count(loc, ")") > strings.Count(loc, "("):
		default:
			u, err := url.Parse(loc)
			if err != nil || u.Host == "" {
				return ""
			}
			return loc
		}
		loc = loc[:len(loc)-1]
	}
	return ""
}

var errBlockedAddr = errors.New("address not allowed")

// Ranges that are not covered by the net.IP predicates but are not the public
// internet either.
var extraBlocked = func() []*net.IPNet {
	var out []*net.IPNet
	for _, c := range []string{"100.64.0.0/10", "198.18.0.0/15", "192.0.0.0/24", "240.0.0.0/4", "0.0.0.0/8"} {
		_, n, _ := net.ParseCIDR(c)
		out = append(out, n)
	}
	return out
}()

// publicIP reports whether ip is somewhere a user-supplied link may send us.
func publicIP(ip net.IP) bool {
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() {
		return false
	}
	for _, n := range extraBlocked {
		if n.Contains(ip) {
			return false
		}
	}
	return true
}

type previewer struct {
	client   *http.Client
	mediaDir string
	sem      chan struct{}
}

// newPreviewer builds the fetcher. The address check runs inside the dialer,
// on the IP actually being connected to, so it covers redirects and DNS tricks
// (rebinding) that checking the URL up front would miss. allowPrivate exists
// for tests that talk to a local server.
func newPreviewer(mediaDir string, allowPrivate bool) *previewer {
	dialer := &net.Dialer{
		Timeout: 5 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil || (!allowPrivate && !publicIP(net.ParseIP(host))) {
				return errBlockedAddr
			}
			return nil
		},
	}
	return &previewer{
		mediaDir: mediaDir,
		sem:      make(chan struct{}, 4),
		client: &http.Client{
			Timeout: previewTimeout,
			Transport: &http.Transport{
				Proxy:                  nil, // a proxy would bypass the dial check
				DialContext:            dialer.DialContext,
				TLSHandshakeTimeout:    5 * time.Second,
				ResponseHeaderTimeout:  5 * time.Second,
				MaxResponseHeaderBytes: 64 << 10,
				DisableKeepAlives:      true,
			},
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) > maxRedirects {
					return errors.New("too many redirects")
				}
				if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
					return errors.New("bad redirect scheme")
				}
				return nil
			},
		},
	}
}

func (p *previewer) get(ctx context.Context, rawURL, accept string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; irvc-link-preview)")
	req.Header.Set("Accept", accept)
	req.Header.Set("Accept-Language", "en")
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		resp.Body.Close()
		return nil, errors.New("status " + resp.Status)
	}
	return resp, nil
}

// fetch builds the preview for link. It returns nil only when the link could
// not be fetched at all, so a transient failure is retried on the next edit.
func (p *previewer) fetch(ctx context.Context, link string) *Preview {
	resp, err := p.get(ctx, link, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	out := &Preview{URL: link, Kind: kindOther}

	ctype := resp.Header.Get("Content-Type")
	media, _, _ := mime.ParseMediaType(ctype)
	switch {
	case strings.HasPrefix(media, "image/"):
		out.Kind = kindImage
		return out
	case media != "text/html" && media != "application/xhtml+xml":
		return out
	}

	og := parseOpenGraph(io.LimitReader(resp.Body, maxPreviewBytes), ctype)
	if og["title"] == "" && og["description"] == "" && og["image"] == "" {
		out.Kind = kindNone
		return out
	}
	out.Kind = kindCard
	out.Title = clip(og["title"], 200)
	out.Description = clip(og["description"], 300)
	out.Site = clip(og["site_name"], 80)
	if img := og["image"]; img != "" && resp.Request != nil {
		if ref, err := resp.Request.URL.Parse(img); err == nil && (ref.Scheme == "http" || ref.Scheme == "https") {
			out.Image = p.cacheImage(ctx, ref.String())
		}
	}
	return out
}

// parseOpenGraph reads og:* meta tags from the document head, stopping at
// </head> or <body> (or the end of r) rather than parsing the whole page.
func parseOpenGraph(r io.Reader, contentType string) map[string]string {
	og := map[string]string{}
	if cr, err := charset.NewReader(r, contentType); err == nil {
		r = cr
	}
	z := html.NewTokenizer(r)
	for {
		switch z.Next() {
		case html.ErrorToken:
			return og
		case html.EndTagToken:
			if name, _ := z.TagName(); string(name) == "head" {
				return og
			}
		case html.StartTagToken, html.SelfClosingTagToken:
			name, hasAttr := z.TagName()
			switch string(name) {
			case "body":
				return og
			case "meta":
				if !hasAttr {
					continue
				}
				var prop, content string
				for {
					k, v, more := z.TagAttr()
					switch string(k) {
					case "property", "name":
						if prop == "" {
							prop = strings.ToLower(string(v))
						}
					case "content":
						content = string(v)
					}
					if !more {
						break
					}
				}
				if key, ok := strings.CutPrefix(prop, "og:"); ok && og[key] == "" {
					og[key] = cleanText(content)
				}
			}
		}
	}
}

var entity = regexp.MustCompile(`&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);`)

// cleanText turns a meta tag value into plain text for display. The tokenizer
// has already decoded the attribute once (so &amp; is & and &#8217; is ’), but
// plenty of sites encode twice (&amp;amp;), which would show up as a literal
// "&amp;" in the card. So: decode once more if entities remain, drop control
// characters and collapse whitespace. The result is plain text, never HTML;
// the client renders it as a text node, so a title containing "<b>" displays as
// those characters rather than being interpreted.
func cleanText(s string) string {
	s = strings.ToValidUTF8(s, "")
	if entity.MatchString(s) {
		s = html.UnescapeString(s)
	}
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && !unicode.IsSpace(r) {
			return -1
		}
		return r
	}, s)
	return strings.Join(strings.Fields(s), " ")
}

func clip(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return strings.TrimSpace(string(r[:n-1])) + "…"
}

// cacheImage downloads a preview thumbnail into the media store and returns
// its local URL, or "" if it is not a small raster image.
func (p *previewer) cacheImage(ctx context.Context, src string) string {
	resp, err := p.get(ctx, src, "image/*")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxPreviewImage+1))
	if err != nil || len(data) > maxPreviewImage || len(data) == 0 {
		return ""
	}
	ct := http.DetectContentType(data)
	ext, ok := mediaExt[ct]
	if !ok || !strings.HasPrefix(ct, "image/") {
		return ""
	}
	name := randToken() + ext
	if err := os.WriteFile(filepath.Join(p.mediaDir, name), data, 0o644); err != nil {
		return ""
	}
	return "/api/media/" + name
}

func (s *Server) messagePreview(msgID int64) *Preview {
	var raw sql.NullString
	if s.db.QueryRow(`SELECT preview FROM messages WHERE id = ?`, msgID).Scan(&raw) != nil {
		return nil
	}
	return decodePreview(raw.String)
}

func decodePreview(raw string) *Preview {
	if raw == "" {
		return nil
	}
	var p Preview
	if json.Unmarshal([]byte(raw), &p) != nil {
		return nil
	}
	return &p
}

// refreshPreview brings a message's stored preview in line with its current
// body. It runs in the background after a message is sent or edited, and tells
// clients (as an edit event) only when a card appears or goes away.
func (s *Server) refreshPreview(msgID int64) {
	s.previews.sem <- struct{}{}
	defer func() { <-s.previews.sem }()

	var body string
	var raw sql.NullString
	var channelID int64
	if s.db.QueryRow(`SELECT body, preview, channel_id FROM messages WHERE id = ?`, msgID).Scan(&body, &raw, &channelID) != nil {
		return
	}
	old := decodePreview(raw.String)
	link := firstLink(body)

	var next *Preview
	if link != "" {
		if old != nil && old.URL == link {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), previewTimeout)
		defer cancel()
		if next = s.previews.fetch(ctx, link); next == nil {
			return
		}
	}

	stored := ""
	if next != nil {
		b, _ := json.Marshal(next)
		stored = string(b)
	}
	// Only write if the preview is still what we started from: a removal (or
	// another refresh) that landed while we were fetching wins.
	res, err := s.db.Exec(
		`UPDATE messages SET preview = NULLIF(?, '') WHERE id = ? AND COALESCE(preview, '') = ?`,
		stored, msgID, raw.String,
	)
	if err != nil {
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return
	}
	if (old != nil && old.Kind == kindCard) || (next != nil && next.Kind == kindCard) {
		s.broadcastMessage(msgID, channelID)
	}
}

// broadcastMessage re-reads a message and sends it to the channel's audience as
// an edit, so clients replace their copy.
func (s *Server) broadcastMessage(msgID, channelID int64) {
	if m, chType, chName, ok := s.loadMessage(msgID, channelID); ok {
		s.notifyChannel(chType, chName, event{Type: "message_edit", Message: &m})
	}
}

// loadMessage reads a message as clients see it, plus its channel's type and
// name for routing.
func (s *Server) loadMessage(msgID, channelID int64) (m Message, chType, chName string, ok bool) {
	var raw sql.NullString
	err := s.db.QueryRow(
		`SELECT m.id, m.channel_id, m.user_id, u.username, m.body, m.created_at, COALESCE(m.edited_at, 0), m.preview
		 FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?`, msgID,
	).Scan(&m.ID, &m.ChannelID, &m.UserID, &m.Username, &m.Body, &m.CreatedAt, &m.EditedAt, &raw)
	if err != nil {
		return m, "", "", false
	}
	m.Preview = decodePreview(raw.String)
	m.Reactions = s.messageReactions(m.ID)
	s.db.QueryRow(`SELECT type, name FROM channels WHERE id = ?`, channelID).Scan(&chType, &chName)
	return m, chType, chName, true
}

var errNoPreview = errors.New("no preview")

// removePreview deletes the card from a message its author owns. The link is
// remembered as "none" so the same link is not fetched again on a later edit,
// and the cached thumbnail is deleted along with it. It returns the message's
// channel for notification.
func (s *Server) removePreview(msgID, userID int64) (channelID int64, err error) {
	var raw sql.NullString
	if err := s.db.QueryRow(
		`SELECT channel_id, preview FROM messages WHERE id = ? AND user_id = ?`, msgID, userID,
	).Scan(&channelID, &raw); err != nil {
		return 0, err
	}
	old := decodePreview(raw.String)
	if old == nil || old.Kind != kindCard {
		return channelID, errNoPreview
	}
	b, _ := json.Marshal(Preview{URL: old.URL, Kind: kindNone})
	if _, err := s.db.Exec(`UPDATE messages SET preview = ? WHERE id = ?`, string(b), msgID); err != nil {
		return 0, err
	}
	if name, ok := strings.CutPrefix(old.Image, "/api/media/"); ok && mediaName.MatchString(name) {
		os.Remove(filepath.Join(s.cfg.MediaDir, name))
	}
	return channelID, nil
}

func (s *Server) handleDeletePreview(c *gin.Context) {
	msgID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad message"})
		return
	}
	user := c.MustGet("user").(User)
	channelID, err := s.removePreview(msgID, user.ID)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		c.JSON(http.StatusNotFound, gin.H{"error": "message not found"})
		return
	case errors.Is(err, errNoPreview):
		// Already gone: nothing to do, and the caller's goal is met.
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	m, chType, chName, ok := s.loadMessage(msgID, channelID)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	s.notifyChannel(chType, chName, event{Type: "message_edit", Message: &m})
	c.JSON(http.StatusOK, m)
}
