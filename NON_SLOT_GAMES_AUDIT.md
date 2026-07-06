# DGC Arcade v2 - Comprehensive Audit of Non-Slot Games (A-Z)

This document details the complete audit of all non-slot games within the DGC Arcade v2 platform. The review covers UI/UX, code quality, mobile responsiveness, game logic, and identifies specific areas for improvement across the 10 core table/arcade games.

## 1. Blackjack (`blackjack.tsx`)

### Pros
- **Rich Visuals & Sound:** Excellent use of dynamic themes (`useFelt`, `useAccent`), procedural audio for card deals, and crowd reactions based on win/loss.
- **Advanced Mechanics:** Supports full split and double down logic with independent hand tracking.
- **Mobile Responsive:** Well-structured mobile breakpoint logic that completely reorganizes the table and bet controls to fit vertically without squishing the cards.

### Cons & Improvement Areas
- **Complex Component State:** The component manages a massive amount of state (playerHand, dealerHand, splitHands, activeHandIndex, etc.) directly in the view.
- **Action Button Clutter:** On mobile, the hit/stand/double/split buttons can become cramped if a split occurs.
- **Animation Glitches:** The card deal animation relies on DOM bounding boxes which can occasionally misfire if the window is resized during a deal.

**Action Plan:** Extract state management into a custom hook (`useBlackjackState`). Add a slight padding buffer to the mobile action buttons.

## 2. Chicken Road (`chicken-road.tsx`)

### Pros
- **Highly Custom & Unique:** Bespoke logic with dynamic hazard generation, custom SVG/CSS animations for the chicken hopping and cars.
- **Configurable Difficulty:** The Stake-style tier system (easy, medium, hard, expert) is fully implemented and ties directly to multiplier scaling.
- **Audio Polish:** Extensive custom sound effects (clucks, car passes, manhole bursts) that trigger precisely with animations.

### Cons & Improvement Areas
- **Animation Lock Risks:** The `animLock` ref prevents double-clicks, but if an API call fails mid-animation, it could potentially leave the game in a stuck state.
- **Mobile Layout:** The board can feel slightly squashed on very small screens (e.g., iPhone SE) because the SVG viewbox doesn't scale perfectly with the aspect ratio.

**Action Plan:** Add a robust timeout/fallback to the `animLock` to ensure it always releases on error. Adjust the SVG viewbox constraints for ultra-small mobile devices.

## 3. Coinflip (`coinflip.tsx`)

### Pros
- **Excellent 3D Animation:** The coin flip uses a very clean CSS 3D transform with dynamic glow effects based on the win/loss result.
- **Simple & Direct:** Very clean codebase, easy to read, and handles the API integration flawlessly.

### Cons & Improvement Areas
- **Mobile Coin Size:** The coin can dominate the screen on mobile, pushing the bet controls too far down.
- **Redundant State:** `isFlipping` and `result` could be consolidated to prevent edge-case race conditions.

**Action Plan:** Scale down the coin size slightly on mobile breakpoints. Refactor the betting function to use a single state object.

## 4. Crash (`crash-game-live.tsx` & `crash.tsx`)

### Pros
- **Live Multiplayer Support:** The live version supports real-time bet tracking and a shared multiplier curve.
- **Visuals:** The exponential curve SVG and the massive multiplier text create a very tense, engaging atmosphere.

### Cons & Improvement Areas
- **Duplicate Implementations:** There are two files (`crash.tsx` and `crash-game-live.tsx`). `crash.tsx` appears to be a local/solo version, which can cause confusion.
- **Animation Frame Drift:** The multiplier animation relies on `requestAnimationFrame` and `performance.now()`. If the browser tab is backgrounded, the animation can jump aggressively when focused.

**Action Plan:** Ensure the routing points strictly to the live version. Add visibilitychange listeners to handle background tab animation pauses gracefully.

## 5. Derby / Race (`race.tsx`)

### Pros
- **Incredible Polish:** The most visually impressive game in the suite. Features full CSS-based horse animations, parallax backgrounds, camera cuts, and a photo-finish sequence.
- **State Management:** Uses a robust state machine for the race phases (idle, gate, running, finish).

### Cons & Improvement Areas
- **Performance Heavy:** The sheer number of CSS animations (dust, legs, crowd, clouds) can cause frame drops on lower-end mobile devices.
- **Complex DOM:** The DOM tree is very deep, making it hard to debug specific visual glitches.

**Action Plan:** Add a "low quality" toggle or automatically disable some particle effects (dust, clouds) if a mobile device is detected.

## 6. Dice (`dice-game-live.tsx` & `dice-game.tsx`)

### Pros
- **Slider UI:** The over/under slider is very intuitive and instantly updates win chance and multipliers.
- **3D Dice Visuals:** The dice rolling animation adds a nice tactile feel to a traditionally text-only game.

### Cons & Improvement Areas
- **Duplicate Implementations:** Similar to Crash, there is a local and a live version.
- **Mobile Slider Precision:** The native `<input type="range">` can be difficult to drag precisely to specific numbers on touch screens.

**Action Plan:** Add +/- stepper buttons next to the slider for precise mobile control. Consolidate to the live version.

## 7. HiLo (`hilo.tsx`)

### Pros
- **Clean UI:** The card rendering and the Hi/Lo/Equal buttons are very clear. The win probabilities are displayed directly on the buttons.
- **Streak Tracking:** The multiplier accumulation logic is solid and encourages extended play.

### Cons & Improvement Areas
- **Card Deck Assumption:** The game assumes an infinite deck (probabilities don't change based on previously drawn cards), which might confuse players expecting standard blackjack-style shoe depletion.
- **Mobile Button Stacking:** The Equal button is very large compared to the Hi/Lo buttons.

**Action Plan:** Add a small tooltip explaining the infinite deck mechanic. Rebalance the button grid on mobile so all three options have equal visual weight.

## 8. Keno (`keno.tsx`)

### Pros
- **Classic Feel:** The 80-number grid is well implemented, and the auto-pick feature works perfectly.
- **Dynamic Payout Table:** The payout table updates instantly based on how many numbers are selected.

### Cons & Improvement Areas
- **Grid Density on Mobile:** 80 buttons on a mobile screen are very small and hard to tap accurately.
- **Animation Speed:** The draw animation (60ms per ball) is a bit slow if 10 numbers are drawn.

**Action Plan:** Increase the tap target size on mobile by reducing the grid gap. Add a "Turbo" toggle to instantly reveal results.

## 9. Mines (`mines.tsx`)

### Pros
- **Configurable Grid:** Supporting 24, 48, and 60 cell grids is a great feature for advanced players.
- **Tension Building:** The sound effects (gem ting vs bomb boom) are excellent and build great tension.

### Cons & Improvement Areas
- **Session Recovery:** The `useEffect` that restores active sessions on mount can sometimes conflict with the initial render state, causing a slight flicker.
- **Mobile Cell Size:** On the 60-cell grid, the cells are incredibly small on mobile.

**Action Plan:** Add a loading skeleton while the session is being restored. Warn users or disable the 60-cell grid on very small screens.

## 10. Plinko (`plinko.tsx`)

### Pros
- **Physics Engine:** The custom physics loop for the ball bouncing off pegs is surprisingly robust and looks great.
- **Provably Fair Integration:** The ball always lands in the bucket dictated by the server's provably fair hash.

### Cons & Improvement Areas
- **Not in Live Router:** Plinko is implemented but doesn't appear to be wired into the main `pages/game.tsx` switch statement.
- **Physics Glitches:** Very rarely, a ball can clip through a peg if the frame rate drops significantly.

**Action Plan:** Wire Plinko into the main game router. Increase the collision detection radius slightly to prevent clipping on low frame rates.

## 11. Roulette (`roulette.tsx`)

### Pros
- **SVG Wheel:** The wheel is entirely SVG-based, making it infinitely scalable and crisp on all devices.
- **Spin Math:** The rotation calculation ensures the wheel always lands exactly on the server-dictated pocket.

### Cons & Improvement Areas
- **Betting Interface:** The number picker is a simple grid rather than a traditional Roulette felt layout, which might alienate classic casino players.
- **Mobile Layout:** The wheel and the betting controls fight for vertical space on mobile.

**Action Plan:** Keep the simple grid but add visual groupings for dozens/columns. Reduce the wheel size slightly on mobile to give the betting controls more breathing room.

---

## Overall Summary & Next Steps

The games are generally in excellent shape, with high-quality visuals, sound, and provably fair integration. The primary areas for improvement across the board are:

1. **Mobile Optimization:** Tweaking padding, button sizes, and grid layouts to ensure perfect touch targets on small screens (especially for Mines, Keno, and Roulette).
2. **State Cleanup:** Consolidating duplicate files (Crash, Dice) and ensuring animation locks have fail-safes.
3. **Performance:** Adding low-quality fallbacks for heavy CSS animations (Derby).

I will now proceed to implement these specific improvements across the components.
