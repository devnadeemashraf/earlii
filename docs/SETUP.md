# Setup (Windows 11)

These steps take a fresh Windows 11 machine to a green `task check`. Other OSes work the same way after step 2.

## 1. Prerequisites

| Tool | Install | Why |
| :-- | :-- | :-- |
| Git for Windows (includes Git Bash) | `winget install --id Git.Git -e` | git, plus the shell Claude Code hooks run in |
| mise | `winget install jdx.mise` | installs every other pinned tool (`mise.toml`) |
| GitHub CLI | `winget install --id GitHub.cli -e`, then `gh auth login` | PRs, repo settings |
| Docker Desktop | `winget install --id Docker.DockerDesktop -e` | the local stack (`compose.yaml`: Postgres, Grafana). `task check` passes without it, but then skips the DB integration tests |
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

Then start the local stack (Docker Desktop must be running):

```powershell
task dev          # Postgres + Grafana, migrate, then the API and the web app
task check        # now also runs the DB integration tests against the compose Postgres
task dev:down     # stop the stack; data stays in Docker volumes (task dev:down -- -v wipes it)
```

Ports 5432, 3000, 4317 and 4318 must be free on 127.0.0.1. A native Postgres install on 5432 clashes: stop it first.

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

## Purging leaked files

If a private or sensitive file (for example `docs/SPEC.md`) ever reaches a pushed commit:

1. **Rotate any secret first.** A rewrite never makes a leaked credential safe again.
2. **Rewrite the affected branch** (an agent may prepare this):
   ```bash
   git branch backup/pre-purge HEAD
   FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --index-filter \
     'git rm -q --cached --ignore-unmatch <path>' -- origin/main..HEAD
   ```
   Then verify that no rewritten commit contains the path, and that the final tree is otherwise unchanged.
3. **Force-push. Only the owner does this;** the agent guards block it:
   `git push --force-with-lease=<branch>:<old-remote-sha> origin <branch>`
4. **Ask GitHub Support to purge the server side.** Old commits stay reachable by SHA in cached views and through pull requests. Open a ticket at https://support.github.com and give:
   - the owner and repo;
   - the number of affected PRs;
   - the first changed commit(s).

   Support dereferences the PRs, runs garbage collection and removes cached views. ([GitHub docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository))
5. **Clean up locally:**
   ```bash
   git branch -D backup/pre-purge
   git update-ref -d refs/original/refs/heads/<branch>
   git reflog expire --expire=now --all
   git gc --prune=now
   ```
6. **Other clones** must re-clone, or rebase (never merge) any branches cut from the old history.
