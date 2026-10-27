# Legal, licensing and privacy notes

> **This is not legal advice.** These are engineering notes that flag issues so the owner can decide when a professional is needed. Items marked **⚖️ professional** should be reviewed by a qualified lawyer (India) before launch.

## 1. Project licence

- `LICENSE` is a **proprietary, all-rights-reserved** licence. Copyright is held solely by Nadeem Ashraf. No rights are granted beyond viewing.
- The repository is **public** on GitHub. GitHub's Terms of Service let other users view and fork public repositories *within GitHub*. The licence acknowledges this and grants nothing further. Public visibility means anyone can read the code, so never commit secrets, and keep anything sensitive (eval sets with user data, business numbers) out of the repo.
- **No external contributions** are accepted without written agreement. If that ever changes, use a contributor licence or assignment agreement. ⚖️ professional
- **AI-assisted code:** the owner directs all work and no AI attribution is recorded. Copyright treatment of AI-assisted output varies by jurisdiction and is still evolving. ⚖️ professional, if IP ownership ever matters commercially (fundraising, acquisition).
- Trademark "Earlii": not registered (UNVERIFIED). Search the IP India trademark registry before launch. ⚖️ professional

## 2. Dependency licences

| Component | Licence | Use | Note |
| :-- | :-- | :-- | :-- |
| mise, Task, lefthook, gitleaks, actionlint, zizmor | MIT | dev tools | no distribution |
| golangci-lint, hadolint (planned) | GPL-3.0 | dev tools only | not linked into or shipped with Earlii, so no copyleft obligation on Earlii's code |
| Biome | Apache-2.0 / MIT | dev tool | — |
| gopls | BSD-3-Clause | dev tool | — |
| River (planned) | MPL-2.0 | linked library | file-level copyleft: modifications **to River's own files** must be shared; using it is fine |
| connect-go / connect-es, buf, protobuf-es (planned) | Apache-2.0 | library / tool | keep NOTICE files if distributing binaries |
| sqlc (planned) | MIT | tool | generated code is ours |
| React, Vite, TanStack, Tailwind (planned) | MIT | library | — |

Check every new dependency's licence when adding it. **Avoid AGPL libraries linked into the product**: AGPL tools such as k6 or Renovate are fine as separate tools. If one is ever necessary, raise it here first.

## 3. Data sources and job boards

- Use only **documented public job-board APIs**, and only where the provider's terms allow it. Record each provider's terms URL, the date read and the relevant clauses here before writing its connector (P1-04, P1-05).
- **Never:** scrape LinkedIn or Naukri, or automate any platform whose terms forbid it (SPEC section 7).
- Respect robots.txt and crawl delays, identify the client with a clear user agent, and rate-limit per host (P1-03).
- Keka, Darwinbox, Zoho Recruit: excluded until their public feeds and terms are verified (D-08).
- Postings are public data, but company names and logos are trademarks. Use names factually and don't imply endorsement.

| Provider | Terms URL | Read on | Polling allowed? | Notes |
| :-- | :-- | :-- | :-- | :-- |
| Greenhouse | TBD (P1-04) | — | UNVERIFIED | — |
| Lever | TBD (P1-05) | — | UNVERIFIED | — |

## 4. Privacy: India's DPDP Act, 2023 ⚖️ professional

Earlii will process personal data (accounts, resumes, preferences, application history). Engineering obligations to design for:

- **Consent and notice:** clear purpose-specific consent at sign-up and for each new purpose (resume parsing, LinkedIn import). Consent records are stored (SPEC section N).
- **Purpose limitation and minimisation:** collect only what a feature needs. Three fields per step is also a privacy feature.
- **Data principal rights:** access/export (JSON), correction, and erasure (hard delete within 30 days, SPEC section N). Erasure must also cover backups within their rotation, logs (keep PII out entirely) and LLM provider retention.
- **Security safeguards:** encryption at rest for documents, least-privilege access, audit logs.
- **Breach plan:** detect, contain and notify within the Act's timelines (UNVERIFIED: confirm the current rules and timelines).
- **Cross-border transfer:** hosting and LLM providers may process data outside India. Check the current DPDP rules on transfers before launch.
- **Children:** the product targets working professionals. Block under-18 sign-ups (DPDP has special rules for children's data). ⚖️ professional

## 5. LLMs and user data

- **Never send resumes, drafts or other user data to a free LLM tier** (SPEC section 7). Gemini's free tier may use content to improve Google's products; the paid tier doesn't (verified 2026-10-27, see VERSIONS).
- Public postings may go to any tier. Enrichment runs on public postings only.
- Record the provider, tier and data-retention terms here before E-01 and E-02.

## 6. Money (Later) ⚖️ professional

- Razorpay checkout; GST invoicing obligations; refund policy; terms of service. Auto-renew rules apply to Pro but not to Search Season (no auto-renew).
- Campus seats may involve contracts with institutions. Students may be minors in some programmes, which is a DPDP children's-data risk.
