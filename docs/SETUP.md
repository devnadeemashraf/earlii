# Setup (Windows 11)

These steps take a fresh Windows 11 machine to a green `task check`. Other OSes work the same way after step 2.

## 1. Prerequisites

| Tool | Install | Why |
| :-- | :-- | :-- |
| Git for Windows (includes Git Bash) | `winget install --id Git.Git -e` | git, plus the shell Claude Code hooks run in |
| mise | `winget install jdx.mise` | installs every other pinned tool (`mise.toml`) |
| GitHub CLI | `winget install --id GitHub.cli -e`, then `gh auth login` | PRs, repo settings |
| Docker Desktop | `winget install --id Docker.DockerDesktop -e` | local Postgres and observability from P0-04 (optional until then) |
| Claude Code | see https://code.claude.com/docs | the AI harness in `.claude/` |

> Check winget IDs with `winget search <name>` if an install fails. IDs occasionally change.

## 2. Activate mise in PowerShell

mise puts the pinned Go, Node, pnpm, Task and linters ahead of any global installs. Add this line to your PowerShell profile (`notepad $PROFILE`):

```powershell
(&mise activate pwsh) | Out-String | Invoke-Expression
```

Open a new terminal. If you'd rather not activate it, put mise's shims folder first on `PATH` (`%LOCALAPPDATA%\mise\shims`), or prefix commands with `mise exec --`.

## 3. Clone and set up

```powershell
git clone https://github.com/devnadeemashraf/earlii.git
cd earlii
mise trust
task setup        # mise install, pnpm install, lefthook install, doctor
task check        # must be green
```

The first `mise install` builds gopls from source and takes about 2 minutes. If `task` isn't found yet, run `mise exec -- task setup` once.

## 4. Git identity and hooks

```powershell
git config user.name  "Nadeem Ashraf"
git config user.email "dev.nadeemashraf06@gmail.com"
lefthook install   # already done by task setup
```

The hooks:

- **pre-commit:** Biome formats staged TS/JS/JSON/CSS, golangci-lint formats staged Go, and gitleaks scans staged changes.
- **commit-msg:** checks for a Conventional Commit and rejects AI-attribution trailers.
- **pre-push:** refuses any push to `main`.

## 5. Protect `main` on GitHub

The repo is **public**, so GitHub Free allows rulesets ([docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets)). After P0-01 is merged, so the `check` jobs exist, run this from Git Bash:

```bash
gh api -X POST repos/devnadeemashraf/earlii/rulesets --input - <<'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["squash"] } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "check (ubuntu-latest)" },
          { "context": "check (windows-latest)" },
          { "context": "handoff" } ] } }
  ]
}
JSON
```

You can't approve your own PR, which is why approvals are set to 0. The PR and status-check rules still force every change through CI. To edit the ruleset later, use Settings → Rules → Rulesets.

Also set, in Settings → General:

- **Allow squash merging** only, using the **PR title** as the commit message;
- **Automatically delete head branches**.

## 6. Secrets

- **None needed for Phase 0.**
- Later secrets (DB URL, OAuth client, LLM key, email key) live in a local `.env` (gitignored; agents can't read it) and in the hosting provider's secret store. A committed `.env.example` lists the names only (from P0-02).
- **Optional:** set `CONTEXT7_API_KEY` as a user environment variable to enable the Context7 docs MCP: `setx CONTEXT7_API_KEY "<key>"`.

## 7. First run with Claude Code

```powershell
cd earlii
claude
```

- At session start, the hook injects the branch, git status and `docs/POINTER.md`.
- Approve the project MCP servers when prompted. `gopls` and `playwright` are pre-enabled in `.claude/settings.json`.
- Type `/next-pr` to run the PR loop on NEXT UP.

## Troubleshooting

| Symptom | Fix |
| :-- | :-- |
| `task doctor` reports a mismatch for node/go | A global install is shadowing mise. Activate mise (step 2) or remove the global install from `PATH` |
| `lefthook` hooks don't run | `lefthook install`, then check `.git/hooks/pre-commit` mentions lefthook |
| A Claude hook error mentions `node` | Make sure `node` is on `PATH` in Git Bash (`which node`); activating mise in `~/.bashrc` helps: `eval "$(mise activate bash)"` |
| Commit rejected by commit-msg | Use `<type>(<scope>): <subject>` (at most 72 characters) and remove any AI trailer |
