# jaries23 GitHub Pages site

This folder contains a static community frontend ready to publish to a personal GitHub Pages repository.

## Local structure

- `index.html`: app shell and UI markup
- `styles.css`: community frontend styling
- `app.js`: Supabase auth, feed, gallery, post, and comment logic
- `config.js`: runtime config loaded by the static site
- `supabase/community_schema.sql`: community database schema for Supabase
- `supabase/README.md`: setup notes and required keys
- `.env.example`: environment variable template for framework-based variants

## Quick start

1. Run `supabase/community_schema.sql` in the Supabase SQL Editor.
2. Fill in `config.js` with `supabaseUrl` and a browser-safe `supabaseKey`.
3. Open `index.html` through your static host or publish the folder to `jaries23.github.io`.

## Publish target

Use the repository name `jaries23.github.io` for a personal site at:

`https://jaries23.github.io/`
