from datetime import datetime, timedelta
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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


app = FastAPI(title="RAKSHA-BLOCK CP-SAT Solver", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


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
