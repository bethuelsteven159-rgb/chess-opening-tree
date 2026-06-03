# GM Opening Tree

A GitHub Pages + Supabase chess opening tree app.

## Files

- `index.html` - main opening tree app
- `random.html` - quick random practice card page for phone home-screen access
- `styles.css` - full design
- `js/config.js` - paste your Supabase URL and anon key here
- `js/db.js` - Supabase/localStorage database layer
- `js/app.js` - tree editor logic, expand/collapse display, and move highlights
- `js/random.js` - random card logic
- `supabase/schema.sql` - database table and testing policies

## Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Copy your Project URL and anon public key from Supabase Project Settings -> API.
4. Paste them into `js/config.js`.
5. Push this folder to GitHub.
6. In GitHub repo Settings -> Pages, deploy from `main` branch `/root`.
7. Open the GitHub Pages URL on your phone.
8. For quick practice, open `/random.html` and add it to your phone home screen.

## Using the tree

- The tree starts collapsed, so only root moves show first.
- Click a move row once to select it and show/hide only its direct child moves.
- Use the `Move highlight` field to colour a move as a blunder, great move, or brilliant move.

## Important

The included Row Level Security policies are open for testing. That means anyone with the website link can edit data. Once the app works, change to authenticated policies.

If you already created the Supabase table before move highlights were added, run the updated `supabase/schema.sql` again. It safely adds the new `highlight_kind` column without deleting your table.
