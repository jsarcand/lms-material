# LMS Material — Project Roadmap & Reference

Saved as a working reference for product direction, performance work, and turnkey packaging.

**Primary goals**
1. Interface that is **solid, fast, and coherent**
2. Deployable as a **self-contained app/server**, with option to install and maintain the server on the computer as a **Tauri app** on macOS, Windows, and Linux

**Current ops context**
- Mac is source of truth for skin work
- Deploy target: pCP LMS @ `192.168.1.4` via `./deploy-to-lms.sh tc@192.168.1.4`
- Dual plugin paths on device: `Plugins` + `InstalledPlugins` (deploy script syncs both)

---

## Phase order (do not skip)

### Phase 0 — Stabilize current surface (near-term)
**Goal:** daily-driver reliability on pCP LMS.

- Burn down known polish bugs as they appear
- One “known issues” pass on desktop + mobile after each deploy
- Freeze big new UX experiments until the current surface is coherent

**This is the current phase.**

---

### Phase 1 — Solid, fast, coherent
**Goal:** one product feel; playing music must not peg a CPU core.

#### Performance (highest leverage first)
1. **Progress / playhead path**
   - Problem: main-thread rAF that mutates Vue state is **CPU work**, not GPU animation
   - Direction:
     - Compositor-driven progress (`transform` + CSS transition/animation over remaining duration)
     - Clock/labels at ~1–4 Hz
     - Lyrics only when the second changes / when lyrics UI is visible
     - Re-anchor on status poll, seek, play/pause — do not re-render the whole NP tree every frame
2. **Hover & list chrome**
   - Playlist hover buttons, filters, marquee measure, resize layout should not re-measure/re-render whole trees
3. **Blur / backdrop-filter budget**
   - Glass is expensive on macOS; reduce nested blurs; prefer static scrims where possible
4. **Layout thrash on resize**
   - Desktop↔mobile switch, nav reserve, marquee remeasure, dock chrome: debounce and single-pass
5. **Image / cover work**
   - Correct decode sizes, lazy load, avoid re-decode on every open

#### Coherence
- One interaction model: back, home, filter, lexicon/jumplist, np-bar vs np-card, drawers
- One spacing / typography / elevation system
- Kill dual sources of truth (duplicate CSS trees, dual JS copies, leftover experimental rules)
- Definition of done per surface: desktop np-bar, mobile np-card, browse, queue, prefs

#### Phase 1 exit criteria
- [ ] Playing music does not peg a CPU core
- [ ] No known broken hover / filter / resize / open-sheet chrome
- [ ] Desktop↔mobile resize does not leave empty or half-mounted chrome
- [ ] Visual/interaction language feels like one product

---

### Phase 2 — Harden for real use
**Goal:** reliable deployable skin + clear ops story on pCP/LMS.

- Single source tree for skin assets (reduce dual `html/js` vs `html/` drift)
- Version/revision stamp, smoke checklist, deploy script as one true path
- Optional: minified release build vs dev build
- Bug bashes: favorites, queue, browse home-split, volume expand, group volume, filter/lexicon, context-stats
- Document known-good LMS plugins (Spotty, MAI, Context Stats, APC, etc.)

---

### Phase 3 — Tauri control-point app
**Goal:** installable UI app on macOS / Windows / Linux against an existing LMS.

- Tauri 2 shell loads Material UI
- Connect wizard: existing LMS on LAN (current pCP workflow)
- Tray, window state, deep links as needed
- Validates webview + packaging without bundling Perl/LMS yet

---

### Phase 4 — Tauri turnkey (bundled server)
**Goal:** self-contained app that can install and maintain the server on the computer.

- Bundled LMS/Lyrion sidecar started/stopped by the app
- First-run wizard: library path, player discovery, optional plugins
- Settings: “use bundled server” vs “connect to existing LMS”
- macOS first (current SoT), then Windows + Linux
- Update story for shell / server / skin (version matrix)

**Hard parts to design early**
- Shipping LMS/Perl runtime + native deps per OS
- Plugin install/update inside the app
- Library path permissions (macOS sandbox / Windows paths)
- Auto-update channels
- App is control point; playback still via LMS players unless a player is embedded later

---

## Phase overview

| Phase | Focus | Outcome |
|------|--------|--------|
| **0 Stabilize** | Known UI bugs | Daily-driver on pCP |
| **1 Solid/fast/coherent** | Perf + interaction model + visual system | One product feel |
| **2 Harden** | Single asset pipeline, smoke tests, plugin matrix | Reliable deploy |
| **3 Tauri control-point** | App shell → external LMS | Installable UI app |
| **4 Tauri turnkey** | Bundled LMS sidecar + wizard | Self-contained server+UI |
| **5 Product polish** | Auto-update, tray, multi-OS installers | Shippable product |

---

## Exit criteria (goals)

### Solid / fast / coherent
- [ ] Playing music does not peg a CPU core
- [ ] Hover / filter / resize / open-sheet do not leave broken chrome
- [ ] Desktop and mobile feel like one product

### Turnkey Tauri
- [ ] Mode A: control-point app → existing LMS
- [ ] Mode B: bundled server sidecar + first-run wizard
- [ ] macOS first, then Windows / Linux
- [ ] Explicit update story for shell / server / skin

---

## What not to do next
- Big new features before perf/coherence is calm
- Full LMS-in-Tauri packaging before the UI is stable
- More glass/blur experiments until CPU is under control

---

## Suggested sequence
1. Land progress/playhead perf (hardware-accelerated bar, sparse JS re-anchors)
2. Short lag pass on playlist hover + NP open (paint/blur/layer cost)
3. Remaining coherence bugs
4. Freeze UI behavior
5. Tauri control-point shell spike (external LMS)
6. Turnkey LMS sidecar later

---

## Progress / playhead technical notes

### Previous cost model (CPU)
- Main-thread rAF mutating Vue state (`time`, `pospc`) every ~16ms
- Each `lms-progressbar` running its own 60fps lerp writing reactive styles
- Lyrics layout work potentially tied to the same cadence
- Result: main-thread scripting, not GPU animation; jank on hover and sheet open

### Target model (GPU)
- Fill uses `transform: scaleX(...)` / `scaleY(...)` + `translateZ(0)`
- While playing: snap to true position, then **CSS linear transition** over remaining duration
- Re-anchor on status poll, seek, play/pause
- Clock/labels ~1–4 Hz
- Lyrics only when the displayed second changes / when lyrics UI is visible
- Prefer `will-change: transform` only while animating; avoid nested `backdrop-filter` during motion

### Phase roadmap (reference)

| Phase | Focus | Outcome |
|------|--------|--------|
| **0 Stabilize** | Known UI bugs | Daily-driver on pCP |
| **1 Solid/fast/coherent** | Perf + interaction model + visual system | One product feel |
| **2 Harden** | Single asset pipeline, smoke tests, plugin matrix | Reliable deploy |
| **3 Tauri control-point** | App shell → external LMS | Installable UI app |
| **4 Tauri turnkey** | Bundled LMS sidecar + wizard | Self-contained server+UI |
| **5 Product polish** | Auto-update, tray, multi-OS installers | Shippable product |

### Goals (unchanged)
1. Interface that is **solid, fast, and coherent**
2. Self-contained app/server option via **Tauri** on macOS, Windows, Linux  
   - Mode A: control-point → existing LMS  
   - Mode B: bundled LMS sidecar + first-run wizard  

See also: `docs/ROADMAP.md` for the full phase plan.
