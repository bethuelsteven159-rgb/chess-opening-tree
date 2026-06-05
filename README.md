# GM Opening Tree

GM Opening Tree is a private chess study workspace for one owner account.

The app is now organized around three main jobs:

1. Build and edit the tree.
2. Train the tree from the board.
3. Repair mistakes until they are truly solved.

It is designed so middlegame and endgame modules can be added later without cramming everything into one screen.

## What Changed In This Build

- The old standalone random-review flow was folded into training mode.
- Training now starts by choosing:
  - the color to train
  - the opening or study root to train
- Training now runs as a sequential line session:
  - you see the board
  - you see the opponent reply when applicable
  - you enter your move
  - you can reveal the answer
  - you can ask why
  - you can continue the line or jump to the next line
- On app entry, the app now asks you to export safety JSON backups for both tables.
- Save actions now show success feedback.
- The protected app now works offline as long as you already have a saved session and do not log out.
- Supabase sync is now safer:
  - local saves are preserved
  - failed remote syncs do not wipe the tree
  - offline saves stay local and can sync later
- The random page was retired as a real workflow and now just redirects to training for old links and shortcuts.
- Remote runtime dependencies were replaced with local bundled vendor files so offline mode is real.

## Page Map

- `index.html`
  Dashboard.
  Lets you choose the main study job.

- `editor.html`
  Move editor workspace.
  Contains:
  - line explorer
  - move editor
  - live board
  - import/export controls

- `training.html`
  Sequential board trainer.
  Choose a color and study root, then train the branch line by line.

- `repair.html`
  Repair loop workspace.
  Stores mistake, lesson, repair, and solved state.

- `login.html`
  Owner-only Google sign-in page.

- `random.html`
  Legacy redirect page.
  It now forwards to `training.html`.

## Dashboard

The dashboard is now the high-level launcher.

Current study lanes:

- `Move editor`
- `Training mode`
- `Repair loop`

The dashboard is intentionally ready for future expansion.
Later, middlegame and endgame study can plug into the same shell cleanly.

## Move Editor

Use `editor.html` to build or clean the tree.

You can:

- create a new root line
- add child moves
- edit move SAN
- add a title
- add an explanation
- add tags
- mark a move as preferred
- mark a move as do not train
- delete a move and its subtree
- import a backup
- export safety table snapshots
- split compound moves

### Move Flags

Each move has two important training flags:

- `Preferred repertoire move`
  If a position has multiple candidate child moves, preferred moves are treated as the accepted training answers.

- `Do not use for training`
  The move stays in the tree, but the trainer will skip it.

Training is now opt-out.
If a move is not marked `Do not use for training`, it is eligible.

## Live Board

The live board inside `editor.html` still shows the selected position and now stays paired with the move editor workflow.

It shows:

- current move
- move type
- position status
- move explanation
- the full board line

This is the main board view for editing and understanding the tree.

## Training Mode

`training.html` is now the main drilling workflow.

### Training Flow

1. Choose the color to train.
2. Choose the opening or study root.
3. Click `Start line`.
4. See the board position.
5. If the line already advanced, see the opponent response.
6. Type your move in SAN.
7. Get marked.
8. Choose what to do next:
   - reveal the answer
   - ask why
   - continue the line
   - jump to the next line

### What Counts As Correct

- If only one eligible move exists, that move is the answer.
- If several eligible child moves exist and one or more are marked preferred, any preferred move counts as correct.
- If a move exists in the tree but is marked `Do not use for training`, the trainer tells you that explicitly.
- If a move exists in the tree but is not the active answer for the current training branch, the trainer marks it as a tree branch, not as the accepted answer.

### What `Wanna know why?` Does

The `Wanna know why?` button reveals the explanation tied to the latest opponent reply when one exists.

If the line is still at the root, it reveals the explanation for the selected study root instead.

### What `Reveal answer` Does

`Reveal answer` shows the accepted answer move or moves and their explanations.

This is the replacement for the old random-card reveal flow.

### What `Next line` Does

`Next line` starts a fresh branch from the same selected root.

This is how the old quick-review randomness now lives inside training mode instead of on a separate page.

### Black Root Note

If your black repertoire roots are stored as root moves like `1...e5`, the trainer treats that as a black-side starting anchor.

That means:

- the trainer can still drill the line correctly
- the board can start with black to move for that root
- once the line advances, opponent replies and your responses continue normally

## Repair Loop

`repair.html` is for mistake-to-lesson-to-repair tracking.

Each repair item stores:

- linked move or linked path
- mistake
- lesson
- repair action
- status

Status values:

- `needs_work`
- `solved`

Typical use:

1. Select a move in the editor.
2. Open repair loop.
3. Link the current move.
4. Save:
   - the mistake
   - the lesson
   - the repair
5. Keep it open until it is truly solved.

Example:

- Mistake: `Allowed ...d5 break in the Italian`
- Lesson: `Need c3 before d4`
- Repair: `Review three model games and drill the move order`

## Data Safety

This build now treats data safety as a first-class feature.

### Entry Backup Prompt

When you enter the protected app, it now prompts you to export both tables:

- opening nodes
- repair items

The prompt appears once per app session.

### Export Buttons

The editor now exports table snapshots instead of only a single generic backup button.

Current export flow produces:

- `gm-opening-tree-opening-nodes.json`
- `gm-opening-tree-repair-items.json`

### Save Confirmation

After save actions, the app now shows a success popup/toast so you can see that the action actually landed.

Examples:

- move saved
- repair saved
- child move added
- repair marked solved
- move deleted

### Destructive Sync Protection

The app now avoids dangerous wipe behavior:

- non-empty remote data is not replaced by an empty payload unless the action is an explicit delete path
- parent-child order is validated before syncing
- failed remote syncs keep the local recovery copy
- remote emptiness no longer blindly overwrites local non-empty data

## Offline Behavior

The app can now keep working offline provided you have not logged out.

### What Offline Means Here

- your existing auth session is checked locally
- protected pages can still open from the saved session
- local assets are cached by the service worker
- Supabase load failures fall back to local data
- save actions continue locally when the network is unavailable

### Important Offline Rule

Do not log out if you want to keep using the installed app offline.

If you log out, the local session is intentionally cleared and the app will require login again.

## Import And Backup Formats

### Table Snapshot: Opening Nodes

Exports now look like this:

```json
{
  "table": "opening_nodes",
  "exported_at": "2026-06-05T00:00:00.000Z",
  "count": 12,
  "rows": []
}
```

### Table Snapshot: Repair Items

```json
{
  "table": "repair_items",
  "exported_at": "2026-06-05T00:00:00.000Z",
  "count": 3,
  "rows": []
}
```

### Import Support

The import flow now supports:

- older combined backups with:
  - `nodes`
  - `repairs`
- older node-only backups
- single-table snapshot files for:
  - `opening_nodes`
  - `repair_items`

When you import a single-table snapshot:

- the imported table is replaced from the file
- the other in-memory table is preserved

## File Map

- `index.html`
  Dashboard shell.

- `editor.html`
  Editor shell.

- `training.html`
  Sequential trainer shell.

- `repair.html`
  Repair shell.

- `login.html`
  Auth shell.

- `random.html`
  Legacy redirect to training.

- `styles.css`
  Shared design system and layout styles.

- `js/app.js`
  Shared protected-page controller.
  Runs dashboard, editor, training, repair, export prompt, and toast feedback.

- `js/db.js`
  Local-first data layer with guarded Supabase sync behavior.

- `js/auth/login.js`
  Login page logic.

- `js/auth/only-me-guard.js`
  Protected-page auth gate.

- `js/config/supabase.js`
  Shared Supabase client setup using the locally bundled browser runtime.

- `js/ui-shell.js`
  Theme and logout helpers.

- `js/board-tools.js`
  Chess board rendering and SAN handling helpers.

- `service-worker.js`
  Offline asset cache.

- `vendor/supabase-js.min.js`
  Local browser copy of Supabase JS for offline use.

- `vendor/chess.min.js`
  Local browser copy of `chess.js` for offline use.

- `supabase/schema.sql`
  Database schema.

## SQL / Schema Note

No new SQL migration is required for this specific update if you already ran the latest schema from the previous version.

This build changed:

- UI flow
- offline behavior
- sync safety
- export format

It did not add new database tables or new required columns.

## Setup

### 1. Supabase

Make sure your existing project already has the tables from `supabase/schema.sql`.

### 2. Config

The app reads:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `TABLE_NAME`
- `REPAIR_TABLE_NAME`

from `js/config.js`.

### 3. GitHub Pages

1. Push the repo to GitHub.
2. Enable GitHub Pages from the `main` branch root.
3. Open the deployed URL.

### 4. Install As App

Because this is a static web app with a service worker, you can install it from the browser as a PWA.

For best results:

- open it once while online
- let the assets cache
- keep your session signed in
- export safety snapshots regularly

## Recommended Habit

Before a serious editing session:

1. Open the app.
2. Export both tables.
3. Edit or train.
4. Export again after major changes.

That gives you a clean before/after safety trail even if the network or sync layer misbehaves later.
