import csv
import os
import pickle
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from ortools.sat.python import cp_model

from server.cp_sat_server import build_horizon_plan, build_result, minutes_to_time


class OptimizationRequest(BaseModel):
    id: str
    department: str
    section: str
    date: str
    start_time: str
    duration_mins: int = Field(ge=1)
    line_type: str = ""
    machinery_deployed: list[str] = Field(default_factory=list)
    track_features: dict[str, float] = Field(default_factory=dict)
    days_overdue: int = 0
    severity: int = 1
    asset_age_years: float = 0
    past_failure_count: int = 0
    deferred_count: int = 0
    speed_restriction_kmh: float = 0


class OptimizationPayload(BaseModel):
    requests: list[OptimizationRequest] = Field(default_factory=list)
    premium_train_windows: list[dict[str, Any]] = Field(default_factory=list)
    delay_weight: float = 0.5
    affected_movements: list[dict[str, Any]] = Field(default_factory=list)


class HorizonPayload(BaseModel):
    requests: list[dict[str, Any]] = Field(default_factory=list)
    horizon_days: int
    anchor_date: str
    section_capacity: dict[str, int] = Field(default_factory=dict)
    premium_train_windows: list[dict[str, Any]] = Field(default_factory=list)
    delay_weight: float = 0.5
    affected_movements: list[dict[str, Any]] = Field(default_factory=list)


class SolvePayload(BaseModel):
    block_id: str = "BLOCK-UNASSIGNED"
    section: str = ""
    requested_start: str = "00:00"
    requested_end: str = "04:00"
    duration_hours: float = Field(default=1.0, gt=0)
    department: str = "ENGINEERING"
    machine_allocated: str = ""
    track_age: float = 0
    gmt: float = 0
    usfd_faults: float = 0
    tsr_active: bool = False
    features: dict[str, Any] = Field(default_factory=dict)


app = FastAPI(title="RAKSHA-BLOCK CP-SAT Solver", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "defect_priority_lgb.pkl"
RISK_MODEL: Any | None = None
try:
    try:
        import joblib
        RISK_MODEL = joblib.load(MODEL_PATH)
    except ImportError:
        with MODEL_PATH.open("rb") as model_file:
            RISK_MODEL = pickle.load(model_file)
except Exception as error:
    print(f"Risk model unavailable ({error}); using heuristic risk scoring.")


def parse_minutes(value: str) -> int:
    try:
        hours, minutes = value.split(":", 1)
        return max(0, min(1440, int(hours) * 60 + int(minutes)))
    except (AttributeError, TypeError, ValueError):
        return 0


def heuristic_risk(track_age: float, gmt: float, usfd_faults: float, tsr_active: bool) -> float:
    return min(1.0, max(0.05, track_age * 0.03 + gmt * 0.01 + usfd_faults * 0.15 + (1.0 if tsr_active else 0.0) * 0.2))


def solve_risk(payload: SolvePayload) -> float:
    features = payload.features or {}
    track_age = float(features.get("track_age", payload.track_age) or 0)
    gmt = float(features.get("gmt", payload.gmt) or 0)
    usfd_faults = float(features.get("usfd_faults", features.get("usfd_count", payload.usfd_faults)) or 0)
    tsr_active = bool(features.get("tsr_active", payload.tsr_active))
    if RISK_MODEL is not None:
        try:
            values = {"track_age": track_age, "gmt": gmt, "usfd_faults": usfd_faults, "tsr_active": tsr_active}
            prediction = RISK_MODEL.predict_proba([values])
            return float(max(0.05, min(1.0, prediction[0][-1])))
        except Exception:
            pass
    return heuristic_risk(track_age, gmt, usfd_faults, tsr_active)


def timetable_rows() -> list[dict[str, str]]:
    timetable_path = Path(__file__).resolve().parents[1] / "data" / "synthetic" / "section_timetable.csv"
    try:
        with timetable_path.open(newline="", encoding="utf-8") as timetable_file:
            return list(csv.DictReader(timetable_file))
    except OSError:
        return []


def solve_single_block(payload: SolvePayload) -> dict[str, Any]:
    duration = max(1, round(payload.duration_hours * 60))
    requested_start = parse_minutes(payload.requested_start)
    requested_end = max(requested_start + duration, parse_minutes(payload.requested_end))
    rows = [row for row in timetable_rows() if not payload.section or row.get("section", "").upper() == payload.section.upper()]
    movements = [(parse_minutes(row.get("arr_time", "00:00")), parse_minutes(row.get("dep_time", "00:00")), row.get("train_no", "")) for row in rows]
    candidates = list(range(0, max(1, 1440 - duration + 1), 15))
    model = cp_model.CpModel()
    selected = [model.NewBoolVar(f"candidate_{start}") for start in candidates]
    model.Add(sum(selected) == 1)
    delay_terms = []
    for index, start in enumerate(candidates):
        end = start + duration
        delay = sum(max(0, min(end, movement_end) - max(start, movement_start)) for movement_start, movement_end, _ in movements)
        delay_terms.append(delay * selected[index])
    risk_score = solve_risk(payload)
    objective_scale = 100
    model.Minimize(sum(delay_terms) * objective_scale - round(risk_score * 120 * payload.duration_hours * objective_scale) * sum(selected))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 2
    status = solver.Solve(model)
    chosen_index = next((index for index, variable in enumerate(selected) if solver.Value(variable)), 0)
    start = candidates[chosen_index]
    end = start + duration
    affected = [
        {"train_no": train_no, "delay_minutes": max(0, min(end, movement_end) - max(start, movement_start))}
        for movement_start, movement_end, train_no in movements
        if movement_start < end and movement_end > start
    ]
    machine = payload.machine_allocated or ("TRD Tower Wagon" if payload.department.upper() == "TRD" else "P-Way Maintenance Team")
    return {
        "status": "OPTIMAL" if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else "INFEASIBLE",
        "block_id": payload.block_id,
        "recommended_start": minutes_to_time(start),
        "recommended_end": minutes_to_time(end),
        "risk_score": round(risk_score, 6),
        "machine_allocated": machine,
        "gsr_compliant": all(item["delay_minutes"] == 0 for item in affected),
        "affected_trains": [item["train_no"] for item in affected],
        "delays_summary": {"total_delay_minutes": sum(item["delay_minutes"] for item in affected), "affected_count": len(affected), "train_delays": affected},
    }


def normalize_section(value: str) -> str:
    return "".join(value.upper().replace("SECTION", "").split())


def end_time(start_time: str, duration_mins: int) -> str:
    try:
        start = datetime.strptime(start_time, "%H:%M")
        return (start + timedelta(minutes=duration_mins)).strftime("%H:%M")
    except ValueError:
        return minutes_to_time(duration_mins)


def to_solver_request(request: OptimizationRequest) -> dict[str, Any]:
    return {
        "id": request.id,
        "department": request.department.upper().strip(),
        "section": normalize_section(request.section),
        "requestedDate": request.date,
        "requestedStartTime": request.start_time,
        "requestedEndTime": end_time(request.start_time, request.duration_mins),
        "durationMinutes": request.duration_mins,
        "lineType": request.line_type,
        "machineryDeployed": request.machinery_deployed,
        "track_features": request.track_features,
        "days_overdue": request.days_overdue,
        "severity": request.severity,
        "asset_age_years": request.asset_age_years,
        "past_failure_count": request.past_failure_count,
        "deferred_count": request.deferred_count,
        "speedRestrictionKmH": request.speed_restriction_kmh,
        "status": "PENDING",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "RAKSHA-BLOCK CP-SAT backend"}


@app.post("/api/v1/solve")
def solve(payload: SolvePayload) -> dict[str, Any]:
    return solve_single_block(payload)


@app.post("/api/optimize")
def optimize(payload: OptimizationPayload) -> dict[str, Any]:
    requests = [to_solver_request(request) for request in payload.requests]
    return build_result(requests, payload.premium_train_windows, payload.delay_weight, payload.affected_movements)


@app.post("/api/cp-sat/solve")
def solve_cp_sat(payload: OptimizationPayload) -> dict[str, Any]:
    """Canonical browser-facing route; retained alongside /api/optimize for compatibility."""
    return optimize(payload)


@app.post("/api/plan-horizon")
def plan_horizon(payload: HorizonPayload) -> dict[str, Any]:
    return build_horizon_plan(payload.requests, payload.horizon_days, payload.anchor_date, payload.section_capacity, payload.premium_train_windows, payload.delay_weight, payload.affected_movements)
