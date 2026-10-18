package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthRejectsMissingAndWrongToken(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	handler := auth("0123456789abcdef0123456789abcdef", next)
	for _, authorization := range []string{"", "Bearer wrong", "0123456789abcdef0123456789abcdef"} {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
		req.Header.Set("Authorization", authorization)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("authorization %q: expected 401, got %d", authorization, rec.Code)
		}
	}
}

func TestAuthAllowsCorrectBearerToken(t *testing.T) {
	token := "0123456789abcdef0123456789abcdef"
	handler := auth(token, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/v1/jobs", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}
}

func TestAuthRejectsUnsupportedMethod(t *testing.T) {
	handler := auth("0123456789abcdef0123456789abcdef", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodPut, "/api/v1/jobs", nil)
	req.Header.Set("Authorization", "Bearer 0123456789abcdef0123456789abcdef")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}
