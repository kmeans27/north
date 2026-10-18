# 06 — Architecture

> **Superseded in one respect (V2):** this file was written when the app was going to be published
> with GitHub Pages and synced through the GitHub Contents API. Neither is happening. The build
> output is served by `server/serve.py` on the owner's own machine, and there is no CI. Everything
> else here — the stack, the storage model, the dependency rules — still holds.

## 1. Stack and dependencies

| Layer | Choice | Why |
|---|---|---|
| Framework | SvelteKit 2 + Svelte 5 (runes) | Smallest runtime for a form-and-chart UI; static output |
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess: true` | The scoring maths must be total |
| Build | Vite (bundled with SvelteKit) | — |
| Adapter | `@sveltejs/adapter-static` | GitHub Pages |
| Styling | Plain CSS with custom properties | No build step, no dependency churn, tokens are the design |
| Charts | Hand-written SVG components | A library would be 40 KB for four shapes |
| Storage | IndexedDB via a ~80-line wrapper | Robust, no dependency, survives clears better than localStorage |
| Sync | GitHub Contents API with a fine-grained PAT | Free, versioned, no server |
| Unit tests | Vitest | — |
| E2E | Playwright | Timing and layout assertions are acceptance criteria |
| PWA | `manifest.webmanifest` + a 30-line service worker | Offline logging |

**Runtime dependencies: none.** The only `dependencies` entry is `@sveltejs/kit`-adjacent; everything
else is a devDependency. No date library, no chart library, no icon pack, no `idb`, no `zod`.

```
package.json scripts
  dev          vite dev
  build        vite build
  preview      vite preview
  check        svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
  test         vitest run
  test:watch   vitest
  e2e          playwright test
  lint         eslint . --max-warnings 0
  seed         tsx scripts/seed-demo.ts   # writes a demo JSON file for local work
```

## 2. File tree

```
north/
├─ src/
│  ├─ app.html
│  ├─ routes/
│  │  ├─ +layout.svelte          # shell: header, nav, theme, toast host, data load
│  │  ├─ +layout.ts              # export const prerender = true; export const ssr = false;
│  │  ├─ +page.svelte            # Today  (reads ?d= for a past day)
│  │  ├─ week/+page.svelte
│  │  ├─ trends/+page.svelte
│  │  ├─ settings/+page.svelte
│  │  └─ onboarding/+page.svelte
│  ├─ lib/
│  │  ├─ metrics/
│  │  │  ├─ types.ts             # MetricDef, Settings, Day, Value (as in 02-metrics.md §2)
│  │  │  ├─ registry.ts          # REGISTRY array (as in 02-metrics.md §3)
│  │  │  ├─ resolve.ts           # merge registry + settings overrides -> ResolvedMetric[]
│  │  │  ├─ score.ts             # curve primitives only, pure
│  │  │  ├─ aggregate.ts         # dayScore / weekScore / monthScore / coverage
│  │  │  ├─ derived.ts           # streaks, EMA, slope, hit-rates, consistency, gaps
│  │  │  └─ dates.ts             # logicalDate, weekKey, monthKey, formatting
│  │  ├─ store/
│  │  │  ├─ db.ts                # IndexedDB wrapper: get/put/del/getAll on 'days', kv on 'meta'
│  │  │  ├─ days.ts              # CRUD + write(path, value) with undo stack
│  │  │  ├─ settings.ts          # load/save/merge, presets
│  │  │  ├─ demo.ts              # deterministic demo seed
│  │  │  ├─ migrate.ts           # versioned migrations
│  │  │  ├─ export.ts            # JSON + CSV export/import
│  │  │  └─ sync/
│  │  │     ├─ github.ts         # Contents API client
│  │  │     ├─ merge.ts          # per-field merge, pure and tested
│  │  │     └─ queue.ts          # dirty days, debounce, retry on focus
│  │  ├─ insights/rules.ts       # the five rules from 02-metrics.md §6
│  │  ├─ ui/
│  │  │  ├─ Row.svelte  TriState.svelte  ChoiceRow.svelte  Bins.svelte
│  │  │  ├─ NumberField.svelte  NoteField.svelte  AutoCell.svelte
│  │  │  ├─ ScoreHeader.svelte  Sparkline.svelte  HeatGrid.svelte
│  │  │  ├─ Banner.svelte  Sheet.svelte  Toast.svelte  SectionLabel.svelte
│  │  ├─ keyboard.ts             # global key map, single listener
│  │  └─ format.ts               # numbers, units, durations, pluralisation
│  ├─ styles/
│  │  ├─ tokens.css  base.css  print.css
├─ static/
│  ├─ fonts/inter-var-latin.woff2
│  ├─ icon.svg  manifest.webmanifest  sw.js  robots.txt
├─ tests/
│  ├─ unit/{score,aggregate,dates,merge,export,insights}.test.ts
│  └─ e2e/{log,keyboard,mobile,week,settings,offline}.spec.ts
├─ scripts/seed-demo.ts
├─ svelte.config.js  vite.config.ts  tsconfig.json  playwright.config.ts
├─ .github/workflows/deploy.yml
└─ README.md
```

## 3. Configuration files

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const base = process.env.BASE_PATH ?? '';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: undefined }),
    paths: { base, relative: true },   // relative: true makes /fonts/... work under a base path
    prerender: { entries: ['*'] }
  }
};
```

```ts
// src/routes/+layout.ts
export const prerender = true;
export const ssr = false;   // all data is local; render the shell, hydrate, then load from IndexedDB
```

`ssr = false` keeps the HTML a static shell. Every page must therefore render a skeleton on the
server pass and hydrate on mount — never read `window` at module scope.

## 4. Data model

```ts
export interface DayValue {
  v: Value;                    // number | boolean | string | null
  src: 'manual' | 'auto' | 'import';
  t: number;                   // ms epoch of the write
  editedAt?: number;           // set on any later change
  locked?: boolean;            // true once a human edited it; automation must never overwrite
}

export interface Day {
  date: string;                // 'YYYY-MM-DD' logical date, no timezone offset
  tz: string;                  // IANA zone at logging time
  restDay?: boolean;
  note?: string;               // one optional line, 400 chars
  extras?: Record<string, number | string>;   // non-metric inputs, e.g. sleepStart: '23:41'
  values: Partial<Record<MetricId, DayValue>>;
}

export interface Settings {
  version: number;             // settings schema version
  bodyweightKg: number;
  proteinGPerKg: number;       // default 1.6
  goalWeightKg: number | null;
  weightMode: 'cut' | 'maintain' | 'bulk';
  dayCutoffHour: number;       // default 4
  weekStartsOn: 0 | 1;         // default 1 (Monday)
  eveningPrompt: string;       // 'HH:MM'
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  overrides: Partial<Record<MetricId, Partial<MetricDef>>>;
  hidden: MetricId[];
  automation: { health: boolean; collector: boolean; sync: boolean; repo: string | null };
}
```

`overrides` is the personalisation layer: any writable field of a `MetricDef` (`target`, `weight`,
`good`, `bad`, `max`, `lever`, `help`, `visible`). `resolve.ts` merges registry → overrides and
returns a frozen `ResolvedMetric[]`. Nothing else in the app reads `REGISTRY` directly.

Why `overrides` instead of editing the registry: an app update must never wipe personalisation,
and "reset to defaults" becomes a one-liner.

## 5. Storage

IndexedDB database `north`, version `1`:

| Store | Key | Value |
|---|---|---|
| `days` | `date` (`YYYY-MM-DD`) | `Day` |
| `meta` | string | settings, sync state, migration version, undo stack head, ingest ledger |

Wrapper API (`db.ts`), ~80 lines, no dependency:

```ts
open(): Promise<IDBDatabase>
get<T>(store, key): Promise<T | undefined>
put(store, key, value): Promise<void>
del(store, key): Promise<void>
all<T>(store): Promise<T[]>
```

Every write goes through `days.write(date, metricId, value, src)` which:

1. reads the day (or creates it with the current logical date and tz),
2. applies the field (`v`, `src`, `t`, `editedAt`, `locked: true` when `src === 'manual'`),
3. pushes an inverse op onto the undo stack,
4. persists,
5. marks the day dirty for sync.

## 6. Sync (GitHub Contents API)

Repo: `north-data`, **private**. Layout:

```
days/2026/10/2026-10-17.json      canonical day documents (written by the app)
ingest/2026-10-17.health.json     append-only, written by automation
ingest/2026-10-17.pc.json         append-only, written by the collector
settings.json                     mirror of local settings
```

Protocol:

- **Auth:** fine-grained PAT, `Contents: Read and write`, scoped to `north-data` only, stored in
  IndexedDB `meta.syncToken`, never in the repo, never logged. Settings shows `token ends 2027-01-04`.
- **Pull:** `GET /repos/{owner}/north-data/git/trees/main?recursive=1`, then `GET` each
  `days/**` blob changed since the last sync (compare with the stored tree sha). Also fetch any
  `ingest/**` files newer than the ledger.
- **Push:** `PUT /repos/{owner}/north-data/contents/{path}` with `{ message, content: base64, sha, branch: 'main' }`.
  One commit per flush, batched: `log: 2026-10-17 (6 fields)`.
- **Flush:** debounced 2 s after the last write, and forced on `visibilitychange → hidden`.
- **Retry:** on failure, keep the day dirty and retry on next focus and every 60 s while online.
- **CORS:** `api.github.com` allows browser origins; no proxy needed.
- **Rate limit:** authenticated 5,000 req/h. A normal day uses 1–4 requests. Never poll in a loop.

Merge (`merge.ts`, pure, fully tested):

```ts
mergeField(local: DayValue | undefined, remote: DayValue | undefined): DayValue | undefined
  if (!local) return remote
  if (!remote) return local
  if (local.locked && remote.src !== 'manual') return local      // manual override is sticky
  if (remote.locked && local.src !== 'manual') return remote
  return remote.t > local.t ? remote : local                     // last write wins, per field
```

`mergeDay(local, remote)` = union of fields, `mergeField` per field, newer `note`/`restDay` wins.
Ingest files are merged the same way with `src: 'import' | 'auto'`, and can never win against a
`locked` field. Ingests are idempotent: re-applying the same file changes nothing.

**Conflict UI:** after a pull that changed a field the user also changed since the last sync, the
`/week` header shows `Resolved 2 fields` and the day detail shows a `»` marker on affected fields,
each with a one-tap "use mine / use theirs".

## 7. Export formats

- **JSON:** `{ version, exportedAt, settings, days: Day[] }` — the backup format, importable.
- **CSV:** one row per day, one column per metric, `date` first, values raw. Machine-readable,
  spreadsheet-friendly, purposefully lossy about sources.
- Both are generated client-side with a `Blob` download. No server.

## 8. Demo seed (`store/demo.ts`)

Deterministic (seeded PRNG) so screenshots and design work are reproducible. Generates 120 days
with *plausible correlations* so the insight cards fire:

- sleep 6.0–8.5 h with occasional 5 h nights (Mondays worse),
- deep blocks correlated with the previous night's sleep,
- phone/social worse on Fridays and Saturdays,
- gym on Mon/Thu with 80 % adherence,
- weight drifting −0.4 %/wk with noise,
- protein hit 6 of 7 days,
- 3 random `partial` days and 1 `restDay` per month.

Activated by `?demo=1` or `settings.demoMode`. Demo data lives in memory only, never persists,
and every screen shows a muted `demo data` marker. Playwright uses it for layout tests.

## 9. Testing strategy

| Level | Tool | Covers |
|---|---|---|
| Unit | Vitest | every table in `03-scoring.md` §8, `merge.ts`, `dates.ts`, `export.ts`, `insights/rules.ts` |
| Component | Vitest + `@testing-library/svelte` (devDependency only) | widget state transitions, tri-state semantics, keyboard map, a11y names |
| E2E | Playwright | log a full day, keyboard-only pass, mobile layout at 390 × 844, week/trends render, settings re-score, offline logging, 200 % zoom |

Required E2E assertions (these are acceptance criteria, not nice-to-haves):

- Time from first paint to a complete manual log (9 simulated interactions) **< 20 s**.
- At 390 × 844 with 9 unlogged rows, the last row is reachable without scrolling, or the expander
  is fully visible in the viewport.
- Every interactive element is ≥ 44 × 44 px.
- Zero network requests on load except `inter/*.woff2`.
- With the network offline after first visit, a logged value survives a reload.

## 10. Deployment

`.github/workflows/deploy.yml`:

```yaml
name: deploy
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: true }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run check
      - run: npm test
      - run: npm run build
        env: { BASE_PATH: /north }
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: build }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: '${{ steps.deployment.outputs.page_url }}' }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Repo setup:

```bash
gh repo create north --public --source=. --push
gh api -X POST repos/{owner}/north/pages -f build_type=workflow     # or Settings → Pages → GitHub Actions
gh repo create north-data --private
```

Notes:

- GitHub Pages on a **private** repo requires GitHub Pro. Otherwise: public app repo (no personal
  data in it) + private data repo. This is the default assumption.
- `robots.txt` = `User-agent: * / Disallow: /` and a `<meta name="robots" content="noindex">`.
- Custom domain is optional and must be configured in Settings → Pages, not in the workflow.

## 11. Privacy rules (non-negotiable)

1. The app repo contains code, docs, and demo data. No real values, no screenshots of real data.
2. The PC collector sends **aggregates only**: minutes per category, a clean-day boolean. Never
   window titles, URLs, app names verbatim, or file paths.
3. No analytics, no telemetry, no error reporting service, no external fonts, no CDN.
4. The PAT is scoped to one private repo and revocable from GitHub at any time.
5. "Delete everything" wipes IndexedDB and, optionally, opens the data repo's settings page so the
   user can delete it themselves.

## 12. Performance implementation notes

- Import only what the current route uses; `score.ts`, `aggregate.ts`, `dates.ts` are tiny and shared.
- Charts render from precomputed arrays; no reactive recomputation inside SVG loops.
- Avoid `{#each}` over 366 items with per-item derived stores. The heat grid renders once.
- The service worker caches the shell + fonts only (`sw.js`, ~30 lines, stale-while-revalidate for
  the shell). Data never goes to the SW cache.
- No web fonts beyond Inter. No hydration of pages that are pure text.
