# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""north — turn Apple's ``export.xml`` into a ``north.health.v1`` file.

Apple Health can export everything it knows as one XML file. On a real account
that file is around a gigabyte, and no browser tab will parse it, so this little
script does the one job instead and writes the small JSON the app imports by
hand (docs/V2.1.md §6):

    python3 server/health_export.py ~/apple_health_export/export.xml -o health.json

Then in the app: **Settings → Your data → Apple Health** → choose ``health.json``.

What it takes, and only this:

===========================  ======================================================
``HKQuantityTypeIdentifierStepCount``            summed per day
``HKCategoryTypeIdentifierSleepAnalysis``        asleep time summed per night, and
                                                 the earliest start as ``sleepStart``
``HKQuantityTypeIdentifierTimeInDaylight``       summed per day, in minutes
``HKQuantityTypeIdentifierBodyMass``             the day's last reading, in kg
``HKWorkoutActivityType*StrengthTraining``       one session each, per day
===========================  ======================================================

Nothing is invented, nothing is interpolated: a day with no records does not
appear in the output, and the app leaves it the gap it was. Nothing you typed
into the app is ever overwritten by an import (see ``src/lib/store/health.ts``).

It streams: ``iterparse`` reads the file element by element and each finished
record is dropped, so memory stays flat on a 900 MB export. It writes one file
and prints counts — no network, no telemetry, no copy of your data anywhere else.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

FORMAT = "north.health.v1"
DEFAULT_SOURCE = "apple-health-export"

STEPS = "HKQuantityTypeIdentifierStepCount"
SLEEP = "HKCategoryTypeIdentifierSleepAnalysis"
DAYLIGHT = "HKQuantityTypeIdentifierTimeInDaylight"
BODYMASS = "HKQuantityTypeIdentifierBodyMass"

# Apple's own value for "asleep", plus the newer core/deep/rem split.
ASLEEP = "HKCategoryValueSleepAnalysisAsleep"

LB_IN_KG = 0.45359237

# `2026-10-18 07:12:00 +0200`, or the same with a `T`. The offset is deliberately
# ignored: Apple writes wall-clock time, and the app's day is a wall-clock day.
STAMP = re.compile(r"^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})")


def local_stamp(value: str | None) -> datetime | None:
    """``'2026-10-18 07:12:00 +0200'`` → a naive *local* datetime, or None."""
    if not value:
        return None
    match = STAMP.match(value.strip())
    if not match:
        return None
    try:
        return datetime.fromisoformat(f"{match.group(1)}T{match.group(2)}")
    except ValueError:
        return None


def number(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def round2(value: float) -> float:
    return round(value, 2)


@dataclass
class Night:
    """One night's asleep time: the total, and when it started."""

    minutes: float = 0.0
    start: datetime | None = None


@dataclass
class Day:
    """Everything the export says about one calendar date."""

    steps: float = 0.0
    seen_steps: bool = False
    daylight: float = 0.0
    seen_daylight: bool = False
    weight_kg: float | None = None
    weight_at: datetime | None = None
    sessions: int = 0
    night: Night = field(default_factory=Night)

    def empty(self) -> bool:
        return not (
            self.seen_steps
            or self.seen_daylight
            or self.weight_kg is not None
            or self.sessions > 0
            or self.night.minutes > 0
        )


class Collector:
    """Fold records into days. Pure: hand it what the XML said, read ``days``."""

    def __init__(self) -> None:
        self.days: dict[str, Day] = {}
        self.records = 0
        self.ignored = 0
        self.skipped = 0

    def day(self, date: str) -> Day:
        return self.days.setdefault(date, Day())

    def record(
        self,
        rtype: str | None,
        value: str | None,
        unit: str | None,
        start: str | None,
        end: str | None,
    ) -> None:
        """One ``<Record>``. Unknown types are counted and ignored."""
        self.records += 1
        if rtype in (STEPS, DAYLIGHT, BODYMASS):
            self._quantity(rtype, value, unit, start, end)
        elif rtype == SLEEP:
            self._sleep(value, start, end)
        else:
            self.ignored += 1

    def _quantity(
        self, rtype: str, value: str | None, unit: str | None, start: str | None, end: str | None
    ) -> None:
        amount = number(value)
        at = local_stamp(end) or local_stamp(start)
        if amount is None or at is None:
            self.skipped += 1
            return
        day = self.day(at.date().isoformat())

        if rtype == STEPS:
            day.steps += amount
            day.seen_steps = True
        elif rtype == DAYLIGHT:
            day.daylight += amount
            day.seen_daylight = True
        else:  # body mass: worth keeping even in pounds
            kg = amount if (unit or "").lower() != "lb" else amount * LB_IN_KG
            if day.weight_at is None or at >= day.weight_at:
                day.weight_kg = round2(kg)
                day.weight_at = at

    def _sleep(self, value: str | None, start: str | None, end: str | None) -> None:
        if not (value or "").startswith(ASLEEP):
            return  # in bed, awake, or a nap timer: not sleep
        began, ended = local_stamp(start), local_stamp(end)
        if began is None or ended is None or ended <= began:
            self.skipped += 1
            return
        # The night belongs to the morning it ends: that is the day you woke up.
        night = self.day(ended.date().isoformat()).night
        night.minutes += (ended - began).total_seconds() / 60
        if night.start is None or began < night.start:
            night.start = began

    def workout(self, activity: str | None, start: str | None) -> None:
        """One ``<Workout>``. Only strength training counts, one session each."""
        if "StrengthTraining" not in (activity or ""):
            return
        began = local_stamp(start)
        if began is None:
            self.skipped += 1
            return
        self.day(began.date().isoformat()).sessions += 1

    def document(self, generated: str | None = None, source: str = DEFAULT_SOURCE) -> dict:
        """The ``north.health.v1`` file, oldest day first, empty days left out."""
        out: list[dict] = []
        for date in sorted(self.days):
            day = self.days[date]
            if day.empty():
                continue
            entry: dict = {"date": date}
            if day.night.minutes > 0:
                entry["sleepHours"] = round2(day.night.minutes / 60)
                if day.night.start is not None:
                    entry["sleepStart"] = day.night.start.strftime("%H:%M")
            if day.seen_steps:
                entry["steps"] = int(round(day.steps))
            if day.sessions > 0:
                entry["strengthSessions"] = day.sessions
            if day.seen_daylight:
                entry["daylightMinutes"] = int(round(day.daylight))
            if day.weight_kg is not None:
                entry["weightKg"] = day.weight_kg
            out.append(entry)

        return {
            "format": FORMAT,
            "generated": generated or datetime.now().astimezone().isoformat(timespec="seconds"),
            "source": source,
            "days": out,
        }


def convert(path: Path, *, source: str = DEFAULT_SOURCE, generated: str | None = None) -> dict:
    """Stream one Apple export into a ``north.health.v1`` document."""
    collector = Collector()
    context = ET.iterparse(str(path), events=("start", "end"))
    _, root = next(context)  # the <HealthData> element

    for event, element in context:
        if event != "end":
            continue
        if element.tag == "Record":
            collector.record(
                element.get("type"),
                element.get("value"),
                element.get("unit"),
                element.get("startDate"),
                element.get("endDate"),
            )
            # Finished records are dropped, so a 900 MB export never lands in RAM.
            root.clear()
        elif element.tag == "Workout":
            collector.workout(element.get("workoutActivityType"), element.get("startDate"))
            root.clear()

    return collector.document(generated=generated, source=source)


def describe(document: dict) -> str:
    """Counts only: what was written, never a value."""
    days = document["days"]
    counts: dict[str, int] = {}
    for day in days:
        for key in ("sleepHours", "sleepStart", "steps", "strengthSessions", "daylightMinutes", "weightKg"):
            if key in day:
                counts[key] = counts.get(key, 0) + 1
    span = f"{days[0]['date']} → {days[-1]['date']}" if days else "no days"
    parts = ", ".join(f"{name} {count}" for name, count in sorted(counts.items()))
    return f"{len(days)} days ({span}): {parts or 'nothing to write'}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert an Apple Health export.xml to a north.health.v1 file."
    )
    parser.add_argument("export", type=Path, help="path to apple_health_export/export.xml")
    parser.add_argument(
        "-o", "--out", type=Path, default=Path("north-health.json"), help="where to write the JSON"
    )
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="the file's `source` field")
    args = parser.parse_args(argv)

    if not args.export.is_file():
        print(f"no such file: {args.export}", file=sys.stderr)
        return 1

    document = convert(args.export, source=args.source)
    args.out.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {args.out} — {describe(document)}")
    print("Now import it in the app: Settings → Your data → Apple Health.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
