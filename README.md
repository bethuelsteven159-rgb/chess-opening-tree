# GM Opening Tree

GM Opening Tree is now a private chess study workspace built around four separate jobs:

1. Build the move tree.
2. Train the answer from the board.
3. Review random cards fast.
4. Repair mistakes until they stop repeating.

This version keeps those jobs on separate pages so the app can grow later into middlegame and endgame study without turning into one overloaded screen.

## What This Version Adds

- A real dashboard in `index.html` with four study lanes.
- A dedicated `editor.html` page for line explorer, move editor, and live board.
- A dedicated `training.html` page for board-first prompts.
- A dedicated `repair.html` page for mistake -> lesson -> repair loops.
- The existing `random.html` page kept as a separate quick-review deck.
- Better board rendering so the bottom row is no longer clipped on compact boards.
- Better white-piece contrast on the live board and compact boards.
- Live board now shows:
  - current move
  - move type
  - position status
  - move explanation
- Training now uses the opposite flag logic:
  - moves are included by default
  - only moves marked `Do not use for training` are skipped
- Preferred moves are still accepted answers when a position branches.
- Root white prompts and root black prompts are now trained separately, so white-first and black-first repertoire work does not get mixed.
- The selected move now travels across pages, so you can pick a move in the editor and then use that same focus in training or repair.

## Page Map

- `index.html`
  Dashboard.
  Shows the four study lanes and your current selected line.

- `editor.html`
  Move editor workspace.
  Contains the live board, line explorer, and move-edit form.

- `training.html`
  Board-first trainer.
  Prompts any eligible position from your tree.

- `repair.html`
  Repair loop workspace.
  Keeps mistake notes connected to a board position.

- `random.html`
  Quick random review page.
  Good for short study bursts or mobile review.

- `login.html`
  Private auth page for the allowed Google account.

## Main Workflow

### 1. Dashboard

Start on the dashboard and choose the kind of work you want to do:

- `Random cards`
- `Move editor`
- `Training mode`
- `Repair loop`

The dashboard is also where future middlegame and endgame modules can plug in later.

### 2. Move Editor

Use `editor.html` when you want to build or clean the tree.

You can:

- explore the line
- select a move
- watch the live board update
- edit explanation, title, and tags
- mark a move as preferred
- exclude a move from training
- import JSON
- export JSON
- split compound moves

#### Move flags

Each move now has two important checkboxes:

- `Preferred repertoire move`
  This tells training mode which move belongs to your real repertoire when a position has multiple children.

- `Do not use for training`
  This keeps the move in the tree but removes it from:
  - training prompts
  - random review answer pools

That means training is now opt-out, not opt-in.

### 3. Live Board

The live board on `editor.html` now shows more than just the board:

- current move
- move type
- position status
- move explanation
- the full line up to that move

This makes it easier to understand not only what move you are on, but what kind of move it is and why it matters.

### 4. Training Mode

`training.html` is now a proper board-first trainer.

Flow:

1. See the board position.
2. Read: `What is the next move?`
3. Type the move in SAN.
4. Get feedback:
   - `Correct`
   - `Incorrect`
   - or a message saying the move exists in the tree but is not the active training answer

#### Training rules

- Any position can be trained:
  - openings
  - middlegames
  - endgames
- Both white and black repertoire positions are supported.
- If a position has multiple preferred children, any preferred child counts as correct.
- If a move is marked `Do not use for training`, it is skipped.
- If a move exists in the tree but is excluded from training, the trainer tells you that explicitly.

#### Important fix

Root white moves and root black moves are now separated into different prompt groups.

So:

- white start prompts stay white
- black first-move prompts stay black

They no longer collide inside the same starting-position prompt.

### 5. Random Review

`random.html` still works as the quick one-card study page.

It now benefits from the same data rules as training mode:

- moves excluded from training are skipped
- preferred moves are weighted higher
- linked repair notes still surface on the card

### 6. Repair Loop

`repair.html` is the concrete fix page for bad games and recurring errors.

Each repair item stores:

- linked move or line
- mistake
- lesson
- repair action
- status

Status options:

- `Needs work`
- `Solved`

Use it like this:

1. Select a move in `editor.html`.
2. Open `repair.html`.
3. Click `Use selected move`.
4. Capture:
   - the mistake
   - the lesson
   - the repair
5. Leave it as `Needs work` until it is actually fixed in practice.

Example:

- Mistake: `Allowed ...d5 break in the Italian`
- Lesson: `Need c3 before d4`
- Repair: `Review three model games and drill the move order`

## JSON Backup Format

Export now creates one combined backup object:

```json
{
  "version": 4,
  "exported_at": "2026-06-04T00:00:00.000Z",
  "nodes": [...],
  "repairs": [...]
}
```

Import supports:

- the new combined backup format
- older backups that only contain a nodes array

## File Map

- `index.html`
  Dashboard shell.

- `editor.html`
  Editor workspace shell.

- `training.html`
  Trainer page shell.

- `repair.html`
  Repair workspace shell.

- `random.html`
  Random review page shell.

- `login.html`
  Auth page.

- `styles.css`
  Shared design system for all pages.

- `js/app.js`
  Shared protected-page controller.
  Runs dashboard, editor, training, and repair logic.

- `js/random.js`
  Random review logic.

- `js/db.js`
  Data layer with Supabase support and local fallbacks.

- `js/ui-shell.js`
  Shared theme toggle and logout helpers.

- `js/board-tools.js`
  Board rendering and SAN parsing helpers.

- `supabase/schema.sql`
  Database schema and testing policies.

## Setup

### GitHub Pages

1. Push the repo to GitHub.
2. In repo settings, enable GitHub Pages from the `main` branch root.
3. Open the deployed site URL.

### Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL Editor.
3. Copy the project URL and anon public key into `js/config.js`.
4. Enable Google auth in Supabase if you want login to work.

## Important SQL Migration

This version adds and uses:

- `repair_items`
- `is_preferred`
- `exclude_from_training`

It also keeps `is_practice_card` for compatibility with older data.

The new SQL already backfills:

- `exclude_from_training = not is_practice_card`

So your older trainer data can move forward cleanly.

### If you have not run the new SQL yet

The app still tries to behave safely:

- old `is_practice_card` data is still read
- excluded-training logic is inferred from old data
- repairs fall back locally if the table is missing

But you should still run the new SQL so everything persists correctly online.

## Auth

This project is intentionally private.

- only the allowed Google account can enter
- every protected page has a logout button
- unauthorized users are signed out and redirected

## Theme

The app supports:

- dark mode
- light mode

Theme preference is stored in localStorage and reused across pages.

## Split Moves Tool

The `Split Moves` button is still on `editor.html`.

Use it if you accidentally stored something like:

`1... e5 2.Nf3`

inside one move cell instead of separate nodes.

Recommendation:

1. Export a backup first.
2. Run `Split Moves`.
3. Sync and inspect the result.

## Current Design Direction

This version intentionally leans into:

- warm gold + teal accents
- cleaner glass panels
- separate work pages instead of one overloaded board
- future-ready navigation for more chess study domains

## Good Future Extensions

- spaced repetition history per position
- model games linked to moves
- middlegame plan modules
- endgame drill modules
- tags for tactical theme, structure, or move-order issue
- auto-create repairs from game review intake

## Security Warning

The included RLS policies are still open for solo testing:

- read: open
- insert: open
- update: open
- delete: open

That is okay for private prototyping, but not for a public multi-user product.

When you are ready, tighten RLS so only your authenticated user can read and write the data.
