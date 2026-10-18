# docs

| Read this | For |
|---|---|
| **[V2.md](V2.md)** | **The live brief. Start here.** The dashboard design philosophy, what we work on now, and the Apple Health pipeline. |
| **[V2.1.md](V2.1.md)** | **The current milestone.** How the dashboard should look (tile grid, colour, charts), the `/preview` page, and the hand-import contract for Apple Health. |
| [spec/](spec/) | The v1 outline. Reference only — metrics, scoring maths, tokens and locked decisions. Superseded as a mandate by `V2.md`. |
| [spec/vision-v1.md](spec/vision-v1.md) | The owner's v1 brief: what each of the 19 metrics means and how it was logged. Still the clearest per-metric description. |

The spec files reference each other by bare filename (`02-metrics.md`), so they must stay in the
same folder.

## What the spec is still authoritative for

- `spec/02-metrics.md` — the 19 metrics, their targets, weights, units and copy. **Canonical.**
- `spec/03-scoring.md` — curves, coverage, bands, the worked examples.
- `spec/05-design.md` — tokens.
- `spec/09-decisions.md` — locked decisions, including the anti-patterns.

## What it is not authoritative for any more

- The shape of the home screen. V2 replaced the list with a dashboard.
- The milestone plan (`spec/08-build-plan.md`): M5 was cut down, M6–M9 are not planned.
- Anything about deployment: the site is self-hosted (`server/serve.py`). No GitHub Pages, no CI.
