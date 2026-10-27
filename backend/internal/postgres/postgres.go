// Package postgres owns the connection pool and the schema: River's
// migrations and ours, applied by the migrate mode (ADR-0005).
package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// defaultConnectTimeout bounds a connection attempt (dial, TLS and auth) when
// the URL doesn't set connect_timeout, or sets 0, which libpq reads as "wait
// forever".
const defaultConnectTimeout = 5 * time.Second

// MinServerVersion is the oldest Postgres the schema supports, as
// server_version_num. Compose and CI pin 18; uuidv7() and other 18 features
// are fair game from P1-01.
const MinServerVersion = 180000

// NewPool returns a pool for url without connecting: the first query or Ping
// does. A process can boot while the database is down and report it through
// /readyz instead of crash-looping.
//
// The URL is validated by config.Load at boot. Errors here never wrap the
// parser's, which quotes the URL.
func NewPool(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pc, err := parse(url)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	return pool, nil
}

func parse(url string) (*pgxpool.Config, error) {
	pc, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, errors.New("parse database URL: invalid (the URL is not shown, it may hold a password)")
	}
	if pc.ConnConfig.ConnectTimeout == 0 {
		pc.ConnConfig.ConnectTimeout = defaultConnectTimeout
	}
	return pc, nil
}

// CheckServerVersion fails for servers older than MinServerVersion. num is
// server_version_num, as returned by db.Queries.ServerVersionNum.
func CheckServerVersion(num int32) error {
	if num < MinServerVersion {
		return fmt.Errorf("postgres server_version_num %d is older than the minimum %d", num, MinServerVersion)
	}
	return nil
}
