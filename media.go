package main

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"

	"github.com/gin-gonic/gin"
)

// Raster images and browser-playable video. SVG and HTML can carry script, so
// they are not accepted. c.File serves these with Range support, so video
// seeks and streams without extra work.
var mediaExt = map[string]string{
	"image/png":  ".png",
	"image/jpeg": ".jpg",
	"image/gif":  ".gif",
	"image/webp": ".webp",
	"video/mp4":  ".mp4",
	"video/webm": ".webm",
}

// The extension allows digits so mp4 serves; the stem is the token from upload.
var mediaName = regexp.MustCompile(`^[A-Za-z0-9_-]+\.[a-z0-9]+$`)

func (s *Server) handleUpload(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, s.cfg.MaxUpload)
	file, err := c.FormFile("file")
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{
				"error": fmt.Sprintf("file is larger than %d MB", s.cfg.MaxUpload>>20),
			})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upload"})
		return
	}
	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "open"})
		return
	}
	defer f.Close()
	head := make([]byte, 512)
	n, _ := io.ReadFull(f, head)
	ext, ok := mediaExt[http.DetectContentType(head[:n])]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported media"})
		return
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "read"})
		return
	}
	name := randToken() + ext
	dst, err := os.Create(filepath.Join(s.cfg.MediaDir, name))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "write"})
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, f); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "write"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": "/api/media/" + name})
}

func (s *Server) handleMedia(c *gin.Context) {
	name := c.Param("name")
	if !mediaName.MatchString(name) {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("X-Content-Type-Options", "nosniff")
	c.File(filepath.Join(s.cfg.MediaDir, name))
}
