# GM Opening Tree

GM Opening Tree is a local-first private chess brain.

It is built to help one player:

- store what they understand
- capture lessons from games, books, and study
- review what should stay in memory
- repair recurring mistakes
- keep support work like goals, reminders, and tournament prep connected to actual chess work

The app stays usable offline after login, keeps guarded local copies before sync, and treats backup/export as a first-class safety feature.

## Main Pages

### `index.html`
Dashboard mission control.

It now shows:

- core counts
- weakness heatmap
- unfinished game queue
- Support Hub summary
- `Today's Mission` cards that point to the best next repair, position, opening line, game, or support action

### `editor.html`
Move Editor.

It includes:

- line explorer
- move editor
- live board
- preferred move flags
- exclude-from-training flags
- full backup export/import
- board appearance control
- global search / command palette

The old `Split Moves` button has been removed from the UI.

### `games.html`
Game Analysis Studio.

It includes:

- PGN paste/import
- replay board and move list
- critical moment marking
- human notes
- position extraction
- mistake extraction
- repair creation
- close-the-loop checklist
- mark analysis complete

### `positions.html`
Position Vault.

It now supports:

- extracted game positions
- manual positions from FEN
- manual study cards from books, videos, websites, puzzles, or random study
- source labels and URLs
- review-enabled position cards

Minimum reliable manual flow:

1. Open `Positions`
2. Fill `Manual position`
3. Paste a FEN
4. Add title, source, question, best move, lesson, tags
5. Save

### `training.html`
Universal review workspace.

Modes:

1. Opening Lines
2. Positions
3. Repairs
4. Mixed Due Review

Opening training now drills full root-to-leaf lines built from every leaf node in the opening tree.

### `repair.html`
Repair loop workspace.

It now supports:

- richer repair statuses
- linked game / annotation / position / opening context
- repair review scheduling
- repair attempt history

### `support.html`
Support Hub.

It is split into calmer workspace lanes instead of one long page:

- Quick capture
- Goals
- Reminders
- Books
- Cards
- Events
- Ideas

Conversions now include:

- book note -> position / support card / repair
- quick idea -> goal / reminder / support card / position / repair
- tournament note -> goal / game / position / repair links

## Board Clarity

Boards now use local SVG piece assets instead of Unicode as the main piece rendering.

Piece sets:

- `assets/pieces/classic/`
- `assets/pieces/high-contrast/`

Board appearance settings are stored in localStorage:

- `gm_opening_tree_piece_style_v1`
- `gm_opening_tree_board_contrast_v1`

The shared board appearance control applies to:

- Move Editor
- Games
- Positions
- Training
- Repair

## Data Model

Core collections:

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
14. `review_items`
15. `repair_attempts`

`review_items` is the universal scheduling layer for:

- opening lines
- positions
- repairs
- optional future trainable notes

## Backup And Safety

The app keeps the same protection pattern across collections:

- current local copy
- recovery snapshot
- pending-sync copy
- guarded remote load
- guarded remote save
- refusal to wipe non-empty local data with empty remote payloads

Full backup JSON now includes:

- all study/support collections
- `review_items`
- `repair_attempts`
- board appearance settings

The importer accepts:

- old node-only backups
- older combined backups
- table snapshots
- older full backups with missing collections
- the current full backup format

Missing collections are handled safely.

## Offline Behavior

After login/session is available, the app can keep working offline for normal study work.

Offline-safe flows include:

- move editing
- manual position creation
- game analysis
- review grading
- repair updates
- Support Hub updates
- backup export

When sync fails, the app keeps the local copy and preserves pending changes for a later sync.

## Required Supabase Step

Run:

- `supabase/schema.sql`

in the Supabase SQL Editor after pulling this build.

This script safely:

- adds new position / repair / game / support columns
- creates `review_items`
- creates `repair_attempts`
- adds new tournament links
- keeps existing data intact

If you do not run the SQL yet, the app still works locally. New remote sync for the new tables simply waits until those tables exist.

## Important Files

- `js/ui-shell.js`
  Shared page chrome, theme, board appearance, and global search

- `js/board-tools.js`
  Chess board rendering, PGN helpers, move matching, and SVG piece rendering

- `js/review-utils.js`
  Leaf-line extraction and review scheduling helpers

- `js/navigation-state.js`
  Shared local navigation/selection state between pages

- `js/dashboard.js`
  Dashboard mission control logic

- `js/training.js`
  Universal review logic

- `js/games.js`
  Game analysis logic

- `js/positions.js`
  Position Vault logic

- `js/repair.js`
  Repair workspace logic

- `js/support.js`
  Support Hub logic and conversions

- `js/db.js`
  Local-first data layer and guarded Supabase sync

- `supabase/schema.sql`
  Safe schema/migration script

- `service-worker.js`
  Offline asset cache, including the SVG piece sets

## Product Shape

The final shape is:

- Dashboard = what to do next
- Editor = build the repertoire
- Games = understand real games
- Positions = keep important board states
- Training = review what must be remembered
- Repair = fix repeating leaks
- Support = keep the bigger mission connected to the chess work
