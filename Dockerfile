# The one Earlii image (ADR-0003, ADR-0007): a static Go binary on distroless. Every mode runs from
# it with its own command (`earlii api|worker|scheduler|migrate`); there is no default mode.
#
#   docker build --tag earlii:local .      (or: task image)
#
# .dockerignore is an allowlist: only backend's module files, non-test Go sources and migrations
# reach the build. Base images are pinned by digest; bump them with the versions in VERSIONS.
# No `# syntax=` line: the Dockerfile frontend built into the engine is used, so no unpinned
# frontend image is pulled.

# The builder runs on the host's platform and cross-compiles, so an arm64 image never runs the Go
# compiler under emulation. The Go version matches mise.toml (a test checks it).
FROM --platform=$BUILDPLATFORM golang:1.27.3-alpine@sha256:d200d2dd76b03a99b52651fd1325aff7dcd35422c35c01bac56571b0507f3deb AS build
WORKDIR /src

# Dependencies first, so this step stays cached until go.mod or go.sum changes. The module and
# build caches are BuildKit cache mounts: kept between local builds, never shipped in a layer.
COPY backend/go.mod backend/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY backend/ ./
ARG TARGETOS
ARG TARGETARCH
# Static (no cgo, so no libc), no file paths or VCS stamps in the binary (the same source gives the
# same bytes), and no symbol table or DWARF (-s -w: 20.7 MB to 14.2 MB, measured in P0-06).
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -buildvcs=false -ldflags="-s -w" -o /out/earlii ./cmd/earlii

# CA certificates (pgx verify-full in prod), tzdata, /etc/passwd with nonroot, and nothing else:
# no shell, no package manager.
FROM gcr.io/distroless/static-debian13:nonroot@sha256:18f4cc26c9ffa7f20a359298be7deadac5c607c8e03a02b8119f1a5fc2f82c99
COPY --from=build /out/earlii /earlii
# Numeric, so a runtime can verify "not root" without reading /etc/passwd.
USER 65532:65532
# EARLII_HTTP_ADDR defaults to :8080 (PORT overrides it on Render).
EXPOSE 8080
# Exec form: the binary is PID 1 and gets SIGTERM directly; it handles it (graceful drain) and
# spawns no children, so it needs no init.
ENTRYPOINT ["/earlii"]
