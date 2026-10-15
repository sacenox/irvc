package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

const gifLimit = 6

type gif struct {
	URL     string `json:"url"`
	Preview string `json:"preview"`
}

func (s *Server) handleGifs(c *gin.Context) {
	if s.cfg.GiphyKey == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "gifs disabled"})
		return
	}
	query := c.Query("q")
	endpoint := "https://api.giphy.com/v1/gifs/trending"
	if query != "" {
		endpoint = "https://api.giphy.com/v1/gifs/search"
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "giphy"})
		return
	}
	params := u.Query()
	params.Set("api_key", s.cfg.GiphyKey)
	params.Set("limit", strconv.Itoa(gifLimit))
	params.Set("rating", "pg-13")
	if query != "" {
		params.Set("q", query)
	}
	u.RawQuery = params.Encode()

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(u.String())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "giphy"})
		return
	}
	defer resp.Body.Close()
	var body struct {
		Data []struct {
			Images struct {
				Original    struct{ URL string } `json:"original"`
				FixedHeight struct{ URL string } `json:"fixed_height"`
			} `json:"images"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "giphy"})
		return
	}
	gifs := make([]gif, 0, len(body.Data))
	for _, g := range body.Data {
		gifs = append(gifs, gif{URL: g.Images.Original.URL, Preview: g.Images.FixedHeight.URL})
	}
	c.JSON(http.StatusOK, gin.H{"gifs": gifs})
}
