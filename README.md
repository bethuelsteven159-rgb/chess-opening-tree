# GM Opening Tree

GM Opening Tree has grown into a private chess brain.

The app is owner-only, offline-friendly after login, and designed to keep:

- opening theory
- personal games
- extracted positions
- recurring mistakes
- repair drills
- goals and reminders
- books and reading notes
- mindset cards and tournament prep

inside one connected study system.

## Current Modules

### `index.html`
Dashboard.

What it shows now:

- high-level counts for moves, games, positions, mistakes, repairs, and support work
- the main study lanes
- selected move focus
- weakness heatmap from extracted mistake categories
- unfinished game-analysis queue
- Support Hub summary for due reminders, current books, active goals, and pinned cards

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
- board view for stored FENs
- human question / lesson editor
- linked source game
- linked opening
- linked repair navigation

### `training.html`
Board-first trainer.

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
- accepts linked repair navigation from Position Vault

### `support.html`
Support Hub.

What it includes:

- support cards
- goals board
- in-app reminders
- reading shelf
- book notes
- tournament notes
- quick ideas inbox
- quick capture
- command-center summary for what matters now

### `login.html`
Owner-only Google login.

## Data Model

The app now uses these logical collections:

1. `opening_nodes`
2. `repair_items`
3. `games`
4. `game_annotations`
5. `positions`
6. `mistakes`
7. `support_cards`
8. `goals`
9. `app_reminders`
10. `books`
11. `book_notes`
12. `tournament_notes`
13. `quick_ideas`

All collections use the same protection pattern in `js/db.js`:

- current local copy
- non-empty recovery snapshot
- pending-sync copy
- guarded remote load
- guarded remote save
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
  - support cards
  - goals
  - app reminders
  - books
  - book notes
  - tournament notes
  - quick ideas

### Entry Safety Prompt

When a protected page loads, the app prompts once per session to export:

- one full restore backup
- all current table snapshots

The prompt now includes summary counts for:

- opening nodes
- repairs
- games
- positions
- support cards
- active goals
- reminders
- books

## Offline Behavior

If you already have a valid session and do not log out, the installed app can keep working offline.

What works offline now:

- move editing
- training
- repair editing
- game import and local analysis
- position-vault editing
- Support Hub editing
- backup export

What waits for later:

- remote Supabase sync

When sync fails:

- the local copy is kept
- the recovery snapshot is kept
- pending changes are preserved for the next sync

## Required SQL Step

After pulling this build, run:

- `supabase/schema.sql`

in the Supabase SQL Editor.

This adds or upgrades:

- `games`
- `game_annotations`
- `positions`
- `mistakes`
- `support_cards`
- `goals`
- `app_reminders`
- `books`
- `book_notes`
- `tournament_notes`
- `quick_ideas`

If you skip this step, the app still works locally, but the new modules remain local-only until the tables exist remotely.

## Import Behavior

The importer on `editor.html` now understands:

- old node-only arrays
- old combined node/repair backups
- single-table snapshots
- older six-collection full backups
- the new full-backup format with all support collections

Missing support arrays default safely to empty lists.

## Typical Flow

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

### Support work

1. Store goals and reminders in `support.html`
2. Keep current books and extraction notes in the reading shelf
3. Pin mindset or anti-tilt cards
4. Capture loose ideas before organizing them
5. Keep tournament prep and reflection away from raw game analysis

## Files To Know

- `js/app.js`
  Dashboard/editor/training/repair logic plus backup prompt and import/export handling

- `js/games.js`
  Game Analysis Studio logic

- `js/positions.js`
  Position Vault logic

- `js/support.js`
  Support Hub logic

- `js/support-utils.js`
  Shared support-date, repeat-rule, and progress helpers

- `js/chess-brain-utils.js`
  Shared helpers for PGN parsing, boards, downloads, and toast UI

- `js/db.js`
  Local-first + Supabase sync layer for all collections

- `supabase/schema.sql`
  Required migration script for the current tables

- `CURRENT_APP_STATE.txt`
  Practical snapshot of what the app currently does right now

## Product Shape Now

The app now feels like:

- Editor = build the lines
- Games = understand real games
- Positions = save important boards
- Training = test recall
- Repair = fix leaks
- Support = hold the goals, books, reminders, principles, and reset cards that keep the journey alive
