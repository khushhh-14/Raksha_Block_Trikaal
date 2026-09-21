from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timedelta
from itertools import combinations
import json
import math
import re
import sys
import os
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from ortools.sat.python import cp_model

HOST = "127.0.0.1"
PORT = 8000
ADJACENCY_MINUTES = 60
MAX_CANDIDATE_SIZE = 8
HORIZON_MAX_CANDIDATE_SIZE = 3
LATENESS_WEIGHT = 0.3
HORIZON_MAX_CANDIDATES = 2000
RISK_LAMBDA = float(os.environ.get("RISK_LAMBDA", "1.0"))
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "defect_priority_lgb.pkl"


def load_risk_model() -> Any | None:
    try:
        model = joblib.load(MODEL_PATH)
        print(f"Loaded LightGBM risk model from {MODEL_PATH}", file=sys.stderr)
        return model
    except Exception as error:
        print(f"Could not load LightGBM risk model: {error}; using deterministic fallback.", file=sys.stderr)
        return None


RISK_MODEL = load_risk_model()
RISK_MODEL_STATUS = "loaded" if RISK_MODEL is not None else "fallback"


def time_to_minutes(value: str) -> int:
    try:
        hours, minutes = value.split(":", 1)
        return int(hours) * 60 + int(minutes)
    except (AttributeError, ValueError):
        return 0


def minutes_to_time(value: int) -> str:
    normalized = value % 1440
    return f"{normalized // 60:02d}:{normalized % 60:02d}"

def normalize_solver_request(request: dict[str, Any]) -> dict[str, Any]:
    start = request.get("requestedStartTime", request.get("start_time", "00:00"))
    duration = int(request.get("durationMinutes", request.get("duration_mins", 60)) or 60)
    end = request.get("requestedEndTime") or minutes_to_time(time_to_minutes(start) + duration)
    return {
        **request,
        "id": request.get("id", "unknown"),
        "requestedDate": request.get("requestedDate", request.get("date", "")),
        "requestedStartTime": start,
        "requestedEndTime": end,
        "durationMinutes": duration,
        "lineType": request.get("lineType", request.get("line_type", "")),
        "machineryDeployed": request.get("machineryDeployed", request.get("machinery_deployed", [])),
        "status": request.get("status", "PENDING"),
    }


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower().replace("section", ""))


def normalized_window(request: dict[str, Any]) -> tuple[int, int]:
    start = time_to_minutes(request.get("requestedStartTime", "00:00"))
    end = time_to_minutes(request.get("requestedEndTime", "00:00"))
    if end <= start:
        end += 1440
    return start, end


def machinery(request: dict[str, Any]) -> set[str]:
    values = request.get("machineryDeployed") or []
    return {str(value).strip().lower() for value in values if str(value).strip()}


def track_features(request: dict[str, Any]) -> dict[str, float]:
    supplied = request.get("track_features") or request.get("features") or {}
    return {
        "track_degradation_index": float(supplied.get("track_degradation_index", request.get("track_degradation_index", request.get("severity", 0))) or 0),
        "gmt": float(supplied.get("gmt", request.get("gmt", 0)) or 0),
        "rail_age": float(supplied.get("rail_age", request.get("rail_age", request.get("asset_age_years", 0))) or 0),
        "usfd_count": float(supplied.get("usfd_count", request.get("usfd_count", request.get("past_failure_count", 0))) or 0),
        "surface_wear_index": float(supplied.get("surface_wear_index", request.get("surface_wear_index", request.get("deferred_count", 0))) or 0),
        "current_speed_restriction": float(supplied.get("current_speed_restriction", request.get("current_speed_restriction", request.get("speedRestrictionKmH", 0))) or 0),
    }


def risk_score(request: dict[str, Any]) -> float:
    features = track_features(request)
    if RISK_MODEL is not None:
        try:
            row = pd.DataFrame([{
                "severity": max(1, min(5, round(features["track_degradation_index"] or float(request.get("severity", 1))))),
                "days_overdue": max(0, round(float(request.get("days_overdue", 0) or 0))),
                "asset_age_years": features["rail_age"],
                "past_failure_count": features["usfd_count"],
                "deferred_count": features["surface_wear_index"],
                "department": request.get("department", "ENGINEERING"),
                "section": request.get("section", ""),
            }])
            return max(0.0, min(1.0, float(RISK_MODEL.predict_proba(row)[0][1])))
        except Exception as error:
            print(f"Risk inference failed for {request.get('id', 'unknown')}: {error}", file=sys.stderr)
    raw = (features["track_degradation_index"] / 5) * 0.30 + min(features["gmt"] / 100, 1) * 0.15 + min(features["rail_age"] / 45, 1) * 0.15 + min(features["usfd_count"] / 8, 1) * 0.20 + min(features["surface_wear_index"] / 6, 1) * 0.10 + min(features["current_speed_restriction"] / 120, 1) * 0.10
    return round(max(0.0, min(1.0, raw)), 6)


def request_machines(request: dict[str, Any]) -> set[str]:
    return {machine for machine in machinery(request) if any(token in machine for token in ("tamp", "ballast", "dgs", "bcm", "machine"))}


def machine_conflict(left: dict[str, Any], right: dict[str, Any]) -> bool:
    if not request_machines(left) & request_machines(right):
        return False
    left_start, left_end = normalized_window(left)
    right_start, right_end = normalized_window(right)
    transit = max(int(left.get("minimumSectionTransitMinutes", 60) or 60), int(right.get("minimumSectionTransitMinutes", 60) or 60))
    return left_start < right_end + transit and right_start < left_end + transit


def compatible(left: dict[str, Any], right: dict[str, Any]) -> bool:
    if normalize(left.get("section", "")) != normalize(right.get("section", "")):
        return False
    if (left.get("requestedDate") or "") != (right.get("requestedDate") or ""):
        return False
    if normalize(left.get("lineType", "")) != normalize(right.get("lineType", "")):
        return False
    if machinery(left) & machinery(right):
        return False

    left_start, left_end = normalized_window(left)
    right_start, right_end = normalized_window(right)
    return max(left_start, right_start) < min(left_end, right_end)


def candidate_is_valid(group: tuple[dict[str, Any], ...]) -> bool:
    return all(compatible(left, right) for left, right in combinations(group, 2))


def candidate_data(group: tuple[dict[str, Any], ...]) -> dict[str, Any]:
    windows = [normalized_window(request) for request in group]
    start = min(window[0] for window in windows)
    end = max(window[1] for window in windows)
    separate_duration = sum(max(1, int(request.get("durationMinutes") or (window[1] - window[0]))) for request, window in zip(group, windows))
    bundled_duration = end - start
    return {
        "requests": list(group),
        "start": start,
        "end": end,
        "separate_duration": separate_duration,
        "bundled_duration": bundled_duration,
        "saved": max(0, separate_duration - bundled_duration),
        "risk_score": max((risk_score(request) for request in group), default=0.0),
        "machine_sequence": [machine for request in group for machine in sorted(request_machines(request))],
    }


def priority_score(requests: list[dict[str, Any]]) -> tuple[int, str]:
    highest = "Routine"
    score = 40
    for request in requests:
        if request.get("urgencyLevel") == "Critical Emergency" or request.get("priority") == "SAFETY_CRITICAL":
            highest = "Critical Emergency"
            score = max(score, 95)
        elif request.get("urgencyLevel") == "Priority" or request.get("priority") == "URGENT":
            if highest != "Critical Emergency":
                highest = "Priority"
            score = max(score, 75)
    departments = {request.get("department") for request in requests}
    return min(100, score + max(0, len(departments) - 1) * 8), highest


def role_for(department: str) -> str:
    if department == "TRD":
        return "OHE 25kV Isolation & Earthing (First 15m) + Inspection"
    if department == "ST":
        return "Disconnection Memo + Point/Signal Gear Adjustment"
    if department == "ENGINEERING":
        return "Track Mechanical Packing & Alignment Stabilization"
    return "Lead Machine Operation"


def justification(requests: list[dict[str, Any]], departments: list[str]) -> str:
    department_set = set(departments)
    if {"ENGINEERING", "ST", "TRD"}.issubset(department_set):
        return "Tri-Department Integrated Mega Block: Synchronized P-Way, S&T, and 25kV OHE maintenance under one coordinated block window."
    if {"ENGINEERING", "TRD"}.issubset(department_set):
        return "Coordinated P-Way and 25kV Traction Window under a common power and traffic block."
    if {"ENGINEERING", "ST"}.issubset(department_set):
        return "Joint Permanent Way and Signalling Corridor with synchronized maintenance protection."
    if {"ST", "TRD"}.issubset(department_set):
        return "Combined S&T and Overhead Traction Maintenance under a common line block."
    return f"Synchronized Multi-Team Block: bundled {', '.join(departments)} maintenance activities."


def movement_delay_minutes(movement: dict[str, Any]) -> int:
    return 25 if str(movement.get("type", movement.get("train_type", ""))).lower() in {"freight", "goods", "goods freight"} else 12


def candidate_passenger_minutes(candidate: dict[str, Any], affected_movements: list[dict[str, Any]]) -> int:
    return sum(
        movement_delay_minutes(movement)
        for movement in affected_movements
        if normalize(movement.get("section", "")) == normalize(candidate["requests"][0].get("section", ""))
        and max(candidate["start"], time_to_minutes(movement.get("start_time_hhmm", movement.get("start", "00:00"))))
        < min(candidate["end"], time_to_minutes(movement.get("end_time_hhmm", movement.get("end", "00:00"))))
    )


def build_result(
    requests: list[dict[str, Any]],
    premium_train_windows: list[dict[str, Any]] | None = None,
    delay_weight: float = 0.5,
    affected_movements: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    pending = [request for request in requests if request.get("status") == "PENDING"]
    if not pending:
        return {
            "bundledWindows": [],
            "standaloneApproved": [],
            "totalBlockHoursSavedMinutes": 0,
            "totalBlockHoursSavedFormatted": "0 hrs",
            "percentHoursSaved": 0,
            "conflictReductionRatePercent": 0,
            "totalConflictsResolved": 0,
            "totalBundlesCreated": 0,
            "totalRequestsProcessed": 0,
            "hasOverlaps": False,
            "estimatedPassengerMinutesLost": 0,
            "delayWeightUsed": delay_weight,
            "riskModelStatus": RISK_MODEL_STATUS,
            "riskLambda": RISK_LAMBDA,
            "solverStatus": "EMPTY",
        }

    groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}
    for request in pending:
        key = (normalize(request.get("section", "")), request.get("requestedDate", ""), normalize(request.get("lineType", "")))
        groups.setdefault(key, []).append(request)

    premium_train_windows = premium_train_windows or []
    affected_movements = affected_movements or []
    candidates: list[dict[str, Any]] = []
    for group in groups.values():
        upper_size = min(MAX_CANDIDATE_SIZE, len(group))
        for size in range(2, upper_size + 1):
            for combination in combinations(group, size):
                if candidate_is_valid(combination):
                    data = candidate_data(combination)
                    blocked = any(
                        normalize(window.get("section", "")) == normalize(data["requests"][0].get("section", ""))
                        and (window.get("start_time_hhmm") or window.get("start"))
                        and max(
                            data["start"],
                            time_to_minutes(window.get("start_time_hhmm", window.get("start", "00:00"))),
                        ) < min(
                            data["end"],
                            time_to_minutes(window.get("end_time_hhmm", window.get("end", "00:00"))),
                        )
                        for window in premium_train_windows
                    )
                    if blocked:
                        continue
                    if data["saved"] > 0:
                        data["estimatedPassengerMinutesLost"] = candidate_passenger_minutes(data, affected_movements)
                        candidates.append(data)

    model = cp_model.CpModel()
    selected = [model.NewBoolVar(f"bundle_{index}") for index in range(len(candidates))]
    request_constraints: dict[str, list[Any]] = {request["id"]: [] for request in pending}
    for variable, candidate in zip(selected, candidates):
        for request in candidate["requests"]:
            request_constraints[request["id"]].append(variable)
    for variables in request_constraints.values():
        if variables:
            model.Add(sum(variables) <= 1)

    for left_index, left_candidate in enumerate(candidates):
        for right_index in range(left_index + 1, len(candidates)):
            right_candidate = candidates[right_index]
            if any(machine_conflict(left_request, right_request) for left_request in left_candidate["requests"] for right_request in right_candidate["requests"]):
                model.Add(selected[left_index] + selected[right_index] <= 1)

    model.Maximize(sum(variable * round((RISK_LAMBDA * candidate["risk_score"] * candidate["bundled_duration"] * 100) - (delay_weight * candidate["estimatedPassengerMinutesLost"] * 100) + candidate["saved"] * 10) for variable, candidate in zip(selected, candidates)))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5
    solver.parameters.num_search_workers = 8
    solver.parameters.log_search_progress = False
    solver_status = solver.Solve(model)

    selected_candidates = [candidate for variable, candidate in zip(selected, candidates) if solver.Value(variable) == 1]
    selected_ids = {request["id"] for candidate in selected_candidates for request in candidate["requests"]}
    bundled_windows: list[dict[str, Any]] = []
    for index, candidate in enumerate(selected_candidates, start=1):
        bundled_requests = candidate["requests"]
        departments = list(dict.fromkeys(request.get("department") for request in bundled_requests))
        score, urgency = priority_score(bundled_requests)
        duration = candidate["bundled_duration"]
        duration_formatted = f"{duration // 60}h {duration % 60}m ({duration} mins)" if duration >= 60 else f"{duration} mins"
        bundled_windows.append({
            "bundleId": f"AI-BUNDLE-2026-{index:03d}",
            "section": bundled_requests[0].get("section", ""),
            "date": bundled_requests[0].get("requestedDate", ""),
            "lineType": bundled_requests[0].get("lineType", ""),
            "startKm": bundled_requests[0].get("startKm", ""),
            "endKm": bundled_requests[-1].get("endKm", "") or bundled_requests[0].get("endKm", ""),
            "optimizedStartTime": minutes_to_time(candidate["start"]),
            "optimizedEndTime": minutes_to_time(candidate["end"]),
            "durationMinutes": duration,
            "durationFormatted": duration_formatted,
            "requests": bundled_requests,
            "departments": departments,
            "priorityScore": score,
            "urgencyLevel": urgency,
            "totalSeparateDurationMinutes": candidate["separate_duration"],
            "savedDetentionMinutes": candidate["saved"],
            "conflictsResolvedCount": len(bundled_requests) * (len(bundled_requests) - 1) // 2,
            "risk_score": candidate["risk_score"],
            "machine_sequence": candidate["machine_sequence"],
            "passenger_punctuality_impact_score": max(0.0, round(1 - candidate.get("estimatedPassengerMinutesLost", 0) / max(1, duration), 4)),
            "aiJustification": justification(bundled_requests, departments),
            "coordinationTasks": [
                {
                    "dept": request.get("department"),
                    "requestId": request.get("id"),
                    "workDescription": request.get("workCategory") or request.get("workDescription", ""),
                    "machinery": request.get("machineryDeployed") or [],
                    "roleInWindow": role_for(request.get("department", "")),
                }
                for request in bundled_requests
            ],
        })

    standalone = [{**request, "risk_score": risk_score(request), "machine_sequence": sorted(request_machines(request))} for request in pending if request["id"] not in selected_ids]
    total_separate = sum(max(1, int(request.get("durationMinutes") or 0)) for request in pending)
    total_optimized = sum(window["durationMinutes"] for window in bundled_windows) + sum(max(1, int(request.get("durationMinutes") or 0)) for request in standalone)
    saved = max(0, total_separate - total_optimized)
    conflicts = sum(window["conflictsResolvedCount"] for window in bundled_windows)
    compatible_pairs = sum(sum(1 for pair in combinations(group, 2) if compatible(pair[0], pair[1])) for group in groups.values())
    conflict_rate = round(conflicts / compatible_pairs * 100) if compatible_pairs else 0

    return {
        "bundledWindows": bundled_windows,
        "standaloneApproved": standalone,
        "totalBlockHoursSavedMinutes": saved,
        "totalBlockHoursSavedFormatted": f"{saved / 60:.1f} Hours ({saved} mins)",
        "percentHoursSaved": round(saved / total_separate * 100) if total_separate else 0,
        "conflictReductionRatePercent": conflict_rate,
        "totalConflictsResolved": conflicts,
        "totalBundlesCreated": len(bundled_windows),
        "totalRequestsProcessed": len(pending),
        "hasOverlaps": compatible_pairs > 0,
        "estimatedPassengerMinutesLost": sum(candidate["estimatedPassengerMinutesLost"] for candidate in selected_candidates),
        "delayWeightUsed": delay_weight,
        "riskModelStatus": RISK_MODEL_STATUS,
        "riskLambda": RISK_LAMBDA,
        "solverStatus": solver.StatusName(solver_status),
    }


def build_horizon_plan(
    requests: list[dict[str, Any]],
    horizon_days: int,
    anchor_date: str,
    section_capacity: dict[str, int] | None = None,
    premium_train_windows: list[dict[str, Any]] | None = None,
    delay_weight: float = 0.5,
    affected_movements: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if horizon_days not in (7, 30):
        raise ValueError("horizon_days must be 7 or 30")
    pending = [request for request in requests if request.get("status", "PENDING") == "PENDING"]
    capacities = {normalize(section): int(value) for section, value in (section_capacity or {}).items()}
    premium_train_windows = premium_train_windows or []
    affected_movements = affected_movements or []

    def risk_value(request: dict[str, Any]) -> int:
        return max(1, round(risk_score(request) * 100))

    def latest_day(request: dict[str, Any]) -> int:
        urgency = request.get("urgencyLevel")
        if urgency == "Critical Emergency" or request.get("priority") == "SAFETY_CRITICAL":
            return min(1, horizon_days - 1)
        if urgency == "Priority" or request.get("priority") == "URGENT":
            return min(6, horizon_days - 1)
        if urgency == "Routine" or request.get("priority"):
            return horizon_days - 1
        duration = int(request.get("durationMinutes") or 0)
        return min(horizon_days - 1, max(0, duration // 60))

    model = cp_model.CpModel()
    days = [model.NewIntVar(0, horizon_days - 1, f"day_{index}") for index in range(len(pending))]
    for variable, request in zip(days, pending):
        model.Add(variable <= latest_day(request))

    # Boolean reification keeps the per-section/per-night minute cap explicit while allowing day assignment.
    sections = {normalize(request.get("section", "")) for request in pending}
    assigned: dict[tuple[int, int], Any] = {}
    scheduled = [model.NewBoolVar(f"scheduled_{index}") for index in range(len(pending))]
    for index, variable in enumerate(days):
        for day_index in range(horizon_days):
            assigned[index, day_index] = model.NewBoolVar(f"assigned_{index}_{day_index}")
            model.Add(variable == day_index).OnlyEnforceIf(assigned[index, day_index])
            model.Add(variable != day_index).OnlyEnforceIf([scheduled[index], assigned[index, day_index].Not()])
        model.Add(sum(assigned[index, day_index] for day_index in range(horizon_days)) == scheduled[index])
        model.Add(variable <= latest_day(pending[index])).OnlyEnforceIf(scheduled[index])
    for section in sections:
        for day_index in range(horizon_days):
            load = sum(
                assigned[index, day_index] * max(1, int(request.get("durationMinutes") or 0))
                for index, request in enumerate(pending)
                if normalize(request.get("section", "")) == section
            )
            model.Add(load <= capacities.get(section, 360))

    # Same-day compatible requests are bundled using the existing machinery, line, and overlap rules.
    bundle_bonus: list[Any] = []
    bundle_data: list[tuple[Any, tuple[dict[str, Any], ...], dict[str, Any], int]] = []
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for request in pending:
        groups.setdefault((normalize(request.get("section", "")), normalize(request.get("lineType", ""))), []).append(request)
    request_index = {request["id"]: index for index, request in enumerate(pending)}
    candidate_count = 0
    for group in groups.values():
        group.sort(key=risk_value, reverse=True)
        candidate_group = group[:12]
        for size in range(2, min(HORIZON_MAX_CANDIDATE_SIZE, len(candidate_group)) + 1):
            for combination in combinations(group, size):
                if not candidate_is_valid(combination):
                    continue
                if candidate_count >= HORIZON_MAX_CANDIDATES:
                    break
                data = candidate_data(combination)
                bundle = model.NewBoolVar(f"horizon_bundle_{len(bundle_bonus)}")
                for item in combination:
                    model.Add(bundle <= scheduled[request_index[item["id"]]])
                for left, right in combinations(combination, 2):
                    model.Add(days[request_index[left["id"]]] == days[request_index[right["id"]]]).OnlyEnforceIf(bundle)
                passenger_minutes_lost = candidate_passenger_minutes(data, affected_movements)
                bundle_bonus.append(bundle * round((data["saved"] - delay_weight * passenger_minutes_lost) * 100))
                bundle_data.append((bundle, combination, data, passenger_minutes_lost))
                candidate_count += 1
            if candidate_count >= HORIZON_MAX_CANDIDATES:
                break
        if candidate_count >= HORIZON_MAX_CANDIDATES:
            break
    print(f"Horizon candidate count: {candidate_count}", file=sys.stderr)

    request_bundle_constraints: dict[str, list[Any]] = {request["id"]: [] for request in pending}
    for bundle, combination, _, _ in bundle_data:
        for request in combination:
            request_bundle_constraints[request["id"]].append(bundle)
    for variables in request_bundle_constraints.values():
        if variables:
            model.Add(sum(variables) <= 1)

    earliness = sum(
        assigned[index, day_index] * risk_value(request) * (horizon_days - 1 - day_index)
        for index, request in enumerate(pending)
        for day_index in range(horizon_days)
    )
    lateness = sum(days[index] * round(LATENESS_WEIGHT * risk_value(request)) for index, request in enumerate(pending))
    schedule_bonus = sum(scheduled) * 100000
    # A smaller lateness weight keeps the schedule-completion objective from swamping bundle savings.
    model.Maximize(schedule_bonus + earliness - lateness + sum(bundle_bonus))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    solver.parameters.num_search_workers = 8
    solver_status = solver.Solve(model)

    if solver_status in (cp_model.INFEASIBLE, cp_model.MODEL_INVALID):
        return {
            "horizonDays": horizon_days,
            "anchorDate": anchor_date,
            "dailyPlan": [],
            "totalRiskRetired": 0,
            "totalMinutesSaved": 0,
            "backlogUnscheduled": pending,
            "solverStatus": solver.StatusName(solver_status),
            "solveTimeMs": round(solver.WallTime() * 1000, 2),
            "estimatedPassengerMinutesLost": 0,
            "delayWeightUsed": delay_weight,
            "riskModelStatus": RISK_MODEL_STATUS,
        }

    selected_by_day: dict[int, list[dict[str, Any]]] = {day_index: [] for day_index in range(horizon_days)}
    for index, request in enumerate(pending):
        if solver.Value(scheduled[index]) == 1:
            selected_by_day[solver.Value(days[index])].append(request)
    daily_plan = []
    total_saved = 0
    total_risk = 0
    for day_index in range(horizon_days):
        day_requests = selected_by_day[day_index]
        bundled_windows = []
        bundled_ids: set[str] = set()
        for bundle, combination, data, _ in bundle_data:
            if solver.Value(bundle) == 1 and solver.Value(days[request_index[combination[0]["id"]]]) == day_index:
                departments = list(dict.fromkeys(item.get("department") for item in combination))
                score, urgency = priority_score(list(combination))
                bundled_windows.append({"section": combination[0].get("section", ""), "startTime": minutes_to_time(data["start"]), "endTime": minutes_to_time(data["end"]), "durationMinutes": data["bundled_duration"], "requests": list(combination), "departments": departments, "priorityScore": score, "urgencyLevel": urgency, "savedDetentionMinutes": data["saved"], "aiJustification": justification(list(combination), departments)})
                bundled_ids.update(item["id"] for item in combination)
                total_saved += data["saved"]
        standalone = [request for request in day_requests if request["id"] not in bundled_ids]
        for request in day_requests:
            total_risk += risk_value(request)
        loads: dict[str, int] = {}
        for request in day_requests:
            key = request.get("section", "")
            loads[key] = loads.get(key, 0) + max(1, int(request.get("durationMinutes") or 0))
        daily_plan.append({"date": (datetime.fromisoformat(anchor_date) + timedelta(days=day_index)).date().isoformat(), "dayIndex": day_index, "bundledWindows": bundled_windows, "standalone": standalone, "sectionLoadMinutes": loads, "capacityUtilisationPercent": {section: round(load / capacities.get(normalize(section), 360) * 100, 1) for section, load in loads.items()}})
    scheduled_ids = {request["id"] for requests_for_day in selected_by_day.values() for request in requests_for_day}
    estimated_passenger_minutes_lost = sum(
        passenger_minutes_lost
        for bundle, _, _, passenger_minutes_lost in bundle_data
        if solver.Value(bundle) == 1
    )
    return {"horizonDays": horizon_days, "anchorDate": anchor_date, "dailyPlan": daily_plan, "totalRiskRetired": total_risk, "totalMinutesSaved": total_saved, "backlogUnscheduled": [request for request in pending if request["id"] not in scheduled_ids], "solverStatus": solver.StatusName(solver_status), "solveTimeMs": round(solver.WallTime() * 1000, 2), "estimatedPassengerMinutesLost": estimated_passenger_minutes_lost, "delayWeightUsed": delay_weight, "riskModelStatus": RISK_MODEL_STATUS}


class SolverHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path not in ("/", "/health"):
            self.send_error(404)
            return
        body = json.dumps({
            "status": "ok",
            "service": "Raksha Block CP-SAT backend",
            "solver": "Google OR-Tools CP-SAT",
            "endpoint": "/api/cp-sat/solve",
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        if self.path != "/api/cp-sat/solve":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            requests = [normalize_solver_request(request) for request in payload.get("requests", [])]
            result = build_result(
                requests,
                payload.get("premium_train_windows", []),
                float(payload.get("delay_weight", 0.5)),
                payload.get("affected_movements", []),
            )
            body = json.dumps(result).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except Exception as error:
            body = json.dumps({"error": str(error)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[CP-SAT] {format % args}")


if __name__ == "__main__":
    print(f"CP-SAT service listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), SolverHandler).serve_forever()
