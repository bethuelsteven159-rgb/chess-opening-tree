# GM Opening Tree

GM Opening Tree is now moving from an opening-only workspace toward a personal chess brain.

The app is private, owner-only, offline-friendly after login, and designed to turn:

- opening theory
- personal games
- extracted positions
- recurring mistakes
- repair drills

into one connected study system.

## Current Modules

### `index.html`
Dashboard.

What it does now:

- shows high-level counts for moves, games, positions, mistakes, and repairs
- launches the main study lanes
- shows a weakness heatmap from extracted mistake categories
- shows the unfinished game-analysis queue

### `editor.html`
Move editor workspace.

What it includes:

- line explorer
- move editor
- live board
- move explanations
- preferred-move flags
- do-not-train flags
- import/export backup controls

### `games.html`
Game Analysis Studio.

What it includes:

- PGN paste/import
- PGN file import
- board replay
- move list replay navigation
- move-by-move human notes
- critical moment marker
- create Position Vault entry from current move
- create mistake record from current move
- create repair card from current move
- automatic opening-link attempt against the opening tree

### `positions.html`
Position Vault.

What it includes:

- saved extracted positions
- board view for the stored FEN
- human question / lesson editor
- linked source game
- linked opening
- linked repair navigation

### `training.html`
Board-first trainer for the opening tree.

What it does:

- choose color
- choose root
- hear the opponent reply
- enter the repertoire move
- reveal answer
- reveal explanation
- continue the line or jump to the next branch

### `repair.html`
Repair loop workspace.

What it does:

- stores mistake / lesson / repair
- keeps repair items open until solved
- anchors repairs to a move or path
- now accepts a linked repair coming from Position Vault navigation

### `login.html`
Owner-only Google login.

## New Sprint Added

This build implements the spec sprint:

`Personal Game Analysis + Position/Mistake Extraction`

Included:

1. `games.html`
2. PGN paste/import
3. board replay
4. move list
5. move-level human notes
6. critical moment marker
7. create position card from current move
8. create mistake from current move
9. create repair from current move
10. opening-tree link attempt
11. offline save + later sync
12. backup export for the new data

## Data Model

The app now uses these logical collections:

1. `opening_nodes`
2. `repair_items`
3. `games`
4. `game_annotations`
5. `positions`
6. `mistakes`

All six collections use the same protection pattern in `js/db.js`:

- current local copy
- non-empty recovery snapshot
- pending-sync copy
- remote sync when available
- refusal to wipe non-empty data with accidental empty payloads

## Backup Behavior

The app now supports:

- full backup JSON: `gm-brain-full-backup.json`
- table snapshots for:
  - opening nodes
  - repair items
  - games
  - game annotations
  - positions
  - mistakes

### Entry Safety Prompt

When a protected page loads, the app prompts once per session to export:

- a full restore backup
- all current table snapshots

This is deliberate.
The app is treating your chess data like serious study material, not disposable UI state.

## Offline Behavior

If you already have a valid session and do not log out, the app can keep working offline.

What works offline now:

- protected page access from stored session
- move editing
- training from local data
- repair editing
- game import and local analysis
- position-vault editing
- backup export

What waits for later:

- remote Supabase sync, obviously

When sync fails:

- the local copy is kept
- the recovery snapshot is kept
- pending changes are preserved for the next sync

## Required SQL Step

After pulling this build, run:

- `supabase/schema.sql`

in the Supabase SQL Editor.

This adds:

- `games`
- `game_annotations`
- `positions`
- `mistakes`

plus indexes and open solo-use policies.

If you skip this step, the app still keeps working locally, but the new modules will remain local-only until the tables exist remotely.

## Import Behavior

The existing backup importer on `editor.html` now understands:

- old node-only arrays
- old combined node/repair backups
- single-table snapshots
- the new combined full backup format with all six collections

## Typical Flow Now

### Opening work

1. Build or edit moves in `editor.html`
2. Train them in `training.html`
3. Store recurring leaks in `repair.html`

### Personal game work

1. Import PGN in `games.html`
2. Replay the game manually
3. Mark critical moments
4. Save move-by-move notes
5. Extract a position
6. Extract a mistake
7. Create a repair
8. Review the extracted position later in `positions.html`

## Files To Know

- `js/app.js`
  Shared dashboard/editor/training/repair logic and backup prompt logic

- `js/games.js`
  Game Analysis Studio logic

- `js/positions.js`
  Position Vault logic

- `js/chess-brain-utils.js`
  Shared helpers for PGN parsing, board rendering, and UI helpers used by the new modules

- `js/db.js`
  Local-first + Supabase sync layer for all collections

- `supabase/schema.sql`
  Required migration script for the new tables

- `CURRENT_APP_STATE.txt`
  Practical snapshot of what the app currently does right now

## Next Obvious Expansion Lanes

The app shell is now ready to grow into:

- middlegame concept vault
- endgame lab
- model game library
- broader mistake analytics

without having to redesign the whole navigation again.
