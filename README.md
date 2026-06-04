# GM Opening Tree

GM Opening Tree is now a private opening workspace built around one study loop:

1. Build the move tree.
2. Mark the move you actually want to play.
3. Train from the board, not from a text list.
4. Turn every bad game into a repair note until the weakness is solved.

It is still a small static app that works well on GitHub Pages, with Supabase for auth/data and localStorage fallbacks where useful.

## What Changed

This version adds:

- A redesigned dashboard with better spacing, color direction, and stronger hierarchy.
- Dark and light mode switching.
- Logout buttons on every page.
- Import / Export actions moved to the main top bar.
- A cleaner `New root line` button that is easier to read.
- Better live board contrast, especially for white pieces.
- A `Preferred repertoire move` flag on each move.
- A board-first trainer that asks for the next move from a position.
- A repair journal for `Mistake -> Lesson -> Repair -> Status`.
- Combined JSON backup support for both moves and repair items.

## Pages

- `index.html`
  Main workspace.
  This is where you manage the tree, edit moves, train from positions, and track repairs.

- `random.html`
  A quick review page for shuffled repertoire cards.
  Good for mobile or short review sessions.

- `login.html`
  Private sign-in page for the allowed Google account.

## File Map

- `index.html`
  Main application shell.

- `random.html`
  Portable random-review page.

- `login.html`
  Auth landing page.

- `styles.css`
  Full shared design system for dashboard, login, and random review pages.

- `js/app.js`
  Main workspace logic.
  Handles the line explorer, live board, trainer mode, repair journal, import/export, and move editing.

- `js/random.js`
  Random review page logic.

- `js/db.js`
  Data layer.
  Loads and saves opening moves plus repair items using Supabase when available, with local fallbacks where needed.

- `js/ui-shell.js`
  Shared theme toggle, logout, and page chrome helpers.

- `js/board-tools.js`
  Shared chess board and SAN parsing helpers used by the live board and trainer.

- `js/auth/only-me-guard.js`
  Restricts access to the allowed Google account.

- `js/auth/login.js`
  Login flow for Google auth.

- `supabase/schema.sql`
  Database schema and open testing policies.

## Core Study Workflow

### 1. Line Explorer

Use the explorer to navigate the repertoire tree.

- Click a move to select it.
- The live board updates to that position.
- The editor loads that move.
- The trainer can use the selected position as a focused prompt source.

### 2. Preferred Moves

Every move can now be marked as:

- `Use in trainer rotation`
- `Preferred repertoire move`

Why preferred moves matter:

- If a position has multiple child moves, the trainer needs to know which answer belongs to your main repertoire.
- If one or more child moves are marked preferred, the trainer accepts those preferred moves instead of every child.
- This is the main fix for opening-tree branch conflicts during training.

### 3. Board-First Trainer

The trainer on the main page now works like this:

- It shows a board position.
- It asks: `What is the next move?`
- You type SAN like `Bc4`, `Nf3`, or `...Bb6`.
- You get immediate feedback:
  - `Correct`
  - `Incorrect`
  - Or a message telling you that your answer exists in the tree but is not the active repertoire answer for that prompt.

Trainer behavior:

- Preferred moves are prioritized.
- Positions with open repair notes are weighted more heavily.
- You can generate a random prompt or train from the currently selected position.
- Reveal shows accepted answers plus explanation notes.

### 4. Repair Loop

The repair journal is the practical version of:

`Mistake -> Lesson -> Repair -> Solved / Needs work`

Each repair item stores:

- Linked move / position
- Mistake
- Lesson
- Repair action
- Status

Good examples:

- Mistake: `Allowed ...d5 break in the Italian`
- Lesson: `Need c3 before d4`
- Repair: `Review 3 model games and drill the move order`

Use it this way:

1. Select the move or position that failed.
2. Click `Attach selected move`.
3. Write the mistake, lesson, and repair.
4. Leave it as `Needs work` until it truly feels solved.
5. Mark it `Solved` only after the issue stops showing up in your games and review.

Open repairs linked to a move also appear in trainer prompts as reminders.

## JSON Backup Format

Export now creates a single backup object:

```json
{
  "version": 3,
  "exported_at": "2026-06-04T00:00:00.000Z",
  "nodes": [...],
  "repairs": [...]
}
```

Import supports:

- The new combined object format.
- Older backups that were just an array of opening nodes.

## Setup

### GitHub Pages

1. Push the repo to GitHub.
2. In GitHub repo settings, enable Pages from the `main` branch root.
3. Open the deployed site URL.

### Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Copy the project URL and anon public key from Supabase project settings.
4. Paste them into `js/config.js`.
5. Make sure Google auth is enabled in Supabase if you want login to work.

## Important Migration Step For You

Because this version adds new data fields and a new table, you should run the updated SQL later if you have not already:

- Adds `is_preferred` to `opening_nodes`
- Creates the `repair_items` table

Until you run the updated SQL:

- Preferred moves may still work locally but not persist fully online if the column is missing.
- Repair notes will fall back to local storage if the `repair_items` table does not exist yet.

So the main follow-up task for you is:

1. Open Supabase SQL Editor.
2. Run the updated `supabase/schema.sql`.
3. Reload the app.

## Auth

This project is intentionally private.

- `only-me-guard.js` only allows the configured Google account email.
- If another user signs in, they are signed out and sent back to login.
- There is now a logout button on every page.

## Theme System

The app now supports:

- Dark mode
- Light mode

Theme choice is stored in localStorage and reused across pages.

## Random Review Page

`random.html` is now styled to match the main app and includes:

- Theme toggle
- Logout
- Board preview
- Random move card
- Explanation reveal
- Linked repair reminder when available

## Split Compound Moves

The `Split Moves` action is still available.

Use it when you accidentally stored something like:

`1... e5 2.Nf3`

inside one move field instead of separate nodes.

It converts compound text into separate child moves.

Recommendation:

- Export a backup before using it.

## Current Design Notes

This version intentionally leans into:

- Warmer gold + teal accents instead of the earlier blue/purple feel
- Stronger contrast and more readable glass panels
- Better board visibility
- Bigger visual separation between building, training, and repair work

## If You Want To Extend It Later

Good next steps:

- Track trainer performance history per position.
- Add spaced-repetition intervals.
- Store model games or reference PGNs per move.
- Add repair tags like `opening`, `middlegame plan`, `move order`, `tactics`.
- Add a dedicated game-loss intake form that creates repair items automatically.

## One Important Warning

The included Row Level Security policies are still open for testing:

- read: open
- insert: open
- update: open
- delete: open

That is fine for solo prototyping, but not for a public multi-user product.

When you are ready, tighten RLS so only your authenticated user can read and write this data.
