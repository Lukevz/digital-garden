# Chat Knowledge Base: Embeddings-Based Rearchitecture

## Context

The chat assistant at `/api/chat` currently stuffs every `.md` file under `/content/about/` into the system prompt on every request. That works at 9 files (~33KB) but is a cliff, not a slope: each new file adds to every request's token budget. With ~22 markdown files already across `/content/`, and a goal of eventually pointing the site at the user's full second brain (50–200 files in the next 12–18 months), we need a retrieval pipeline before scale becomes a forcing function.

**Goal:** Replace whole-file stuffing with hybrid pinning + semantic retrieval. Keep the `/content/about/` identity layer always-in-context (preserving today's answer quality and voice integrity); index everything else with OpenAI embeddings and pull only the relevant top-K chunks per query.

**Why now:** The user is about to add significantly more content to `/content/`. Building this once now is cheaper than retrofitting after the KB outgrows the prompt budget.

---

## Architecture Overview

```
BUILD TIME (node build/build.js):
  /content/**/*.md
    ├─ pinned files (/content/about/*)  →  copied whole into index, no embeddings
    └─ everything else                    →  parse → chunk → hash → embed → index
                                              ↓
                                       data/kb-index.json
                                       (committed to git)

REQUEST TIME (api/chat.js):
  user message
    ↓
  embed(message) → cosine vs non-pinned chunks → top-K (K=6, threshold≥0.35)
    ↓
  system prompt =
    [voice + refusal rules]
    + [all pinned files concatenated, as today]
    + [top-K retrieved chunks with [from path > heading] citations]
    ↓
  Groq (llama-3.1-8b-instant) with existing 429 retry
```

---

## Design Decisions (locked)

| Decision | Choice | Reason |
|---|---|---|
| Embedding model | OpenAI `text-embedding-3-small` (1536d) | $0.02/1M tokens; ~$0.01 to embed entire 200-note KB; mature SDK. `3-large` not worth 5× cost at this scale. |
| Pin policy | All `/content/about/*.md` always-in-context, NOT chunked or embedded. Plus `pin: true` frontmatter override for any other file. | Pinned files are identity material — voice fidelity matters more than retrieval. Don't waste cost embedding them. |
| Opt-out | `index: false` frontmatter on any file skips it entirely. | Emergency lever; no leaks if a file gets dragged into `/content/` by mistake. |
| Public boundary | **Allowlist** of `/content/` subfolders, not blocklist. New subfolders require explicit code change. | Defensive: a stray `/content/private/` folder must not get embedded silently. |
| Index storage | `data/kb-index.json` at repo root, committed. NOT served by static handler. | ~1MB today, ~15MB at 200 notes — git is fine. Predictable cold-start vs. building at deploy. Committing keeps Vercel build hermetic (no OpenAI calls at deploy time). |
| Index format | Plain JSON, not ES module | `api/chat.js` does `readFileSync + JSON.parse` on cold start (cached in module scope). Faster cold start than dynamic import for this size. |
| Chunking | Split on H1, then H2. Sub-split sections >800 tokens into ~500-token paragraph windows with 50-token overlap. Merge adjacent <100-token sections within same H1. Never split inside a code fence or markdown table. | Matches how markdown is actually structured. H1 fallback handles flat files like `bio.md` (already pinned, but pattern matters for `garden/`). |
| Token estimation | `Math.ceil(text.length / 4)` heuristic | Plenty accurate at this scale; avoids pulling in `tiktoken` (~5MB native module). |
| Hash for cache | SHA-256 of normalized body (frontmatter stripped) | Date edits don't invalidate embeddings. |
| Cosine threshold | 0.35 (hard floor) | Empirically the noise floor for `3-small`. Log scores in dev for first 20 queries; tune. |
| Top K | 6 | Sweet spot at this KB size. |
| Query embedding cache | LRU 50 in module scope | Seed questions and repeats hit cache; 100–300ms savings per repeat. |
| Dev watcher | `fs.watch('/content', { recursive: true })`, 500ms debounce | Zero new deps; macOS supports recursive natively (used elsewhere in `dev.js`). Debounce avoids embedding cost on every keystroke save. |
| Pinned-file rule | `seed-questions.md` still excluded (preserves current `api/chat.js:45` behavior) | Don't lose existing exclusion. |

---

## Allowlist (initial)

These `/content/` subfolders are indexed. New subfolders are private until explicitly added:

```
content/about/         → pinned (concatenated whole)
content/garden/        → chunked + embedded
content/case-studies/  → chunked + embedded
content/field-notes/   → chunked + embedded
content/studio/        → chunked + embedded
content/northstar/     → chunked + embedded
content/*.md           → chunked + embedded (root-level .md only; e.g. career.md)
```

Plus per-file overrides via `pin: true` (force-pin) and `index: false` (skip entirely).

---

## Files to Add / Modify

**New files:**
- `build/kb/chunk.js` — markdown → chunks (H1/H2 split, code-fence-safe, token-budget enforcement, hash per chunk)
- `build/kb/embed.js` — OpenAI client wrapper, batched (256 inputs/call), retry-on-rate-limit
- `build/kb/index.js` — orchestrator: scan allowlist → load existing index → diff hashes → embed new → write `data/kb-index.json`
- `api/kb/retrieve.js` — runtime: load index (mtime-cached), embed query (LRU-cached), cosine top-K, format `[from path > heading]` blocks
- `data/kb-index.json` — generated artifact, committed

**Modified files:**
- `api/chat.js` — replace `loadKnowledgeBase()` with hybrid (pinned + retrieved). Keep existing 429 retry, voice rules, em-dash/social-URL conventions intact. Keep fallback to current behavior if `data/kb-index.json` is missing (safe rollout).
- `build/build.js` — invoke `build/kb/index.js` after existing manifest steps.
- `build/dev.js` — add recursive `/content/` watcher (debounced 500ms), call same builder. Gate on `OPENAI_API_KEY`: if missing, log a warning and skip embedding (don't block local dev for contributors without a key). Add explicit 404 for any request path matching `data/kb-index.json` so the static handler can't serve it accidentally.
- `package.json` — add `openai` dependency.
- `.env.example` (new or update existing) — document `OPENAI_API_KEY`.
- `CLAUDE.md` — document new pipeline, allowlist policy, build commands, env vars.

**Reused (no changes):**
- `v1/js/utils/yaml.js` (`parseYAMLFrontmatter`) — used in chunker. Wrap return values with local coercion helper (`index: false` arrives as string `"false"`) rather than touching the shared parser.
- Build/manifest pattern, log style (`\x1b[32m✓\x1b[0m Rebuilt ...`), `.env.local` loader at `dev.js:22-28`.

---

## Security & Privacy

1. **Index is never served to the client.** `data/kb-index.json` lives at repo root in a directory the dev server doesn't statically serve. Add an explicit 404 in `dev.js` for paths starting with `/data/` to guarantee no future regression. Verify with `curl http://localhost:3000/data/kb-index.json` returning 404.
2. **Allowlist not blocklist** — adding a new `/content/` subfolder requires editing `build/kb/index.js`. Loud failure beats silent leak.
3. **`index: false` frontmatter** — emergency opt-out at the file level. The build script logs every skip.
4. **No private data in index file** — index contains only chunk text + metadata that's already destined to be served to chat users as context. Worst-case leak = same as worst-case chat-response leak.

---

## Migration & Rollback

- Phase A (this plan): land the build pipeline and the new retrieval path in `api/chat.js`, but keep the existing `loadKnowledgeBase()` as a fallback if `data/kb-index.json` is missing or fails to parse. This means a broken build doesn't break production chat.
- Phase B (after one week of green production): remove the fallback. Delete the dead code path.
- Rollback: if retrieval misbehaves in prod, set env var `KB_DISABLE_RETRIEVAL=1` to force the fallback path without redeploy. (Implement this env-var check as part of Phase A.)

---

## Verification

Run after implementation, before merging:

1. **Build determinism:** `node build/build.js` with `OPENAI_API_KEY` set. Re-run immediately. Second run should make zero OpenAI calls (all hashes match). Confirm via debug log line.
2. **Chunk sanity:** Print chunks for `garden/B. Atomic Habits.md` and one `case-studies/*` file. No chunk >1000 tokens, no broken code fences, no chunk <50 tokens (except whole-file-short cases). Eyeball heading paths.
3. **Pinned-file integrity:** `voice-and-tone.md` and `bio.md` appear in the system prompt **whole**, identical byte-for-byte to today's behavior. Diff against current `loadKnowledgeBase()` output.
4. **Retrieval quality:** Use `content/about/seed-questions.md` as a fixture. For each seed question, log top-6 chunks + scores in dev. ≥4 of 6 should look topically relevant. Tune threshold here if needed.
5. **Voice integrity:** 10-question manual chat test covering: (a) pinned-only topics ("how do I reach you", "what do you do"), (b) retrieval-only topics ("what did you think of Atomic Habits"), (c) out-of-scope ("what's your salary"). Compare against current prod responses qualitatively. Voice from pinned `voice-and-tone.md` must remain intact.
6. **Cold-start budget:** `console.time('kb-load')` in `api/chat.js`. First request after deploy: index load + query embed + Groq round-trip < 1.5s total. Index load alone < 300ms.
7. **Fallback path:** Delete `data/kb-index.json` locally, hit `/api/chat`. Confirm it falls back to current behavior without erroring. Confirm `KB_DISABLE_RETRIEVAL=1` does the same without deleting the file.
8. **Privacy spot-check:** `curl http://localhost:3000/data/kb-index.json` must 404. `curl http://localhost:3000/api/kb/retrieve` must 404. After Vercel deploy, repeat against prod URL.
9. **Dev watcher:** `touch content/garden/Foo.md`. Confirm rebuild fires once (not N times) after 500ms debounce. Confirm `OPENAI_API_KEY` missing → warning + skip, no error.
10. **Cost ceiling:** Log total tokens embedded per build. First full build should be <500K tokens (~$0.01). Subsequent incremental builds should embed only changed chunks.

---

## Risks (ranked)

1. **Index leaking to browser via static handler** — high impact, easy to do by accident. Mitigated by `/data/` 404 rule + verification step 8.
2. **Build-time failure on Vercel if `OPENAI_API_KEY` missing** — fail loud at build, not at runtime.
3. **Voice degradation if pinned files get chunked by mistake** — pinned files have a hard exemption from chunking; verification step 3 catches.
4. **Threshold mis-tuning** — empty retrieval is better than misleading retrieval. Default 0.35; log scores in dev; iterate before merging.
5. **Embedding cost runaway in dev** — debounce + hash-cache invalidation; verify by watching console during normal save flow.
6. **Future allowlist drift** — code review checkpoint when adding a new `/content/` subfolder.

---

## Out of Scope (explicitly deferred)

- Hybrid BM25 + embeddings fusion. The user picked embeddings-only. Add only if retrieval recall feels weak after 100+ notes.
- External vector store (pgvector, Turso + sqlite-vec, hosted vector DB). In-memory JSON works up to ~10MB index, comfortably past the 200-note ceiling.
- Re-ranking with a cross-encoder. Overkill at this scale.
- Streaming the index from S3/CDN. Not needed; static bundle ships with deployment.
- Auto-tagging or auto-summarization of chunks. Manual frontmatter is enough.
- Sync from external second-brain source (Bear/Obsidian). User confirmed `/content/` is the source of truth.

---

## Critical Files (recap)

- `api/chat.js`
- `build/build.js`
- `build/dev.js`
- `v1/js/utils/yaml.js` (read-only reuse)
- `build/kb/*` (new)
- `api/kb/retrieve.js` (new)
- `data/kb-index.json` (generated)
- `package.json`
- `CLAUDE.md`
