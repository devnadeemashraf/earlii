# ADR-0007: The container image: static binary on distroless, an allowlisted context, no default mode

- **Status:** Accepted
- **Date:** 2026-10-28
- **Roadmap item:** P0-06
- **Deciders:** owner + agent

## Context

ADR-0003 settled on one binary and one image, with every mode as its own container (SPEC section 3 Packaging, SPEC Z). P0-06 has to deliver that image:

- at most **30 MB** (ROADMAP P0-06);
- built and scanned in CI (hadolint, Trivy);
- smoke-tested by a CI job that runs `earlii api` and hits `/healthz`.

Constraints:

- **Portability.** The image has to run under Compose today and on Render or AWS later. The host (D-04) is still open, and nothing here may depend on it.
- **Prod TLS.** Prod demands `sslmode=verify-full` (ADR-0005), so the image needs CA certificates.
- **Private files.** `docs/SPEC.md` and `docs/learning/` are private: they must never reach a build context, which a daemon or a remote builder could cache.
- **Measured inputs:**
  - the stripped linux/amd64 binary is 14.2 MB, against 20.7 MB unstripped;
  - `docker image inspect`'s `Size` means different things on the classic and the containerd image stores (VERSIONS, Verified facts).

## Options considered

### Runtime base

#### Option A: `scratch`, plus copied CA certificates and a passwd line
- Pros: the smallest possible image (the binary, plus about 0.3 MB).
- Cons: we would curate the certificates, `/etc/passwd`, `/tmp` and tzdata ourselves, and they would drift.

#### Option B: `gcr.io/distroless/static-debian13:nonroot`
- Pros:
  - it already holds CA certificates, tzdata, a `nonroot` user (65532) and `/etc/nsswitch.conf`;
  - it has no shell and no package manager;
  - it is maintained and rebuilt by Google, and Trivy can scan its Debian packages.
- Cons: a few MB more than scratch.

#### Option C: `alpine`
- Pros: a shell, which helps when debugging.
- Cons:
  - the shell and `apk` are attack surface in every container;
  - musl (irrelevant for a static binary);
  - more packages that Trivy will flag.

### Healthcheck inside the image
- **`HEALTHCHECK CMD curl`:** needs curl and a shell, which breaks Option B.
- **An `earlii probe` mode:** adds code and a test.
- **None (chosen):** Render, Kubernetes and ECS probe `/healthz` over HTTP themselves, and Compose orders startup on the migrate container finishing. Add a probe mode if something ever needs a container-level health status.

## Decision

1. **Base: Option B**, pinned by tag and digest. The builder is `golang:<mise go>-alpine`, also pinned by digest; a test checks its Go version against `mise.toml`.
2. **Build:**
   - flags: `CGO_ENABLED=0 -trimpath -buildvcs=false -ldflags="-s -w"`;
   - the builder runs on `$BUILDPLATFORM` and cross-compiles to `$TARGETOS/$TARGETARCH`, so a multi-arch build never emulates the compiler;
   - BuildKit cache mounts hold the module and build caches;
   - there is no `# syntax=` line, so no unpinned frontend image is pulled.
3. **Context: an allowlist** `.dockerignore`. It ignores everything, then re-includes `backend/go.mod`, `go.sum`, non-test `.go` files and the embedded migrations, and drops test files last. `task test:image` exports the real context through a scratch build and fails on any other file.
4. **Runtime contract:**
   - `USER 65532:65532`: numeric, so a runtime can verify it without reading `/etc/passwd`;
   - `ENTRYPOINT ["/earlii"]` in exec form, so the binary is PID 1 and handles SIGTERM itself; it starts no children, so it needs no init;
   - **no `CMD`**: a container started without a mode exits 2 with the usage line instead of silently becoming an API;
   - no config baked into the image.
5. **The budget is measured on the flattened root filesystem** (the bytes of `docker export`), which reads the same on either image store. It is 17.56 MB today.
6. **Compose:** `migrate`, `api`, `worker` and `scheduler` share one `x-app` block (image, dev config, `read_only`, `cap_drop: [ALL]`, `no-new-privileges`) under the `app` profile.
   - `migrate` runs once, and the serving modes wait until it completes successfully.
   - Only `api` is published, on `127.0.0.1:8080`.
   - `task dev:db` still starts only the infrastructure.
7. **CI:**
   - `task check` includes `lint:docker` (hadolint) and `test:image`;
   - `test:image` skips without a Linux Docker daemon (the Windows runner) and is required on Linux (`EARLII_REQUIRE_DOCKER=1`);
   - the Linux job then runs `task image:scan`: Trivy, fixable HIGH and CRITICAL findings fail it.
   - hadolint and Trivy are pinned in `mise.toml`, not run through third-party actions.

## Consequences

- Positive:
  - one 17.56 MB image, with no shell, running as non-root;
  - every mode is smoke-tested in the hardened configuration it will run in;
  - private files can't leak into a build;
  - the same image runs under Compose, Render or AWS.
- Negative / accepted trade-offs:
  - no shell for `docker exec` debugging. Use `docker run --entrypoint` with a debug image, or the `:debug` distroless variant locally.
  - Base-image bumps are manual (R-01) until Dependabot's handling of digest-pinned `FROM` lines is verified (VERSIONS UNVERIFIED).
  - `task check` builds the image locally whenever Docker is running (about 15 s when cached).
  - The Trivy scan covers the Debian packages and the Go stdlib and modules in the binary, on every PR. Once a fix is published for a HIGH or CRITICAL CVE, every PR fails until the base, Go or module is bumped (R-01 or a BP item). That is accepted, so a vulnerable image never merges. Trivy downloads its database each run, from mirror.gcr.io with ghcr.io as a fallback (`trivy image --help`, 0.76.1); no cache action was added.
  - Compose builds `earlii:local` once per app service (the same BuildKit graph, tagged four times), which costs almost nothing.
- Revisit if:
  - the binary needs cgo (then use `distroless/base`);
  - a platform requires a container-level healthcheck;
  - the image nears the budget.

## Verification

- `scripts/check-image.mjs` (`task test:image`) checks:
  - the context allowlist, the image config and the size budget;
  - no shell, and usage exit 2 without a mode;
  - `migrate` exits 1 with no database;
  - api, worker and scheduler each serve `/healthz` 200 and `/readyz` 503, give the right Connect answer (200 or 404), log JSON, and exit 0 on `docker stop`.
- `scripts/test/image.test.mjs` checks the rules, the Dockerfile, `.dockerignore`, compose, the tasks and CI.
- `task image:scan` runs Trivy.
