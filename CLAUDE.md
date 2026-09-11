# Ledger — Calorie & Training Log

A single-file web app (PWA) for tracking calories, exercise, hydration, and a
gamified "leveling" layer, built conversationally with Claude in chat and
deployed via GitHub → Railway.

## Architecture — read this before changing anything

- **`index.html` is the entire app.** All HTML, CSS, and JS live in this one
  file (vanilla JS, no framework, no build step, no bundler, no npm
  dependencies). Keep it that way unless explicitly asked to restructure —
  splitting it into multiple files breaks the "just open it" simplicity and
  the PWA offline caching in `sw.js`.
- **`manifest.json`** — PWA metadata (name, icons, colors). Update this if
  the app's name, theme color, or icons change.
- **`sw.js`** — service worker. Uses a **network-first** fetch strategy
  (always try network, fall back to cache only when offline) so redeploys
  reach installed devices. **Whenever you change `index.html`, bump the
  `CACHE` constant in `sw.js`** (e.g. `ledger-v2` → `ledger-v3`) so the new
  service worker is detected and old cached assets are cleared. Do not
  revert this to cache-first — that was a real bug that shipped once.
- **`icon-192.png` / `icon-512.png`** — app icons. Only regenerate these if
  explicitly asked to change the visual identity.

## Storage

The app uses `window.storage` (a Claude-artifact-specific API: `get/set/
delete/list`, all async) for persistence. Outside the Claude artifact
environment, `index.html` includes a `localStorage`-backed shim that
implements the same interface, so the app works identically standalone.
**Keep both paths working** — don't add a persistence call that only works
in one environment.

Two top-level storage keys:
- `settings` — user profile (sex, age, height, weight, units, goal,
  baseline mode, activity multiplier).
- `logs` — an object keyed by `YYYY-MM-DD` date string, each day holding
  `{ food: [...], exercise: [...], weight: number|null, water: number }`.
- `favorites` — `{ food: [...], exercise: [...] }`, the user's personal
  saved shortcuts (separate from the built-in `FOOD_DB` reference list).

## Design system

- Dark theme, ledger/accounting metaphor: food = "debit," burn = "credit,"
  daily net = "balance." Don't rename this vocabulary casually — it's a
  deliberate identity, not a placeholder.
- Color tokens are CSS custom properties defined in `:root` — `--credit`
  (green, good/deficit), `--debit` (red, bad/surplus), `--gold` (neutral
  accent), plus surface/text scale. Reuse these; don't introduce new raw
  hex colors for standard UI unless there's a real reason (the mascot's
  dynamic color is the one intentional exception — see below).
- Typography: IBM Plex Mono for numbers/data, IBM Plex Sans for UI text.

## The mascot ("Status" panel)

- Procedurally generated inline SVG (function `mascotSVG(score)`), **not**
  an image file — this is intentional so it can react live to data.
- It's a chibi anime-style character: big head, big eyes, spiky hair, a
  hoodie jacket, holding a small glowing magic spark. This design went
  through several iterations (a hooded silhouette figure, then a
  Solo-Leveling-inspired energy-blade figure) before landing here — don't
  regress to those without being asked.
- `physiqueState()` computes a continuous `score` from the user's trailing
  ~7-day average calorie balance. `mascotSVG(score)` snaps to one of 5
  discrete pose/expression bands (shredded / lean / balanced / surplus /
  overflowing) at thresholds -2.2 / -0.8 / 0.8 / 2.2, but the **aura color**
  (`physiqueColor(score)`) is continuous (green → gold → red) so it still
  feels reactive between bands.
- There's a glow filter and a radial "spotlight" gradient behind the
  character — this was added specifically to fix a real contrast bug
  (the original body color nearly matched the panel background). Don't
  remove the spotlight/rim-glow without checking contrast against
  `--surface` first.

## Gamification layer

- XP/Level and "Today's quests" are **fully derived** from `logs` on every
  render — there is no separate stored XP counter. `questsForDay(date)`
  defines the quest set (goal-aware: different quest for lose/gain/
  maintain), `xpForDay` sums completed quest rewards for one day, `totalXP`
  sums across all tracked days. Keep it derived — don't add a mutable XP
  field, it'll drift from the log data.

## AI features (only work inside Claude, not the standalone/Railway build)

- `estimateFoodCalories` / `estimateExerciseCalories` call
  `https://api.anthropic.com/v1/messages` directly from the browser with
  `model: 'claude-sonnet-4-6'` and the `web_search_20250305` tool enabled.
  This **only works when the app is rendered inside a Claude.ai artifact**
  — the API call has no auth and will fail with a normal fetch/CORS error
  anywhere else (including the Railway-hosted version). This is expected,
  not a bug — the UI already shows a graceful "couldn't estimate" fallback
  to manual entry.

## Food database

- `FOOD_DB` is a hardcoded array (~130 items) of common NYC foods with
  best-estimate calories, meant for instant offline search — not a
  verified nutrition database. If asked to add more items, keep the same
  shape (`{id, name, category, unit, cals}`) and the same honesty standard:
  ground estimates against real sources where feasible, and don't invent
  false precision.

## Deployment

- This repo (`Japanesetutor1/Ledger-app`) is connected to a Railway
  project (`ledger-app` / service `ledger-web`). **Pushing to `main`
  triggers an automatic Railway rebuild and redeploy** — no manual step
  needed. Live at the Railway-generated domain shown in that project.
- There is no CI/test suite. Before committing changes to `index.html`,
  at minimum verify the extracted `<script>` block has valid JS syntax
  (e.g. `node --check`) — a broken script tag takes down the whole app
  since it's a single file.

## Working style

This project was built conversationally, iterating on working code with
visual review at each step (screenshots, browser tests) rather than
speccing everything upfront. Prefer small, verifiable, reversible changes
over large rewrites. If a change is visual (mascot, colors, layout), it's
worth rendering it and looking at it before considering it done.

## Collaboration protocol — this repo is co-managed

This project has two other collaborators besides whoever is running this
session: the human owner, and a separate long-running Claude.ai chat
session that has full context on every design decision in this file and
reviews changes after the fact (via the GitHub API and the Railway
deployment, not by watching this session live). Work accordingly:

- **Commit small and often**, one logical change per commit, not one giant
  commit for a multi-part task. Large, unreviewable commits defeat the
  point of having a reviewer.
- **Write commit messages that explain the *why*, not just the *what***
  — the reviewing session wasn't present for this conversation and only
  sees the repo afterward.
- **Never force-push or rewrite history** on `main`. The reviewing session
  and the human both expect a normal, append-only commit log.
- **Flag it instead of doing it** for anything that contradicts a decision
  recorded elsewhere in this file (e.g. splitting `index.html` into
  multiple files, switching the service worker back to cache-first,
  changing the storage schema) — leave a clear note in the commit message
  or PR description rather than silently reversing a prior decision.
- **Don't assume silence means approval.** If a task is ambiguous or a
  design choice isn't covered in this file, make the smallest reasonable
  change and say what you assumed, rather than guessing big.
