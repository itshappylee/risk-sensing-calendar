# Risk Sensing Calendar

A web dashboard that shows European logistics risk events (strikes, weather alerts, driving bans, holidays, incidents) on a calendar. Built for internal use.

Stack: React 19 + TypeScript + Vite + `@supabase/supabase-js`

---

## Run it

```bash
npm install     # first time only
npm run dev     # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (outputs to `dist/`) |
| `npm run lint` | Lint the code |
| `npm run check:calendar` | Calendar layout regression check (no browser needed) |

## Connect to Supabase

**The app runs without it.** With no keys set, it renders sample data (`src/lib/sampleData.ts`) and shows a "showing sample data" banner at the top.

To connect real data:

```bash
cp .env.example .env.local
# open .env.local and fill in the values yourself — never commit this file
```

In your Supabase dashboard → Project Settings → API:
- `Project URL` → `VITE_SUPABASE_URL`
- `anon` / `publishable` key → `VITE_SUPABASE_ANON_KEY`

> ⚠️ **Never put a `service_role` key here.** It bypasses Row Level Security (RLS) entirely, and
> anything in this file ends up in the browser bundle — visible to anyone who opens dev tools.

### Checking logs

The app writes logs to both the browser console and a Supabase `client_logs` table.

- **Console** — open browser dev tools as usual
- **`client_logs` table** — check it in the Supabase dashboard → Table Editor. The app can only insert rows (not read them back), so there's no in-app log viewer

If the `client_logs` table doesn't exist yet, the app still works, but every log write will silently fail and print `[log.persist] client_logs insert failed` to the console.

### ⚠️ RLS policy — read this before deploying

The `events` table has RLS enabled. This app connects with the `anon` key, so **without a SELECT policy, it silently gets zero rows back** — it will look like "no events" instead of an error. The app shows a warning banner in that case instead of failing silently.

**Do not use this common policy:**

```sql
-- ❌ Not safe for internal deployment
create policy "public read events" on public.events
  for select to anon using (true);
```

Because the `anon` key ships inside the browser bundle, this policy means **anyone who knows the URL can read all of the internal logistics risk data** — no login required.

The safer options are:
- Supabase Auth + a policy scoped to the `authenticated` role, or
- restricting deployment to the internal company network only

This has no effect while only running locally (`npm run dev`) — it becomes a real exposure the moment this is deployed somewhere reachable by others.

---

## Structure

```
src/
├─ App.tsx                  Entry point / screen routing
├─ styles.css               All styling (light/dark mode)
├─ lib/
│  ├─ types.ts              Types matching the `events` table
│  ├─ calendar.ts           Month grid + bar layout / stacking logic
│  ├─ eventMeta.ts          Per-type colors/icons, severity color mapping
│  ├─ i18n.ts               KR/EN text dictionary
│  ├─ supabaseClient.ts     Supabase client setup only
│  ├─ supabase.ts           Data fetching (falls back to sample data if unconfigured)
│  ├─ log.ts                Logging layer — console + `client_logs`
│  └─ sampleData.ts         Sample event data for local development
└─ components/
   ├─ Header.tsx            Top nav, KR/EN toggle
   ├─ CalendarScreen.tsx    Main calendar screen
   ├─ MonthGrid.tsx         Calendar grid and event bar rendering
   ├─ Legend.tsx            Legend
   ├─ InfoScreen.tsx        In-app help / tab descriptions
   └─ DayDetail.tsx         Day detail side panel
```

## Known gaps

| Item | Status |
|---|---|
| Yearly view | Not built yet |
| Timezone conversion / `verified` label | Not fully spec-compliant yet |
| Route analysis | Not part of this repo — built and maintained separately |
