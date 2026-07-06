# DGC Arcade Fixes - Summary

## Issues to Fix

### 1. Blackjack Double and Split Functionality
**Problem**: Double and split actions don't work properly. The backend and frontend have contract mismatches:
- Split response doesn't include `isSplit`, `splitHands`, `activeHandIndex`, `splitStatuses` fields
- Split actions during split play return wrong payload shape
- Final split status is "completed" but frontend expects "split_complete"
- Split response missing `playerTotal` and `dealerTotal`

**Files to Fix**:
- `/artifacts/api-server/src/routes/blackjack.ts` (lines 458-467, 512-614)
- `/artifacts/dgc-arcade/src/components/games/blackjack.tsx` (lines 394-415 for mount restore)

### 2. Chicken Road Mobile Scroll Issue
**Problem**: On mobile, when the player reaches the 5th-6th sewer and beyond, the scroll stops working. The chicken becomes invisible and the player can't click the next sewer button.

**Files to Fix**:
- `/artifacts/dgc-arcade/src/components/games/chicken-road/stake-chicken-board.tsx` (lines 339-357)

**Root Cause**: The scroll effect dependency array doesn't include `scrollRef.current?.clientWidth`, causing stale closure. Also, the scroll calculation might not handle large lane indices properly.

### 3. Owner Settings Toggle Persistence
**Problem**: When toggling Roulette, Dice, and other games on/off in owner settings, the toggle doesn't persist. Must manually update database.

**Files to Fix**:
- `/artifacts/dgc-arcade/src/pages/admin.tsx` (lines 2785-2805)
- `/artifacts/api-server/src/routes/admin.ts` (lines 2241-2294)

**Root Cause**: The toggle UI updates `bankSettings.disabledGameSlugs` locally but may not be calling `saveBankSettings()` correctly, or the backend isn't invalidating the cache after update.

## Implementation Plan

1. **Blackjack Fixes**:
   - Update split response to include all required fields
   - Ensure split action responses match frontend contract
   - Change final status from "completed" to "split_complete"
   - Update mount restore effect to handle split state

2. **Chicken Road Fixes**:
   - Fix scroll effect dependency array
   - Ensure scroll calculation works for all lane indices
   - Test mobile scrolling at lane 5+

3. **Owner Settings Fixes**:
   - Verify toggle click handler calls `saveBankSettings()`
   - Ensure backend cache invalidation works
   - Test toggle persistence

## Status
- [x] Issue analysis complete
- [x] Blackjack fixes implemented
- [x] Chicken Road fixes implemented
- [x] Owner Settings fixes implemented
- [ ] All fixes tested
- [ ] Changes pushed to GitHub
