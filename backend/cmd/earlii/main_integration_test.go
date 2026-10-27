//go:build integration

package main

import (
	"bytes"
	"net/http"
	"strings"
	"testing"

	"github.com/devnadeemashraf/earlii/backend/internal/postgres/pgtest"
)

// The deploy order end to end: migrate exits 0, then the API reports ready.
func TestRunMigrateThenServeReady(t *testing.T) {
	db := "EARLII_DATABASE_URL=" + pgtest.NewDatabase(t)

	for range 2 { // the second run is the no-op every later deploy does
		var stdout, stderr bytes.Buffer
		if code := run(t.Context(), []string{"migrate"}, []string{"EARLII_ENV=dev", db}, &stdout, &stderr); code != 0 {
			t.Fatalf("migrate exit code = %d, want 0; logs: %s %s", code, stdout.String(), stderr.String())
		}
		if !strings.Contains(stdout.String(), `"msg":"migrated"`) {
			t.Fatalf("no migrated line in %s", stdout.String())
		}
	}

	env := []string{"EARLII_ENV=dev", db, "EARLII_HTTP_ADDR=127.0.0.1:0"}
	p := startRun(t, "api", env...)
	code, body := get(t, "http://"+p.addr+"/readyz")
	if code != http.StatusOK {
		t.Fatalf("/readyz = %d %s, want 200", code, body)
	}
	if want := `{"status":"ok","checks":{"postgres":"ok"}}`; strings.TrimSpace(body) != want {
		t.Fatalf("/readyz body = %s, want %s", body, want)
	}
	p.cancel()
	if code := p.wait(t); code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
}
