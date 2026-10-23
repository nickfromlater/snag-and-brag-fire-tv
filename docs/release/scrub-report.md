# Public-tree scrub · 2026-10-14

**The allowed public-document scrub is complete. One lead-owned coordination section remains pending explicit owner authorization.** No game code, protocol, assets, history or private notes were rewritten by this scrub.

## Scope and method

`python3 tools/release/scrub.py --json` audits the current tree: tracked files even when ignored, visible untracked first-party files, binary path/key signatures, and an ignored `.env` filename inventory. The preparation scan covered 1,846 tracked files, 758 text files and 1,091 binary files including the new synthetic-only finale image. The final rerun scanned 772 text files and 1091 binary files, with 0 environment files. All three VPKGs were separately opened and their contents scanned before build-intermediate cleanup.

`notes/` was neither read nor touched. Git metadata/history, dependencies and generated build/cache directories are excluded from the publication scan. The scanner never emits matched values: receipts contain only paths, categories, line numbers, counts and review reasons. Credential signatures include AWS access IDs, OpenAI/GitHub/Slack tokens, JWTs, private-key headers and literal secret assignments. Contact/address patterns and private network ranges are also checked. This is a current-tree audit, not a certification of Git history or an entropy scan of every arbitrary string.

## Findings and fixes

| Finding | Result |
| --- | --- |
| Local home paths | **289 replacements across 51 text files**, primarily historical test/build receipts, gallery capture metadata and spike evidence; home prefixes become `~/` |
| Literal local account name in the worker brief | Replaced with a generic account description |
| Actual LAN address | Removed from two phone-guide examples and one historical HTTPS-check receipt; examples use localhost or a LAN placeholder |
| Private knowledge-base prerequisite | Removed from the spike brief; existing public findings remain in place |
| Owner-follow-up coordination reference in the video plan | Replaced with “the lead” |
| Keys / tokens | No credential signatures remain; an early case-insensitive false positive occurred inside embedded WOFF2 bytes in the mockup, so token matching now uses the actual case-sensitive formats and boundaries |
| `.env` files | None in the first-party source inventory; `.env` and `.env.*` remain gitignored |
| Telephone numbers / street addresses | No pattern matches |
| Private network hostnames | No actual private hostname remains in editable public documents |

Exact edited paths and replacement counts: [scrub-changes.json](scrub-changes.json). Current locations/reasons for all reviewed or pending hits: [scrub-findings.json](scrub-findings.json). Historical receipts retain their results and dates; only identifying paths/origins are redacted, so a `~/` path in a receipt is a publication substitute, not a verbatim original command.

## Reviewed residuals

- **Font copyright notices:** Lilita One's public author contact remains in the five tracked OFL files, plus the generated native notice copies. Every source/generated font copy retains its source notice; stripping an author's attribution would be incorrect.
- **Dependency metadata:** lockfile package specifiers include upstream author emails. These are public package metadata, not project-owner contact details.
- **Synthetic error fixtures:** the release-tool test Git identity uses reserved `example.invalid`; `relay/test/services.test.ts` contains a deliberately invalid credential URL using the reserved `example.com` domain. It tests rejection and contains no real credential.
- **Upstream MediaPipe assets:** unchanged loaders contain a virtual filesystem home; WASM binaries contain the upstream builder's path. They are not this project's local paths and remain byte-identical to the pinned vendored runtime. Altering loader/binary bytes would change third-party runtime assets.
- **Policy/search vocabulary:** the append-only public-repo policy in `DECISIONS.md` and scrub search instructions in `docs/workers/release-prep.md` use the requested search terms as rules, without private operational details.
- **Compressed image false positive:** a short word matches compressed bytes in `docs/review/voice-wav/web-lobby-speaking.png`. Its PNG has no textual metadata chunks; the bytes are left intact. Other binary matches still require review.
- **Audit source:** the scanner's own regex definitions necessarily contain search terms.

## Protected-file exception

`CLAUDE.md:40–45` contains the owner-coordination section. COMMON.md explicitly says “never edit … CLAUDE.md”; the release brief does not explicitly assign this file as it assigns README.md. A concrete minimal replacement was requested from the owner while all independent work continued. Until that authorization arrives, this file stays unchanged and the scanner intentionally returns a nonzero review status for it. **The lead must resolve this one item before calling the public-tree scrub clean.**

`STATUS.md`, `TESTING.md`, `BRIEF.md` and `FRICTION.md` were not edited. `DECISIONS.md` remains append-only and unchanged. The README edit follows this worker's explicit release-prep assignment.

## Recheck

```sh
python3 tools/release/scrub.py
python3 tools/release/scrub.py --json
```

The `.env` inventory also checks ignored first-party source directories. No secrets or player-media bytes are written by these commands. Review the numeric findings before publication; the final root/build receipts and scope limits are in [verification.md](verification.md).
