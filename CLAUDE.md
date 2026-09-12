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
  baseline mode, activity multiplier, `avatarClass`, `avatarScheme`).
- `logs` — an object keyed by `YYYY-MM-DD` date string, each day holding
  `{ food: [...], exercise: [...], weight: number|null, water: number }`.
- `favorites` — `{ food: [...], exercise: [...] }`, the user's personal
  saved shortcuts (separate from the built-in `FOOD_DB` reference list).

`App.saveSettingsFromForm` rebuilds the whole `settings` object from the
baseline form fields (it doesn't merge) — any new persisted setting added
outside that form (like `avatarClass`/`avatarScheme`) **must be explicitly
carried over** in that rebuild or it gets silently wiped the next time the
user saves their baseline. This already bit the avatar picker once; check
it again if you add another standalone setting.

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

- Procedurally generated inline SVG (function
  `mascotSVG(score, classId, schemeIdx)`), **not** an image file —
  this is intentional so it can react live to data.
- **Art direction is Solo Leveling-inspired manhwa, not chibi anime.** The
  rig went: hooded silhouette → energy-blade figure → chibi anime → this
  (explicitly requested — a deliberate move *away* from the cutesy
  "character-creator" look). Leaner adult-ish proportions (~5 heads tall,
  head r=19 in a 200×220 viewBox), a long dark coat + separate flowing cape
  behind it, most of the face in shadow, thin glowing almond-slit eyes (or
  a single visor bar for the knight) as the one bright focal point, no
  mouth, no blush. Bold dark silhouettes with gradient shading and a thin
  mood-colored rim-light down the coat's open front, not flat cartoon
  fills. **Don't regress toward rounded/cutesy/bright** without being
  asked again — that's the opposite of the intended direction now.
- **Avatar classes** (`AVATAR_CLASSES` / `AVATAR_CLASS_ORDER`): the user
  picks one of 6 classes — Mage (default, hood-shadowed face + glowing
  orb), Ranger (hood + mask + bow/quiver), Knight (full helm, glowing
  visor slit, sword + shield), Demon (horns + wings + lance, visible
  skin), Dwarf (beard + axe, stouter base build, visible skin), Merrow
  (single sweeping fin + bigger eyes + no brows + trident, visible skin).
  Each class has **5 selectable color schemes** (`cdef.schemes`, palette
  fields: `skin`/`body`/`bodyDark`/`trim`/`trimHi`/`accent`) — all
  dark/moody now, not bright. Choice is stored in `settings.avatarClass` /
  `settings.avatarScheme` and picked via a click-to-open modal
  (`App.toggleAvatarPicker`) triggered by clicking the mascot itself.
  Every SVG `id` inside `mascotSVG` (gradients/filters) is suffixed with a
  per-call `uid` — this is required, not decorative: the picker renders
  several `mascotSVG()` outputs in the same DOM at once (class tiles + big
  preview), and unsuffixed ids collide across them.
- **IP note on original character designs:** original fantasy archetypes
  (a generic mage, knight, fish-humanoid, etc.) are fine. A *named,
  specifically-identifiable* copyrighted/trademarked character is not —
  even a stylized/abstracted redraw. The fish-humanoid class is called
  "Merrow" (a generic folklore term) and drawn with a single sweeping fin
  for exactly this reason: an earlier version named it after, and gave it
  the exact silhouette cues (name + 3-stacked-spike fin) of, a specific
  trademarked game creature. If asked to add more classes, keep them
  archetypal, not lifted from a specific named property.
- **Body size deliberately does NOT reflect the user's actual weight/BMI.**
  It's driven only by the power tier below (`band.power`, short-term
  calorie-trend) and a fixed per-class `bulkBase` (flavor only — e.g.
  dwarves run stouter, rangers/merrows leaner — not tied to any real body
  data). A prior version added a `bodyBulkFactor()` that computed real BMI
  from logged weight/height and multiplied it into the avatar's size on
  top of the mood-based scaling. It was removed deliberately: tying a
  gamified avatar's size to someone's actual body — permanently, regardless
  of how their week is going — risks reading as a standing judgment about
  their body rather than a reflection of their recent habits, which is a
  real wellbeing concern for an app like this one. **Do not reintroduce
  real body measurements (weight, BMI, height) as an input to the avatar's
  size or shape without being explicitly asked, and flag the concern above
  if asked.**
- **Power tier, not a body-shape slider.** `physiqueState()` computes a
  continuous `score` from the trailing ~7-day average calorie balance.
  `mascotSVG` snaps this to one of 5 named power tiers at the same
  thresholds as before (-2.2 / -0.8 / 0.8 / 2.2) — Sovereign / Ascendant /
  Awakened / Novice / Dormant (`physiqueLabel`, also used as the flavor
  copy) — and each tier changes: `band.bend` (a forward hunch, applied as
  a `rotate()` on the upper-body group only, pivoted at the shoulder line,
  so weak reads as posture rather than the whole sprite shrinking),
  `band.cape` (flare size), `band.aura` (opacity of eye-glow and the
  background aura ring), and `band.particles` (drifting ember count). The
  **aura color** (`physiqueColor(score)`) is continuous (green → gold →
  red) so it still feels reactive between tiers. This mood/aura layer
  (eye glow, aura ring, particles) is universal across all classes — only
  the mage's held item is literally the mood-colored orb; other classes
  hold a class-appropriate weapon instead, sized to roughly the avatar's
  own height (sword/bow/axe/lance/pitchfork), darkened to match, with the
  weapon's own glow accents tied to the same aura color.
- **Level-up gets a one-shot visual flourish**, not a new stored flag:
  `lastSeenLevel` (module state, not persisted) is seeded from
  `levelInfo().level` right after `loadState()`, then compared against the
  current level on every `renderStatusPanel()` call — if it went up, that
  single render adds a `level-up-flash` class to `.status-panel` (a CSS
  `box-shadow` pulse, ~1.4s, see `@keyframes levelUpFlash`) and updates
  `lastSeenLevel`. Since `render()` fully replaces the DOM every time, the
  class only ever appears on the one render where the level actually
  changed — don't try to "clear" it with a timer, there's nothing to
  clear.
- There's a glow filter (`eyeglow`) and a radial "spotlight" gradient
  behind the character — the spotlight was added specifically to fix a
  real contrast bug (the original body color nearly matched the panel
  background), and the eye-glow filter is now load-bearing for the whole
  design since the eyes are the focal point. Don't remove either without
  checking contrast against `--surface` first. Same lesson applies to any
  new class art: check it against the dark panel background before
  calling it done (the demon's horns needed a bone-tinted fix, and the
  dwarf's beard needed a highlight-toned fill, for exactly this reason —
  dark-on-dark silhouettes are easy to accidentally render invisible).

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
