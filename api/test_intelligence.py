"""
The accuracy test.

Seven rows cannot validate a model statistically, and any accuracy percentage quoted off
them would be invented. What CAN be proved is that the module is deterministic, that
every verdict is arithmetic reproducible by hand, and that it fires on exactly the assets
it claims to. That is what this file pins.

    python -m pytest test_intelligence.py -q
"""
from __future__ import annotations
import json
import pathlib
from datetime import date

import pytest

import config as cfg
import intelligence
from schemas import Asset, Booking, TelemetrySnapshot

DATA = pathlib.Path(__file__).resolve().parent.parent / "data"


def _read(name: str) -> list:
    path = DATA / name
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else []


@pytest.fixture(scope="module")
def assets() -> list[Asset]:
    return [Asset(**{k: v for k, v in a.items() if not k.startswith("_")})
            for a in _read("seed_assets.json")]


@pytest.fixture(scope="module")
def telemetry() -> list[TelemetrySnapshot]:
    return [TelemetrySnapshot(**t) for t in _read("seed_telemetry.json")]


@pytest.fixture(scope="module")
def bookings() -> list[Booking]:
    return [Booking(**b) for b in _read("seed_bookings.json")]


@pytest.fixture
def conf() -> dict:
    return cfg.as_dict()


# ---- every rule, every asset, every rupee -----------------------------------
# rule_id, equipment_id, severity, est_value_inr
EXPECTED = [
    ("R1", "EQX1002", "CRITICAL", 440_000),
    ("R1", "EQX1007", "CRITICAL", 180_000),
    ("R2", "EQX1001", "CRITICAL", 195_652),
    ("R2", "EQX1004", "CRITICAL", 306_818),
    ("R2", "EQX1006", "WARNING",  144_000),
    ("R3", "EQX1002", "CRITICAL", 440_000),
    ("R3", "EQX1007", "CRITICAL", 180_000),
    ("R4", "EQX1004", "WARNING",  210_000),
    ("R5", "EQX1005", "WARNING",   18_000),
    ("R6", "EQX1001", "CRITICAL", 390_000),
    ("R6", "EQX1002", "CRITICAL", 946_000),
    ("R6", "EQX1007", "CRITICAL", 615_000),
    ("R7", "EQX1002", "WARNING",  220_000),
    ("R7", "EQX1007", "WARNING",   90_000),
    # "Remind users when return time is approaching" - the brief asks for the days
    # BEFORE the due date, not only after it. INFO and worth zero: nothing is lost yet,
    # which is the whole point of a reminder.
    ("R8", "EQX1004", "INFO",           0),
]


def test_exact_firing_set(assets, conf):
    found = sorted(
        (a.rule_id, a.equipment_id, a.severity, a.est_value_inr)
        for a in intelligence.find_anomalies(assets, conf)
    )
    assert found == sorted(EXPECTED)


def test_every_anomaly_ships_signals(assets, conf):
    for a in intelligence.find_anomalies(assets, conf):
        assert a.signals, f"{a.rule_id} on {a.equipment_id} shipped no evidence"
        for s in a.signals:
            assert s.field and s.value != ""


def test_no_synthetic_asset_raises_a_flag(assets, conf):
    """Every flag in the demo must trace to one of the seven given rows."""
    given = {a["equipment_id"] for a in _read("seed_assets_given.json")}
    flagged = {a.equipment_id for a in intelligence.find_anomalies(assets, conf)}
    assert flagged <= given, f"synthetic assets tripped rules: {flagged - given}"


def test_r2_does_not_double_charge_the_ghost_assets(assets, conf):
    """R3 owns zero-output; R2 firing there would bill the same rental line twice."""
    r2 = {a.equipment_id for a in intelligence.find_anomalies(assets, conf)
          if a.rule_id == "R2"}
    assert "EQX1002" not in r2 and "EQX1007" not in r2


# ---- the given rows are untouched -------------------------------------------
def test_due_soon_reminder_fires_before_the_due_date(assets, conf):
    """EQX1004 is due 2025-05-15 with the clock at 2025-05-12 - three days of warning."""
    r8 = [a for a in intelligence.find_anomalies(assets, conf) if a.rule_id == "R8"]
    assert [a.equipment_id for a in r8] == ["EQX1004"]
    assert r8[0].severity == "INFO"
    assert r8[0].est_value_inr == 0
    assert any(s.field == "days_until_return" and s.value == "3" for s in r8[0].signals)


def test_reminders_do_not_inflate_the_money(assets, conf):
    summary = intelligence.value_summary(intelligence.find_anomalies(assets, conf), conf)
    assert summary["total_exposure_inr"] == (
        summary["waste_inr"] + summary["recoverable_inr"] + summary["avoided_inr"])


def test_usage_summary_ranks_the_worst_site_first(assets, conf):
    """Total rented hours, usage per site, downtime - the brief asks for all three."""
    summary = intelligence.usage_summary(assets, conf)
    sites = summary["by_site"]
    assert sites[0]["site_id"] == "UNASSIGNED"          # the ghost assets, 0% utilisation
    assert sites[0]["utilisation_pct"] == 0.0
    assert sites == sorted(sites, key=lambda r: r["utilisation_pct"])
    for row in sites:
        assert row["downtime_hours"] == row["idle_hours"]
    fleet = summary["fleet"]
    assert fleet["assets"] == len(assets)
    assert fleet["rented_days"] == sum(a.operating_days for a in assets)


def test_seven_given_rows_pass_through_unchanged():
    given = _read("seed_assets_given.json")
    generated = _read("seed_assets.json")[:len(given)]
    assert generated == given


def test_history_reconciles_to_the_given_fields():
    """cumulative_operating_hours == engine_hours_day * operating_days, for all of them."""
    for a in _read("seed_assets.json"):
        assert abs(a["engine_hours_day"] * a["operating_days"]
                   - a["cumulative_operating_hours"]) < 0.05, a["equipment_id"]


# ---- availability ------------------------------------------------------------
def test_commits_the_idle_machine_not_the_returning_one(assets, conf):
    """EQX1007 sits unassigned with zero output. It should not wait behind EQX1004."""
    answer = intelligence.answer_availability(
        assets, "Excavator", "S003", date(2025, 5, 19), 10, conf)
    assert answer.can_commit is True
    assert answer.equipment_id == "EQX1007"
    assert answer.confidence == conf["confidence_at_yard"]
    assert answer.free_from <= date(2025, 5, 19)


def test_free_from_never_lands_in_the_past(assets, conf):
    """EQX1007 is on_rent with a check-in date six weeks gone."""
    now = date.fromisoformat(conf["now"])
    for a in assets:
        assert intelligence._free_from(a, conf, now) >= now


def test_impossible_date_declines_with_alternatives(assets, conf):
    answer = intelligence.answer_availability(
        assets, "Excavator", "S003", date(2025, 1, 1), 10, conf)
    assert answer.can_commit is False
    assert answer.alternatives, "a decline with no alternatives is a dead end"


def test_unknown_type_declines_cleanly(assets, conf):
    answer = intelligence.answer_availability(
        assets, "Submarine", "S003", date(2025, 5, 19), 10, conf)
    assert answer.can_commit is False


# ---- maintenance -------------------------------------------------------------
def test_coolant_trend_fires_on_eqx1005_only(assets, telemetry, conf):
    risks = intelligence.assess_maintenance(assets, telemetry, conf)
    assert [r.equipment_id for r in risks] == ["EQX1005"]
    r = risks[0]
    assert (r.spn, r.fmi) == (110, 0)                       # genuine SAE J1939
    assert r.current_temp_c > conf["coolant_warn_c"]
    assert r.slope > conf["coolant_slope_min"]
    assert r.days_to_failure > 0
    # days_to_failure must be the stated extrapolation, not a fudged number. The
    # tolerance absorbs the 2dp rounding applied to temp and slope before display.
    expected = (conf["coolant_failure_c"] - r.current_temp_c) / r.slope
    assert abs(r.days_to_failure - expected) < 0.05


def test_maintenance_survives_empty_telemetry(assets, conf):
    assert intelligence.assess_maintenance(assets, [], conf) == []


# ---- the money ---------------------------------------------------------------
def test_zero_output_recovery_claim_is_620k(assets, conf):
    """The pitch number: EQX1002 + EQX1007 rented at zero output."""
    summary = intelligence.value_summary(intelligence.find_anomalies(assets, conf), conf)
    waste = summary["by_asset"]["waste"]
    assert waste["EQX1002"] + waste["EQX1007"] == 620_000


def test_waste_is_deduplicated_per_asset(assets, conf):
    """R1 and R3 both charge EQX1002 the full rental line; it must count once."""
    summary = intelligence.value_summary(intelligence.find_anomalies(assets, conf), conf)
    assert summary["by_asset"]["waste"]["EQX1002"] == 440_000


def test_rate_card_is_live(assets, conf):
    """Move the rate on the settings screen and the money must move with it."""
    before = next(a for a in intelligence.find_anomalies(assets, conf)
                  if (a.rule_id, a.equipment_id) == ("R3", "EQX1007"))
    conf["day_rates"]["Excavator"] *= 2
    after = next(a for a in intelligence.find_anomalies(assets, conf)
                 if (a.rule_id, a.equipment_id) == ("R3", "EQX1007"))
    assert after.est_value_inr == before.est_value_inr * 2


def test_price_implied_basis_changes_the_crane(assets, conf):
    """Published card prices a Crane at 22,000; the catalogue ratio implies 18,000."""
    conf["rate_basis"] = "price_implied"
    r3 = next(a for a in intelligence.find_anomalies(assets, conf)
              if (a.rule_id, a.equipment_id) == ("R3", "EQX1002"))
    assert r3.est_value_inr == conf["day_rates_price_implied"]["Crane"] * 20


# ---- the whole bundle --------------------------------------------------------
def test_analyze_is_deterministic(assets, telemetry, bookings, conf):
    first = intelligence.analyze(assets, telemetry, bookings, conf)
    second = intelligence.analyze(assets, telemetry, bookings, conf)
    assert first.model_dump_json() == second.model_dump_json()


def test_analyze_survives_empty_inputs(assets, conf):
    bundle = intelligence.analyze(assets, [], [], conf)
    assert bundle.availability is None
    assert bundle.maintenance == []
    assert len(bundle.anomalies) == len(EXPECTED)


def test_no_wall_clock_anywhere():
    """
    The data is from 2025. One datetime.now() and every asset is a year overdue.

    Parsed rather than grepped: the module docstring says the words "No datetime.now()",
    and a substring search would flag its own house rules as a violation.
    """
    import ast

    tree = ast.parse(pathlib.Path(intelligence.__file__).read_text(encoding="utf-8"))
    banned = {("datetime", "now"), ("date", "today"), ("time", "time")}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            owner = getattr(node.func.value, "id", None)
            assert (owner, node.func.attr) not in banned, (
                f"line {node.lineno} calls the wall clock: {owner}.{node.func.attr}()"
            )
