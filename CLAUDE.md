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

## Profiles / PIN lock

Multiple people can use this app on one device, gated by a username + 4-digit
PIN. Read this before touching storage, `render()`, or anything under
`auth*`.

- **Not real account security — be honest about that if asked.** There's no
  server, so the PIN only stops casual access (someone picking up the
  phone), not anyone who opens the browser's storage inspector. The PIN is
  still hashed (SHA-256 + a random per-profile salt, via Web Crypto — see
  `hashPin`/`sha256Hex`/`randomSalt`), never stored in plaintext, as good
  practice regardless. "Forgot PIN" has **no real recovery barrier** by
  design (confirm the warning dialog, set a new PIN, done) — that's
  intentional given there's no email/account to verify against, not a bug.
- **Flow is username-first, always** — typing a name and hitting Continue
  either routes straight to PIN verification (existing username, matched
  case-insensitively) or straight to PIN creation (unrecognized username),
  with no separate "sign up" vs "log in" choice for the user to make. A row
  of tappable "quick switch" tiles (initial-letter avatar) sits below the
  input as a shortcut for known profiles, but typing is the primary path —
  don't reintroduce a tile-only picker as the main gate screen; that was
  tried and explicitly replaced.
- **Storage is namespaced per profile.** `settings`/`logs`/`favorites`
  became `settings:<id>`/`logs:<id>`/`favorites:<id>` (see `loadState`,
  `saveSettings`, `saveLogs`, `saveFavorites` — they all key off the
  module-level `activeProfileId`). The `profiles` key (flat, not
  namespaced) holds the array of `{id, username, salt, pinHash,
  createdAt}`. `activeProfileId` is **in-memory only, never persisted** —
  every fresh page load re-locks and shows the gate, by design (it's a PIN
  *lock*, not a remembered login).
- **Migration for data saved before profiles existed:** `init()` checks for
  legacy flat `settings`/`logs` keys when `profiles` is empty
  (`checkLegacyMigration`) and, if found, shows a one-time explanatory
  screen instead of the normal create/login copy (`authIsMigration`
  flag). The first profile created in that state inherits the legacy data
  (`finishProfileCreation` copies `legacyStash` into the new namespaced
  keys) — legacy flat keys are left in place afterward, unused but
  harmless, rather than deleted, so there's zero risk of data loss from a
  bug in the migration path itself.
- **`render()` gates on `activeProfileId`** at the very top — no profile
  unlocked means `renderProfileGate()` replaces the entire app, full stop.
  Every other render function assumes a profile is already active; don't
  call them from gate-related code.
- Deleting a profile (`App.deleteProfile`) removes its three namespaced
  storage keys (and IndexedDB mirror copies) along with its `profiles`
  entry — this is real, immediate, irreversible deletion behind one
  `confirm()`, not a soft-delete.
- If asked to add more profile fields later (email, avatar preview on the
  gate screen, etc.), remember the gate screen renders *before* that
  profile's `settings` are loaded — anything shown there needs to live on
  the `profiles` record itself, denormalized, kept in sync on change.

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
- The base rig is a chibi anime-style character: big head, big eyes, an
  animated blink/idle-bob, holding a small item in its raised hand. This
  design went through several iterations (a hooded silhouette figure, then
  a Solo-Leveling-inspired energy-blade figure) before landing here — don't
  regress to those without being asked.
- **Avatar classes** (`AVATAR_CLASSES` / `AVATAR_CLASS_ORDER`): the user
  picks one of 6 classes — Mage (default, spiky hair + hoodie + glowing
  orb), Ranger (hair + bow + quiver), Knight (helmet + pauldrons + sword),
  Demon (horns + wings + tail + flame), Dwarf (beard + belt + axe, stouter
  base build), Merrow (fin crest + big eyes + no brows + trident). Each
  class has **5 selectable color schemes** (`cdef.schemes`, palette fields:
  `skin`/`body`/`bodyDark`/`trim`/`trimHi`/`accent`). Choice is stored in
  `settings.avatarClass` / `settings.avatarScheme` and picked via a
  click-to-open modal (`App.toggleAvatarPicker`) triggered by clicking the
  mascot itself. Every SVG `id` inside `mascotSVG` (gradients/filters) is
  suffixed with a per-call `uid` — this is required, not decorative: the
  picker renders several `mascotSVG()` outputs in the same DOM at once
  (class tiles + big preview), and unsuffixed ids collide across them.
- **IP note on original character designs:** original fantasy archetypes
  (a generic mage, knight, fish-humanoid, etc.) are fine. A *named,
  specifically-identifiable* copyrighted/trademarked character is not —
  even a stylized/abstracted redraw. The fish-humanoid class is called
  "Merrow" (a generic folklore term) for exactly this reason: an earlier
  version named it after, and gave it the exact silhouette cues of, a
  specific trademarked game creature. If asked to add more classes, keep
  them archetypal, not lifted from a specific named property.
- **Hybrid rendering — painted-art classes vs. SVG-rig classes:** as of
  this session, a class can *either* use the procedural `mascotSVG` rig
  *or* a pair of illustrated portrait images, per-class, via the
  `IMAGE_AVATARS` object and `mascotDisplay(score, classId, schemeIdx, opts)`
  wrapper (defined just above `mascotSVG`). **Always call `mascotDisplay`
  at render call sites, never `mascotSVG` directly** — it dispatches to
  whichever rendering path that class actually uses, and classes with no
  `IMAGE_AVATARS` entry fall straight back to the SVG rig with no other
  code changes needed.
  - Ranger is the first (and currently only) image-avatar class:
    `ranger-open.webp` / `ranger-closed.webp`, AI-generated illustrated
    portraits (not user-uploaded photos — this doesn't implicate the
    real-person-image caution below, but keep being deliberate about
    what any future generated art depicts).
  - **Background is cut out, not the original photo backdrop.** The raw
    generated art comes with its own (usually dark, atmospheric)
    background; that gets removed (`rembg`, `u2net` model — small and
    reliable, prefer it over the ~1GB default model which OOM'd the
    sandbox once) so the character floats directly on the app's own
    panel gradient — `.mascot-portrait` background is `none`
    intentionally, and `object-fit:contain` (not `cover`) so the
    silhouette isn't cropped by a rectangular frame. After cutting out,
    binarize + feather the alpha (threshold ~90, ~1.2px Gaussian blur)
    before doing anything else with it — the raw matte otherwise carries
    faint semi-transparent halos from background embers/smoke that read
    as smudges once she's on a different background.
  - **Sticker outline:** a thin outline is drawn by dilating the cleaned
    alpha mask outward (`ImageFilter.MaxFilter`, repeated per-pixel of
    outline width, ~1px `GaussianBlur` after for a soft edge) and
    compositing that as a solid-color layer behind the character. Color
    matters more than it looks like it should: black was tried first and
    is nearly invisible against this app's near-black panel gradient
    (`#12161c`→`#0d1014`) — low luminance-contrast, not a bug — but the
    user explicitly preferred black anyway after seeing both side by
    side, so black it is (scaled to a thin ~3px dilation per their
    request to tone it down further). If asked to redo this for another
    class, mock up black vs. the app's `--gold` token on the *actual*
    panel gradient before assuming either is "correct" — don't just
    default to gold for contrast without asking, since it was a
    deliberate aesthetic call, not an oversight.
  - **File format: WebP, not JPEG or PNG**, for any image-avatar art
    that needs transparency (i.e. anything with a cutout/outline
    treatment like Ranger). JPEG can't do alpha at all. Plain PNG alpha
    compresses badly for this kind of busy, photographic-detail
    art — the first PNG attempt here was ~630KB per frame; the same
    image as WebP (`quality=90, method=6`) came out ~90KB with the alpha
    channel fully intact. Always compare actual file sizes before
    picking a format, don't assume.
  - Each image-avatar class needs **two frames, same pose/framing/
    lighting** — eyes-open and eyes-closed — so the CSS blink crossfade
    (`.mascot-portrait-blink`, `@keyframes portraitBlink`) reads as a
    natural blink instead of a jump-cut. Getting a matching pair from an
    external image model works best via img2img/same-seed "close the
    eyes, change nothing else" editing, not two independent generations.
    The background-removal + outline processing above has to be applied
    identically to both frames or the outline will visibly shift/pulse
    during the blink.
  - **Even a good img2img pair isn't pixel-identical outside the eyes**
    — diffing Ranger's two source frames showed a faint but pervasive
    shift across *every* edge (hair strands, cape folds, outfit trim),
    not just the eyes. Crossfading the two full images made that read
    as a global lighting/color flicker on every blink, not just an eye
    movement. The fix isn't better color-matching of the whole image —
    it's to stop crossfading two full frames at all. Instead: treat the
    eyes-open frame as the single persistent base (`ranger-open.webp`),
    and build the "closed" frame by pasting *only* a small hand-verified
    eye-region crop from the closed source onto a copy of the open
    frame, blended with a feathered-edge mask (~14px Gaussian falloff)
    and a per-channel mean/std color match of that patch against the
    base frame's own pixels in that region. Diff the result against the
    base afterward and confirm it's *exactly* 0 outside the patch box
    before shipping — that's the actual test that this worked, not just
    eyeballing it. This is the general technique for any future
    image-avatar class's blink pair, not a Ranger-specific fix.
  - Image-avatar classes **deliberately have no color-scheme variants**
    (recoloring painted art isn't a hex-swap the way the SVG rig is) —
    `getAvatarChoice()`/`settings.avatarScheme` still exists for SVG
    classes, but the scheme swatch row is hidden in the picker for any
    class with an `IMAGE_AVATARS` entry (see `isImageClass` in
    `renderAvatarPicker`). Don't try to add scheme swatches back for
    image classes without a real plan for multi-image recoloring.
  - Score/trend reactivity for image classes is **a color-only glow**
    (`--mascot-glow`, from the existing `physiqueColor(score)`), not a
    pose or art change — deliberately simpler than the SVG rig's
    squat/stance pose shift. Keep it that way unless asked for more;
    per-band art would mean generating a full image set per score band
    per class.
  - New image assets are real files (like the app icons), not inlined
    as base64 — add any new ones to `ASSETS` in `sw.js` and bump `CACHE`,
    same as any other asset change.
- **Body size deliberately does NOT reflect the user's actual weight/BMI.**
  It's driven only by `band.squat` (the short-term calorie-trend pose) and
  a fixed per-class `bulkBase` (flavor only — e.g. dwarves run stouter,
  rangers leaner — not tied to any real body data). A prior version added
  a `bodyBulkFactor()` that computed real BMI from logged weight/height and
  multiplied it into the avatar's size on top of the mood-based scaling.
  It was removed deliberately: tying a gamified avatar's size to someone's
  actual body — permanently, regardless of how their week is going — risks
  reading as a standing judgment about their body rather than a reflection
  of their recent habits, which is a real wellbeing concern for an app
  like this one. **Do not reintroduce real body measurements (weight, BMI,
  height) as an input to the avatar's size or shape without being
  explicitly asked, and flag the concern above if asked.**
- `physiqueState()` computes a continuous `score` from the user's trailing
  ~7-day average calorie balance. `mascotSVG` snaps pose/expression to one
  of 5 discrete bands (shredded / lean / balanced / surplus / overflowing)
  at thresholds -2.2 / -0.8 / 0.8 / 2.2, but the **aura color**
  (`physiqueColor(score)`) is continuous (green → gold → red) so it still
  feels reactive between bands. This mood/aura layer (eyes, sparkles,
  spotlight glow) is universal across all classes — only the mage's held
  item is literally the mood-colored orb; other classes hold a
  class-appropriate item instead (sword, bow, axe, flame, trident).
- **Face is a shared anime-style rig, not per-class.** Tapered jaw path
  (not a plain circle), angular almond eye shape with an eyelid-shadow arc,
  3-highlight sparkle cluster, upper lash line with an outer flick, sharp
  angled brows, tiny nose mark. Lives in the same head-scale group as
  everything else, so all 6 classes get it uniformly. If a face redesign
  is requested again, this is the baseline to iterate from — it was
  explicitly flagged once as "severely lacking" before this pass, so don't
  regress toward plain circles/ellipses.
- **Signature idle moves, class by class:**
  - **Mage** — a 4-phase elemental cycle (ice → fire → earth → a teacup
    with steam), `.mage-ice/-fire/-earth/-tea`, one shared 12s
    `animation-duration`, non-overlapping keyframe windows so exactly one
    phase is ever visible.
  - **Ranger** — a 4-phase arrow cycle (plain → explosive → fire → a
    3-arrow magic flurry), `.ranger-arrow/-explosive/-fire/-magic1/2/3`,
    same pattern on a shared 16s duration.
  - Knight (inspecting the blade), Demon (wings flaring), Dwarf (forging
    and equipping), Merrow (something aquatic) are not built yet — same
    approach when they are: CSS-only, one shared duration per class,
    non-overlapping windows, respect `prefers-reduced-motion`.
  - **Hard-learned lesson on travel distance:** the weapon-hand position
    (`hx`/`hy`) already sits near the right edge of the 200-unit-wide
    viewBox (~194-195 for non-mage classes). Any "shoot/throw" motion that
    translates an element further right WILL get clipped by the SVG's
    default `overflow:hidden` past x=200 — this isn't visible in a quick
    glance because the element is usually fading out at the same time, but
    it's really there. Keep shoot-motion `translateX` small (≤6-10px) and
    verify with actual `getBoundingClientRect()` against the parent SVG's
    rect, not just eyeballing a screenshot — opacity looking right and
    position being right are independent checks, do both.
  - **Also avoid `scale()` on a whole multi-part group** (shaft + tip
    together) for a "grows dramatically" effect like an explosion: with
    `transform-box:fill-box; transform-origin:left`, the anchor is the
    *group's* combined bounding box, not the part you want to emphasize —
    if the shaft starts far from the effect (e.g. an arrow shaft running
    back to the hand), scaling the whole group amplifies distance from
    that far-away anchor and blows the effect way past where you'd expect.
    Prefer a separate small burst/flash element with its own opacity-only
    timing (see `.ranger-boom-burst`) over scaling a whole compound group.
- **Rare/mythical weapon "pulls" are not built.** The idea (discussed with
  the user): the dwarf's forge move — and potentially other classes —
  occasionally reveals a rare/mythical/SS-tier weapon variant instead of
  the default, gacha-style. This needs real design first: drop rates,
  what "rare" actually looks like (bigger glow? unique silhouette? both?),
  whether pulls are persistent (stored per-user, so a rare stays rare
  once earned) or re-rolled every render, and how that interacts with the
  existing class/scheme picker. Don't half-build this — get the design
  worked out before writing code.
- There's a glow filter and a radial "spotlight" gradient behind the
  character — this was added specifically to fix a real contrast bug
  (the original body color nearly matched the panel background). Don't
  remove the spotlight/rim-glow without checking contrast against
  `--surface` first. Same lesson applies to any new class art: check it
  against the dark panel background before calling it done (the demon's
  horns and wings needed a bone/skin-tinted fix for exactly this reason).

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
