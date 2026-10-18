"""Tests for the Apple Health converter. Standard library only:

    uv run python -m unittest discover -s server

Every fixture here is synthetic — small XML written into a temp file. No real
export, and no personal value, is ever part of this repository.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "health_export", os.path.join(_HERE, "health_export.py")
)
assert _spec and _spec.loader
health_export = importlib.util.module_from_spec(_spec)
# Registered before exec so `@dataclass` can resolve its own module.
sys.modules["health_export"] = health_export
_spec.loader.exec_module(health_export)

HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="en_GB">\n'
TAIL = "</HealthData>\n"


def record(rtype: str, value: str, unit: str = "count", start: str = "", end: str = "") -> str:
    return (
        f'  <Record type="{rtype}" sourceName="Watch" unit="{unit}" '
        f'creationDate="{start or end}" startDate="{start}" endDate="{end}" value="{value}"/>\n'
    )


def workout(activity: str, start: str, end: str) -> str:
    return (
        f'  <Workout workoutActivityType="{activity}" duration="45" '
        f'startDate="{start}" endDate="{end}"/>\n'
    )


def convert(body: str, **kwargs: object) -> dict:
    """Write the fixture XML, convert it, hand back the document."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "export.xml"
        path.write_text(HEAD + body + TAIL, encoding="utf-8")
        return health_export.convert(path, generated="2026-01-01T00:00:00+00:00", **kwargs)


def days(document: dict) -> dict[str, dict]:
    return {day["date"]: day for day in document["days"]}


class StepsCase(unittest.TestCase):
    def test_sums_every_record_of_the_day_and_keeps_days_apart(self) -> None:
        body = (
            record("HKQuantityTypeIdentifierStepCount", "1200", start="2026-03-01 08:00:00 +0100", end="2026-03-01 09:00:00 +0100")
            + record("HKQuantityTypeIdentifierStepCount", "3400", start="2026-03-01 12:00:00 +0100", end="2026-03-01 13:00:00 +0100")
            + record("HKQuantityTypeIdentifierStepCount", "500", start="2026-03-02 08:00:00 +0100", end="2026-03-02 09:00:00 +0100")
        )
        out = days(convert(body))

        self.assertEqual(sorted(out), ["2026-03-01", "2026-03-02"])
        self.assertEqual(out["2026-03-01"]["steps"], 4600)
        self.assertEqual(out["2026-03-02"]["steps"], 500)

    def test_a_record_with_an_unreadable_date_is_skipped_not_crashed(self) -> None:
        body = record("HKQuantityTypeIdentifierStepCount", "900", start="not a date", end="")
        document = convert(body)
        self.assertEqual(document["days"], [])


class SleepCase(unittest.TestCase):
    def test_asleep_records_of_one_night_are_summed_into_the_waking_day(self) -> None:
        body = (
            # In bed and awake are not sleep; the two asleep blocks are.
            record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisInBed", "min", "2026-03-01 22:40:00 +0100", "2026-03-02 07:05:00 +0100")
            + record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAsleepCore", "min", "2026-03-01 23:00:00 +0100", "2026-03-02 02:30:00 +0100")
            + record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAwake", "min", "2026-03-02 02:30:00 +0100", "2026-03-02 02:45:00 +0100")
            + record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAsleepDeep", "min", "2026-03-02 02:45:00 +0100", "2026-03-02 06:00:00 +0100")
        )
        out = days(convert(body))

        self.assertEqual(sorted(out), ["2026-03-02"], "the night belongs to the day you woke")
        self.assertAlmostEqual(out["2026-03-02"]["sleepHours"], 6.75, places=2)
        self.assertEqual(out["2026-03-02"]["sleepStart"], "23:00")

    def test_the_legacy_asleep_value_counts_too(self) -> None:
        body = record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAsleep", "min", "2026-03-05 23:30:00 +0100", "2026-03-06 07:00:00 +0100")
        out = days(convert(body))
        self.assertAlmostEqual(out["2026-03-06"]["sleepHours"], 7.5, places=2)

    def test_a_zero_length_or_backwards_stretch_is_skipped(self) -> None:
        body = record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAsleep", "min", "2026-03-07 07:00:00 +0100", "2026-03-07 06:00:00 +0100")
        self.assertEqual(convert(body)["days"], [])


class DaylightCase(unittest.TestCase):
    def test_minutes_in_daylight_are_summed(self) -> None:
        body = (
            record("HKQuantityTypeIdentifierTimeInDaylight", "12", "min", "2026-03-01 09:00:00 +0100", "2026-03-01 09:12:00 +0100")
            + record("HKQuantityTypeIdentifierTimeInDaylight", "25", "min", "2026-03-01 15:00:00 +0100", "2026-03-01 15:25:00 +0100")
        )
        self.assertEqual(days(convert(body))["2026-03-01"]["daylightMinutes"], 37)


class WeightCase(unittest.TestCase):
    def test_the_days_last_reading_wins(self) -> None:
        body = (
            record("HKQuantityTypeIdentifierBodyMass", "81.4", "kg", "2026-03-01 07:00:00 +0100", "2026-03-01 07:00:00 +0100")
            + record("HKQuantityTypeIdentifierBodyMass", "81.1", "kg", "2026-03-01 21:00:00 +0100", "2026-03-01 21:00:00 +0100")
        )
        self.assertEqual(days(convert(body))["2026-03-01"]["weightKg"], 81.1)

    def test_pounds_are_converted_to_kilograms(self) -> None:
        body = record("HKQuantityTypeIdentifierBodyMass", "180", "lb", "2026-03-01 07:00:00 +0100", "2026-03-01 07:00:00 +0100")
        self.assertEqual(days(convert(body))["2026-03-01"]["weightKg"], 81.65)


class WorkoutCase(unittest.TestCase):
    def test_only_strength_training_counts_as_a_session(self) -> None:
        body = (
            workout("HKWorkoutActivityTypeTraditionalStrengthTraining", "2026-03-01 18:00:00 +0100", "2026-03-01 18:45:00 +0100")
            + workout("HKWorkoutActivityTypeRunning", "2026-03-01 07:00:00 +0100", "2026-03-01 07:30:00 +0100")
            + workout("HKWorkoutActivityTypeFunctionalStrengthTraining", "2026-03-03 18:00:00 +0100", "2026-03-03 18:50:00 +0100")
        )
        out = days(convert(body))

        self.assertEqual(sorted(out), ["2026-03-01", "2026-03-03"])
        self.assertEqual(out["2026-03-01"]["strengthSessions"], 1)
        self.assertEqual(out["2026-03-03"]["strengthSessions"], 1)


class DocumentCase(unittest.TestCase):
    def test_the_file_is_the_contract_and_the_days_are_sorted(self) -> None:
        body = record("HKQuantityTypeIdentifierStepCount", "100", start="2026-03-09 08:00:00 +0100", end="2026-03-09 09:00:00 +0100") + record(
            "HKQuantityTypeIdentifierStepCount", "200", start="2026-03-02 08:00:00 +0100", end="2026-03-02 09:00:00 +0100"
        )
        document = convert(body)

        self.assertEqual(document["format"], "north.health.v1")
        self.assertEqual(document["generated"], "2026-01-01T00:00:00+00:00")
        self.assertEqual([day["date"] for day in document["days"]], ["2026-03-02", "2026-03-09"])

    def test_a_day_with_nothing_to_say_does_not_appear(self) -> None:
        # A record on the 1st only: the 2nd is a gap, and stays one.
        body = record("HKQuantityTypeIdentifierStepCount", "100", start="2026-03-01 08:00:00 +0100", end="2026-03-01 09:00:00 +0100")
        self.assertEqual([day["date"] for day in convert(body)["days"]], ["2026-03-01"])

    def test_every_field_is_optional_and_a_full_day_carries_them_all(self) -> None:
        body = (
            record("HKQuantityTypeIdentifierStepCount", "12000", start="2026-03-01 08:00:00 +0100", end="2026-03-01 21:00:00 +0100")
            + record("HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAsleepCore", "min", "2026-02-28 23:10:00 +0100", "2026-03-01 06:40:00 +0100")
            + record("HKQuantityTypeIdentifierTimeInDaylight", "40", "min", "2026-03-01 12:00:00 +0100", "2026-03-01 12:40:00 +0100")
            + record("HKQuantityTypeIdentifierBodyMass", "80.5", "kg", "2026-03-01 07:00:00 +0100", "2026-03-01 07:00:00 +0100")
            + workout("HKWorkoutActivityTypeTraditionalStrengthTraining", "2026-03-01 18:00:00 +0100", "2026-03-01 18:45:00 +0100")
        )
        entry = days(convert(body))["2026-03-01"]

        self.assertEqual(
            sorted(entry),
            ["date", "daylightMinutes", "sleepHours", "sleepStart", "steps", "strengthSessions", "weightKg"],
        )

    def test_unknown_records_are_counted_and_ignored(self) -> None:
        body = record("HKQuantityTypeIdentifierHeartRate", "62", "count/min", start="2026-03-01 08:00:00 +0100", end="2026-03-01 08:00:00 +0100")
        self.assertEqual(convert(body)["days"], [])


class MainCase(unittest.TestCase):
    def test_main_writes_the_file_and_reports_counts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "export.xml"
            source.write_text(
                HEAD
                + record("HKQuantityTypeIdentifierStepCount", "4000", start="2026-03-01 08:00:00 +0100", end="2026-03-01 09:00:00 +0100")
                + TAIL,
                encoding="utf-8",
            )
            out = Path(tmp) / "health.json"
            code = health_export.main([str(source), "-o", str(out)])

            self.assertEqual(code, 0)
            document = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(document["format"], "north.health.v1")
            self.assertEqual(document["source"], "apple-health-export")
            self.assertEqual(document["days"][0]["steps"], 4000)

    def test_main_says_so_when_the_export_is_missing(self) -> None:
        self.assertEqual(health_export.main(["/nope/export.xml"]), 1)


if __name__ == "__main__":
    unittest.main()
