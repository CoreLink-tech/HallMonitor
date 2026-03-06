# Supabase Connection Setup

## 1) Add your Supabase project credentials
Edit `assets/js/supabase-config.js`:

- `url`: your Supabase project URL (e.g. `https://xxxx.supabase.co`)
- `anonKey`: your project anon public key

## 2) Create the state table in Supabase
Open Supabase SQL Editor and run:

- `supabase/schema.sql`

This creates table `public.hallmonitor_state` with policies for app read/write.

## 3) Refresh the app
Open any app page. The app will:

- load local state immediately
- hydrate from Supabase if row exists
- write updates back to Supabase automatically

## Notes
- Current implementation syncs the full app state JSON in one row (`id = 'global'`).
- Good for quick integration; later you can split into normalized tables.
- Current SQL policies are open (demo mode). Tighten RLS before production.
