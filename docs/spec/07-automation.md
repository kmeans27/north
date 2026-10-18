# 07 — Automation

Goal: the user taps **at most six things a day**. Everything else arrives on its own.

Three sources feed `north-data`:

| Source | Writes | Frequency | Tool |
|---|---|---|---|
| Apple Health | sleep, steps, workouts, daylight, weight | scheduled export | Health Auto Export (iOS) or the free `export.xml` importer |
| PC collector | distraction minutes, productive minutes, clean day, learning minutes | every 10 min | ActivityWatch + a Node script + systemd |
| Manual shortcuts | creatine, reading, notes, evening reminder | on tap | iOS Shortcuts / NFC tags |

All three use the same ingest contract. The app never calls out to them; it reads the files they write.

---

## 1. Ingest contract

```jsonc
// ingest/2026-10-17.health.json   (canonical name: <date>.<source>.json)
{
  "schema": "north.ingest.v1",
  "source": "apple_health",              // apple_health | pc_collector | shortcut
  "date": "2026-10-17",                  // logical date this payload describes
  "tz": "Europe/Berlin",
  "generatedAt": 1760700000000,          // ms epoch; later generation wins on merge
  "values": {
    "sleep_hours": 7.42,
    "steps": 8241,
    "daylight_minutes": 34,
    "strength_sessions": 1,              // sessions that STARTED on this date
    "body_weight_kg": 81.2
  },
  "extras": {
    "sleepStart": "23:41"                // non-metric input for derived metrics
  }
}
```

**Rules**

- `values` keys are metric ids from `02-metrics.md`. Unknown keys are ignored and reported.
- `extras` may carry `sleepStart` (`'HH:MM'` local). `Day.extras` is part of the day document
  (`06-architecture.md` §4) and is only read by derived metrics.
- One ingest file per source per logical date. The producer owns its file; it may overwrite it
  during the day as data accrues. Merging uses `generatedAt`, so a recompute replaces the earlier
  payload.
- **Event files** (from NFC/shortcuts) are never overwritten. Their names are unique:
  `ingest/events/2026-10-17T21-30-04Z.creatine.json`, with the same envelope and a single value.
  Creation needs no `sha`, which is why it works from a Shortcut.
- Merging is idempotent: applying the same file twice changes nothing.
- A payload may never set `src: 'manual'` and may never modify `note`, `restDay`, or `settings`.
- A field already `locked: true` (human-edited) is never overwritten by an ingest.

**Merge precedence**

```
manual (locked)  >  shortcut event  >  apple_health  >  pc_collector  >  nothing
   (any newer ingest replaces an older ingest of the same metric)
```

---

## 2. Apple Health

### 2.1 Recommended path — Health Auto Export

iOS app that reads HealthKit on a schedule and POSTs JSON. Configure:

1. **Automations → Add Automation → Export Health Data → REST API.**
2. URL: `https://api.github.com/repos/{owner}/north-data/contents/ingest/{{date}}.health.json`
3. Method: `PUT`. Headers:
   `Authorization: Bearer <PAT>` · `Accept: application/vnd.github+json` ·
   `X-GitHub-Api-Version: 2022-11-28`
4. Body (GitHub Contents API):
   ```json
   { "message": "health {{date}}", "branch": "main", "content": "<base64 of the JSON below>" }
   ```
   The app supports a custom JSON template — set it to produce the envelope from §1 with
   `"source": "apple_health"`. Use the app's Base64/JSON options; if it cannot base64 the body,
   fall back to §2.2.
5. **Metrics to select** (exact HealthKit identifiers):

| Metric id | HealthKit type | Aggregation for the day |
|---|---|---|
| `sleep_hours` | `HKCategoryTypeIdentifierSleepAnalysis` | sum of intervals whose value is `Asleep*` (Core/Deep/REM/Unspecified), clipped to the sleep session that **ended** on this date |
| `steps` | `HKQuantityTypeIdentifierStepCount` | sum |
| `daylight_minutes` | `HKQuantityTypeIdentifierTimeInDaylight` | sum, in minutes |
| `body_weight_kg` | `HKQuantityTypeIdentifierBodyMass` | latest sample of the day, converted to kg |
| `strength_sessions` | `HKWorkout` | count of workouts starting on this date whose type ∈ {TraditionalStrengthTraining, FunctionalStrengthTraining, CrossTraining, HighIntensityIntervalTraining, CoreTraining} |

- `extras.sleepStart`: the earliest `Asleep` interval start of the session that ended on this date,
  as local `HH:MM`.
- Schedule: **06:00 daily** (covers the previous night) plus an **evening run at 21:00** (steps,
  daylight, workouts). Two runs matter: the morning one gets sleep right, the evening one gets the day right.
- If `HKQuantityTypeIdentifierTimeInDaylight` is unavailable (older watch/phone), the collector
  writes nothing and `daylight_days` simply drops out of the week score. Never substitute a guess.

Verify field names against the app's JSON preview before wiring the template; UI labels change
between versions. The importer in §2.2 is the ground truth for our envelope.

### 2.2 Free fallback — `automation/health/import.ts`

A Node script (no dependencies) that streams an Apple Health `export.xml`/`export.zip` and writes
one ingest file per day:

```bash
node automation/health/import.ts ./export.zip --out ./ingest --from 2026-01-01
```

Implementation notes:

- `export.zip` is read with a pure-JS inflate; if that is not worth the code, accept the
  uncompressed `export.xml` and document `unzip export.zip` first. **Prefer the documented unzip.**
- Stream-parse with a tag scanner (do not load the whole XML; real files exceed 500 MB). Match
  `<Record .../>` and `<Workout .../>` and read attributes only.
- Aggregate per **logical date with a 04:00 cutoff**, matching the app.
- Convert units: `<Record ... unit="lb">` → kg × 0.45359237; `mi` → not used.
- Sleep sessions that cross midnight are assigned to the logical date of the session **end**.
- Output one `ingest/<date>.health.json` per day, `generatedAt` = file mtime.
- Print a summary: days written, metrics per day, unmatched types ignored.

Run it monthly; it costs five minutes and gives a full historical backfill for the Trends screen.

---

## 3. PC collector (ActivityWatch)

Runs **only on the user's machine**. Nothing is installed on any server.

### 3.1 Setup

```bash
# ActivityWatch runs locally and exposes a REST API on :5600
# collector.north is a plain Node script on a systemd timer
~/.config/systemd/user/north-collector.service
~/.config/systemd/user/north-collector.timer      # every 10 minutes, OnBootSec=2min
```

`collector/activitywatch.ts`:

```
1. GET http://localhost:5600/api/0/buckets/
     → find aw-watcher-window_<host>, aw-watcher-afk_<host>
2. GET /api/0/buckets/<window>/events?start=<localDayStart ISO>&end=<now ISO>&limit=-1
3. GET /api/0/buckets/<afk>/events?start=…&end=…&limit=-1        (status: 'afk' | 'not-afk')
4. Drop every window event not overlapping a 'not-afk' interval.
5. Clamp all intervals to [dayStart, now]; merge overlapping intervals **within a category**;
   sum durations per category.
6. Emit and PUT ingest/<date>.pc.json
```

### 3.2 `categories.yaml` (local only, never uploaded)

```yaml
productive:
  apps:    [Code, "Code - Insiders", Obsidian, Alacritty, kitty, RStudio, julia, jupyter-lab]
  titles:  ["(Statistics|Anki|latex|paper|docs)", "(north|performance)"]      # regex, window titles
distracting:
  domains: [youtube.com, reddit.com, news.ycombinator.com, x.com, twitter.com,
            instagram.com, tiktok.com, twitch.tv, facebook.com]
  apps:    [Steam, Discord]
adult:
  domains: ["(porn|xxx|onlyfans|camgirl)"]                                     # regex, matched locally
  apps:    []
neutral: []            # everything unmatched
```

### 3.3 What leaves the machine

```json
{
  "schema": "north.ingest.v1",
  "source": "pc_collector",
  "date": "2026-10-17",
  "tz": "Europe/Berlin",
  "generatedAt": 1760700000000,
  "values": {
    "distraction_minutes": 71,
    "productive_minutes": 214,
    "learning_minutes": 96,
    "clean_day": true
  }
}
```

**Hard rule:** only these five numbers and the date. No window titles, no URLs, no app names, no
file paths, no screenshots. `learning_minutes` is `productive_minutes` restricted to the
`titles` patterns (used as the auto-signal for `learned`, never as the metric itself).

### 3.4 Failure modes

| Situation | Behaviour |
|---|---|
| ActivityWatch not running | collector logs and exits 0; `distraction_minutes` and `clean_day` stay missing that day |
| AFK bucket empty | treat all window time as active, but write `"confidence": "low"` and the app shows a muted note |
| Collector off for 3+ days | `deviceGap('distraction_min')` banner, days marked `partial` |
| Machine off all day | no file written; the field is simply missing, never zero |

---

## 4. Shortcuts and NFC

All recipes write an **event file** so no `sha` is needed:

```
PUT https://api.github.com/repos/{owner}/north-data/contents/ingest/events/<iso>.creatine.json
Headers: Authorization: Bearer <PAT>
Body: { "message": "<event>", "branch": "main", "content": "<base64 of the envelope>" }
```

### 4.1 Creatine (NFC tag on the tub)

Actions: `Get Current Date` → `Format Date` (`yyyy-MM-dd`) → `Text` (the envelope JSON, with the
date variable and `{"values":{"creatine":true}}`) → `Base64 Encode` → `Get Contents of URL`
(PUT, header `Authorization`, JSON body `{message, branch, content}`) → `Show Notification`
(`logged`). Turn **Ask Before Running** off.

### 4.2 Reading (NFC tag on the Kindle cover)

Identical, with `{"values":{"read":true}}`.

### 4.3 Learned-something note (Share Sheet)

`Receive Text` from the share sheet → `Text` (envelope with `{"values":{"learned":true},"note":"<input>"}`)
→ same PUT, file named `<iso>.learned.json`. Only the first 400 characters of the note are kept.

### 4.4 Evening prompt (time of day)

Personal Automation → **Time of Day** → 21:30 → `Open URLs` → the app URL. Optionally, a first
action `Get Contents of URL` checks whether today has coverage and, if not, shows a notification
first. Keep it to a single tap when possible.

### 4.5 Gym backup tag

Identical to 4.1 with `{"values":{"strength_sessions":1}}`. Redundant with Apple Health by design:
if the watch was not worn, the tap covers it.

### 4.6 Token

- Fine-grained PAT, `Contents: Read and write`, **only** the `north-data` repository, 1-year expiry.
- Stored in the Shortcut's header and in the app's IndexedDB. Nowhere else.
- Rotate annually; Settings shows the expiry when known and the app surfaces a `401` as
  `Token expired — replace it in Settings`.

---

## 5. Reconciliation

| Mechanism | Behaviour |
|---|---|
| Ingest ledger | `meta/ingest.json` records `{ file, source, date, appliedAt, fieldsChanged, fieldsSkipped }` |
| Settings → Automation | Last 10 ingests: source, date, what changed, `skipped (manual)` markers, and a `Re-apply all` action |
| Manual wins | Any human edit sets `locked: true`; later ingests are skipped for that field and reported |
| Recompute | Because producers overwrite their own daily file, a 22:00 run always replaces the 06:00 numbers |
| History | The whole thing is a git repository: every change is auditable and revertible with `git log -p` |
| Safety | If a pull would delete local values (remote file removed), nothing is deleted. Deletions are never automatic. |

---

## 6. What cannot be automated (say so plainly)

| Metric | Why | Decision |
|---|---|---|
| Kindle reading time | Amazon exposes no API; scraping breaks monthly | One tap, or an NFC tag |
| iPhone screen time | No public API; Screen Time is not exposed to Shortcuts | Two taps, coarse bins, at 21:30 |
| Protein, greens, alcohol | Interpretation, not measurement | Taps by design |
| Savings rate | Depends on what counts as saving | One monthly form |
| Sunlight accuracy | `TimeInDaylight` is a proxy, not a lab value | Weekly hit-rate, never a pass/fail day |

Do not build scrapers, OCR pipelines, or Accessibility-service hacks for these. The cost is
permanent and the benefit is one tap.
