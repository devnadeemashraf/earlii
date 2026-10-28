module github.com/devnadeemashraf/earlii/backend

go 1.27.3

require (
	connectrpc.com/connect/v2 v2.0.2
	github.com/jackc/pgx/v5 v5.11.0
	github.com/pressly/goose/v3 v3.29.0
	github.com/riverqueue/river v0.50.0
	github.com/riverqueue/river/riverdriver/riverpgxv5 v0.50.0
	golang.org/x/sync v0.24.0
	google.golang.org/protobuf v1.36.12
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.3 // indirect
	github.com/mfridman/interpolate v0.0.2 // indirect
	github.com/riverqueue/river/riverdriver v0.50.0 // indirect
	github.com/riverqueue/river/rivershared v0.50.0 // indirect
	github.com/riverqueue/river/rivertype v0.50.0 // indirect
	github.com/sethvargo/go-retry v0.5.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	golang.org/x/text v0.43.0 // indirect
)

tool (
	connectrpc.com/connect/v2/cmd/protoc-gen-connect-go
	google.golang.org/protobuf/cmd/protoc-gen-go
)
