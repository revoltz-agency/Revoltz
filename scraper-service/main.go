package main

import (
	"crypto/subtle"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"
)

func main() {
	token := strings.TrimSpace(os.Getenv("SCRAPER_API_TOKEN"))
	if len(token) < 32 {
		log.Fatal("SCRAPER_API_TOKEN must be set to a random value of at least 32 characters")
	}

	// The scraper's own REST API has no authentication in web mode. Keep it on
	// loopback and expose only this bearer-token gateway on the public port.
	cmd := exec.Command("/usr/bin/google-maps-scraper", "-web", "-addr", "127.0.0.1:8080", "-data-folder", "/gmapsdata", "-c", "1", "-browser-pool-size", "1")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		log.Fatalf("start scraper: %v", err)
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_, _ = cmd.Process.Wait()
		}
	}()

	target, _ := url.Parse("http://127.0.0.1:8080")
	proxy := httputil.NewSingleHostReverseProxy(target)
	// The gateway validates the public bearer token itself. Do not forward that
	// gateway-only credential to the scraper process, which may interpret it as
	// an upstream API key and return 401.
	originalDirector := proxy.Director
	proxy.Director = func(r *http.Request) {
		originalDirector(r)
		r.Header.Del("Authorization")
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		http.Error(w, "scraper is starting or unavailable", http.StatusBadGateway)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if cmd.Process == nil || cmd.ProcessState != nil || cmd.Process.Signal(syscall.Signal(0)) != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"ok":false,"scraper":"stopped"}`))
			return
		}
		_, _ = w.Write([]byte(`{"ok":true,"scraper":"running"}`))
	})
	mux.Handle("/api/v1/scrape", auth(token, proxy))
	mux.Handle("/api/v1/jobs", auth(token, proxy))
	mux.Handle("/api/v1/jobs/", auth(token, proxy))
	server := &http.Server{
		Addr:              ":" + envOr("PORT", "10000"),
		Handler:           securityHeaders(mux),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("protected scraper gateway listening on %s", server.Addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("gateway: %v", err)
	}
}

func auth(token string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodPost && r.Method != http.MethodDelete {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		got := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		if got == r.Header.Get("Authorization") || len(got) != len(token) || subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
			http.Error(w, "scraper gateway unauthorized: check matching AgencyOS and scraper tokens", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
