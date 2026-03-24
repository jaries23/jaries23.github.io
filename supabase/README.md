# Supabase setup for a gallery-style community

This folder contains a starter schema for a Reddit/DCInside-style community.

Included features:

- profiles mapped to `auth.users`
- galleries with public, restricted, and private visibility
- gallery members with owner and moderator roles
- posts, threaded comments, votes, saved posts, and reports
- row-level security policies for public read and authenticated writes

Files:

- `community_schema.sql`: run this in Supabase SQL Editor or keep it as a migration
- `../config.js`: static frontend runtime config for browser-safe keys only

Required keys:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` only for server-side admin tools
- `SUPABASE_DB_URL` only if you use direct Postgres access

Security:

- Safe in browser: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`
- Never expose in browser or public GitHub Pages: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`

Suggested next steps:

1. Open Supabase SQL Editor and run `community_schema.sql`.
2. Fill in `config.js` with `supabaseUrl` and `supabaseKey`.
3. Create one test account in Supabase Auth.
4. Create your first gallery from the frontend.
