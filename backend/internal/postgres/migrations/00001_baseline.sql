-- Baseline: puts the schema under goose's version table. River's tables are
-- applied before this by rivermigrate (see internal/postgres/migrate.go).
-- Migrations are forward-only: never edit or delete a merged file, and never
-- write a Down section (docs/adr/0005-migrations.md).

-- +goose Up
SELECT 1;
