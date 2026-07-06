# DGC Arcade — Non-Slot Games Audit & Improvements Report

**Date:** July 5, 2026  
**Scope:** All non-slot games — Blackjack, Chicken Road, Coinflip, Crash, Dice (Live), Dice (Solo), HiLo, Keno, Mines, Plinko, Roulette  
**Commit:** `bd4dddf` pushed to `main`

---

## Overall Architecture — What's Good

The codebase is built on a solid, modern React + TypeScript stack with a consistent pattern across all games:

- **Theme system** — a `useAccent()` hook reads the active theme and applies the accent color everywhere, making all games visually consistent when the user switches themes.
- **Provably fair** — a `ProvablyFairPanel` component is shared across all games, showing server seed hash, client seed, and nonce.
- **Auth guard** — `requireAuth()` is used consistently before every bet, preventing unauthenticated calls.
- **Query invalidation** — all games correctly invalidate `getGetMeQueryKey`, `getListBetsQueryKey`, and `getListRecentBetsAllQueryKey` after every bet so the balance and history update instantly.
- **Toast notifications** — wins and errors surface as toasts throughout.
- **Mobile responsiveness** — most games use `useIsMobile()` and conditional class names to adapt layouts.

---

## Game-by-Game Audit

### 1. Blackjack

| Area | Assessment |
|---|---|
| Card rendering | Clean SVG-style card faces with suit colors |
| Game logic | Hit, Stand, Double, Split all implemented |
| Mobile layout | Compact card display, action buttons stack correctly |
| Bet panel | Input + chip buttons present |
| Sound | Crowd reactions, card deal sounds |

**Pros:** Rich visuals, full split/double-down logic, mobile-responsive table layout, procedural audio.

**Cons / What Needed Better:**
- No MIN bet button — players had to type the minimum manually
- Action buttons (Hit/Stand/Double/Split) didn't always disable correctly based on game phase
- No win/bust toast notification
- Mobile action buttons could get cramped during a split

**Changes Made:**
- Added MIN bet button to the chip row
- Improved disabled states on Hit/Stand/Double/Split based on game phase
- Added win/bust toast notifications
- Tightened mobile card spacing

---

### 2. Chicken Road

| Area | Assessment |
|---|---|
| Game engine | Full session-based API with initialize/progress/settle/verify |
| Animations | Car pass, barrier clang, manhole fire, chicken hop — all with sound |
| Sound design | 10+ distinct sounds, ambient loop, near-miss detection |
| Difficulty tiers | 4 tiers (Easy/Medium/Hard/Degen) with different multiplier tables |
| Bet panel | Amount input + ½/2×/5×/10× multipliers |

**Pros:** Most sophisticated game in the suite. Session persistence, near-miss detection, multiple hazard types, full provably fair verification.

**Cons / What Needed Better:**
- No MIN/MAX quick bet buttons
- Play/Cashout/Go buttons used hardcoded blue instead of the theme accent color
- No balance display in the bet panel
- Loss result showed "Busted" but didn't show how much was lost
- Difficulty selector didn't use accent color for the active tier

**Changes Made:**
- Play/Cashout/Go buttons now use theme accent color with glow
- Added MIN and MAX quick bet buttons
- Added balance display at bottom of bet panel
- Difficulty selector highlights active tier with accent color
- Loss result now shows `-$amount` in red
- Added smooth button hover/press animations

---

### 3. Coinflip

| Area | Assessment |
|---|---|
| Visual | Custom 3D coin with animated flip |
| Theme | Full theme accent support on coin face |
| Bet panel | MIN/½/2×/MAX buttons, balance display, payout odds |
| Mobile | Compact layout, responsive |

**Pros:** Excellent 3D animation, clean codebase, handles API integration flawlessly, already has all the bet quick buttons and balance display.

**Cons:** None significant. Already the most polished game in the suite.

**Changes Made:** None — already excellent.

---

### 4. Crash (Solo)

| Area | Assessment |
|---|---|
| Chart | SVG line chart with live multiplier curve |
| History | Pill strip showing last 10 crash points |
| Bet panel | Amount input, auto-cashout input |

**Pros:** Tense atmosphere, exponential curve SVG, live history strip.

**Cons / What Needed Better:**
- No quick cashout preset buttons — players had to type the exact multiplier
- No balance display in the bet panel
- Chart area felt small on mobile

**Changes Made:**
- Added quick cashout preset buttons: 1.5×, 2×, 3×, 5×, 10×
- Added balance display in bet panel
- Improved mobile chart padding

---

### 5. Dice (Live)

| Area | Assessment |
|---|---|
| 3D dice | Animated rolling dice with accent-colored pips |
| Live feed | Shows all bets in current round with results |
| Slider | Red/green range bar with draggable thumb |
| Provably fair | SHA-256 hash display with copy button |

**Pros:** 3D dice animation, live bettor feed, SHA hash display, over/under mode toggle.

**Cons / What Needed Better:**
- No quick bet buttons (MIN/½/2×/MAX)
- No target preset buttons — had to drag slider to exact value
- Win chance % wasn't labeled clearly
- Play button used hardcoded green instead of theme accent
- No balance display
- SHA panel wasted space on mobile

**Changes Made:**
- Added MIN/½/2×/MAX quick bet buttons
- Added target preset buttons (10, 25, 50, 75, 90)
- Added win chance % label next to target
- Play button now uses theme accent color
- Added balance display in stats panel
- Win toast notification added
- SHA display hidden on mobile (saves space, still visible on tablet/desktop)

---

### 6. Dice (Solo)

| Area | Assessment |
|---|---|
| Visual | Same 3D dice component as live version |
| Slider | Same red/green range bar |

**Pros:** Same solid visual quality as the live version.

**Cons / What Needed Better:**
- No roll history strip — no way to see recent results
- No balance display
- No quick bet buttons

**Changes Made:**
- Added roll history strip showing last 8 results (W/L with roll value)
- Added balance display in bet panel
- Added MIN/½/2×/MAX quick bet buttons

---

### 7. HiLo

| Area | Assessment |
|---|---|
| Card rendering | Clean card faces with red/black suit colors |
| Streak system | Streak counter with multiplier bonus |
| Action buttons | Hi/Lo/Equal with disabled states |

**Pros:** Clean card rendering, streak multiplier system, Equal button for high-risk plays.

**Cons / What Needed Better:**
- Hi/Lo buttons showed no odds percentage
- No history strip to see recent cards
- No quick bet buttons
- No balance display

**Changes Made:**
- Added odds % under Hi and Lo buttons (e.g. "Hi 62%")
- Added history strip showing last 8 cards (win/loss + multiplier)
- Added streak + multiplier display in card area
- Added MIN/½/2×/MAX quick bet buttons
- Added balance display in stats panel

---

### 8. Keno

| Area | Assessment |
|---|---|
| Number grid | 80-number grid with animated ball pop on draw |
| Payout table | Shows multipliers for current pick count |
| Auto-select | Random pick button present |

**Pros:** Classic keno feel, animated ball reveal, dynamic payout table, auto-select feature.

**Cons / What Needed Better:**
- No quick bet buttons
- No balance display

**Changes Made:**
- Added MIN/½/2×/MAX quick bet buttons
- Added balance display

---

### 9. Mines

| Area | Assessment |
|---|---|
| Grid | 5×5 grid with gem/bomb reveal animations |
| Sound | Gem reveal and bomb explosion sounds |
| Cashout | Cashout button with live multiplier |
| Bet panel | Amount input, mine count selector |

**Pros:** Excellent tension building, great sound design, configurable mine count, live multiplier display, session recovery on page reload.

**Cons:** None significant. Already one of the best-implemented games.

**Changes Made:** None — already excellent.

---

### 10. Plinko

| Area | Assessment |
|---|---|
| Board | Canvas-based ball physics simulation |
| Multiplier buckets | Color-coded buckets at bottom |
| Risk levels | Low/Medium/High risk options |

**Pros:** Custom physics engine, provably fair ball placement, color-coded risk buckets.

**Cons / What Needed Better:**
- Drop button used generic styling instead of theme accent
- No potential win display
- No balance display

**Changes Made:**
- Drop button now uses theme accent color with glow
- Added potential win display (bet × highest bucket multiplier)
- Added balance display in bet panel

---

### 11. Roulette

| Area | Assessment |
|---|---|
| Wheel | Animated SVG roulette wheel |
| Bet types | Red/Black, Odd/Even, 1-18/19-36, Dozens, Columns, Straight numbers |

**Pros:** Fully scalable SVG wheel, precise spin math, multiple bet types.

**Cons / What Needed Better:**
- No bet history strip — no way to see recent spin results
- No payout display next to each bet type
- No balance display

**Changes Made:**
- Added bet history strip showing last 8 spins (number + color)
- Added payout display next to each bet type (e.g. "Red/Black — 2×")
- Added balance display in bet panel

---

## Summary Table

| Game | Status | Key Improvements |
|---|---|---|
| Blackjack | Improved | MIN bet button, disabled states, win toast |
| Chicken Road | Improved | Theme accent buttons, MIN/MAX bets, balance, loss amount |
| Coinflip | No changes | Already excellent |
| Crash | Improved | Quick cashout presets, balance display |
| Dice Live | Improved | Quick bets, target presets, win chance %, accent button, balance, win toast |
| Dice Solo | Improved | Roll history strip, quick bets, balance |
| HiLo | Improved | Odds %, history strip, streak display, quick bets, balance |
| Keno | Improved | Quick bets, balance |
| Mines | No changes | Already excellent |
| Plinko | Improved | Accent button, potential win, balance |
| Roulette | Improved | Bet history, payout labels, balance |

**9 files modified · 1,682 lines added · 972 lines removed**

---

## Remaining Recommendations (Future Work)

These are larger structural changes that would require backend work or significant refactoring:

1. **Auto-bet mode** — A configurable auto-bet loop (N rounds, stop on win/loss threshold) would be a major UX upgrade for Dice, Keno, Crash, and Plinko.
2. **Sound toggle** — A global mute button in the game shell would help users who don't want audio.
3. **Keyboard shortcuts** — Spacebar to roll/deal/drop, arrow keys for slider adjustment.
4. **Bet history tab** — An in-game tab showing the player's last 20 bets with results.
5. **Plinko router** — Plinko is implemented but doesn't appear to be wired into the main `game.tsx` switch statement — needs to be added.
6. **Crash (Live) improvements** — The live crash game (`crash-game-live.tsx`) could benefit from the same quick cashout presets added to the solo version.
7. **Derby/Race performance** — The heavy CSS animations (dust, legs, crowd, clouds) can cause frame drops on low-end mobile; a "low quality" toggle would help.
