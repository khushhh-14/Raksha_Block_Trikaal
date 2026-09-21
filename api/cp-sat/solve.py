from http.server import BaseHTTPRequestHandler
from itertools import combinations
import json


def minutes(value: str) -> int:
    try:
        hours, mins = value.split(":", 1)
        return int(hours) * 60 + int(mins)
    except (AttributeError, ValueError):
        return 0


def time_text(value: int) -> str:
    value %= 1440
    return f"{value // 60:02d}:{value % 60:02d}"


def normalize(request: dict) -> dict:
    start = request.get("requestedStartTime", request.get("start_time", "00:00"))
    duration = int(request.get("durationMinutes", request.get("duration_mins", 60)) or 60)
    return {**request, "id": str(request.get("id", "")), "department": str(request.get("department", "")).upper(), "section": str(request.get("section", "")).strip().upper(), "requestedDate": request.get("requestedDate", request.get("date", "")), "requestedStartTime": start, "requestedEndTime": request.get("requestedEndTime", time_text(minutes(start) + duration)), "durationMinutes": duration, "lineType": request.get("lineType", request.get("line_type", "")), "machineryDeployed": request.get("machineryDeployed", request.get("machinery_deployed", [])), "status": request.get("status", "PENDING")}


def risk(request: dict) -> float:
    features = request.get("track_features") or {}
    value = min(float(features.get("track_degradation_index", 0) or 0) / 5, 1) * 0.30 + min(float(features.get("gmt", 0) or 0) / 100, 1) * 0.15 + min(float(features.get("rail_age", 0) or 0) / 45, 1) * 0.15 + min(float(features.get("usfd_count", 0) or 0) / 8, 1) * 0.20 + min(float(features.get("surface_wear_index", 0) or 0) / 6, 1) * 0.10 + min(float(features.get("current_speed_restriction", 0) or 0) / 120, 1) * 0.10
    return round(max(0.0, min(1.0, value)), 6)


def compatible(left: dict, right: dict) -> bool:
    if (left["section"], left["requestedDate"], left["lineType"]) != (right["section"], right["requestedDate"], right["lineType"]):
        return False
    if {str(item).lower() for item in left["machineryDeployed"]} & {str(item).lower() for item in right["machineryDeployed"]}:
        return False
    return max(minutes(left["requestedStartTime"]), minutes(right["requestedStartTime"])) < min(minutes(left["requestedEndTime"]), minutes(right["requestedEndTime"]))


def solve(requests: list[dict]) -> dict:
    pending = [normalize(request) for request in requests if request.get("status", "PENDING") == "PENDING"]
    bundles = []
    used: set[str] = set()
    for group in combinations(pending, 2):
        if not compatible(*group) or any(item["id"] in used for item in group):
            continue
        start = min(minutes(item["requestedStartTime"]) for item in group)
        end = max(minutes(item["requestedEndTime"]) for item in group)
        group_requests = [{**item, "risk_score": risk(item), "machine_sequence": item["machineryDeployed"]} for item in group]
        departments = list(dict.fromkeys(item["department"] for item in group))
        bundle_id = f"VERCEL-BUNDLE-{len(bundles) + 1:03d}"
        bundles.append({"bundleId": bundle_id, "section": group[0]["section"], "date": group[0]["requestedDate"], "lineType": group[0]["lineType"], "startKm": group[0].get("startKm", ""), "endKm": group[-1].get("endKm", ""), "optimizedStartTime": time_text(start), "optimizedEndTime": time_text(end), "durationMinutes": end - start, "durationFormatted": f"{end - start} mins", "requests": group_requests, "departments": departments, "priorityScore": 40, "urgencyLevel": "Routine", "totalSeparateDurationMinutes": sum(item["durationMinutes"] for item in group), "savedDetentionMinutes": max(0, sum(item["durationMinutes"] for item in group) - (end - start)), "conflictsResolvedCount": 1, "risk_score": max(risk(item) for item in group), "machine_sequence": [machine for item in group for machine in item["machineryDeployed"]], "passenger_punctuality_impact_score": 1.0, "aiJustification": "Serverless compatible multi-department window; full CP-SAT is available through the FastAPI solver.", "coordinationTasks": []})
        used.update(item["id"] for item in group)
    standalone = [{**item, "risk_score": risk(item), "machine_sequence": item["machineryDeployed"]} for item in pending if item["id"] not in used]
    return {"bundledWindows": bundles, "standaloneApproved": standalone, "totalBlockHoursSavedMinutes": sum(bundle["savedDetentionMinutes"] for bundle in bundles), "totalBlockHoursSavedFormatted": "0 hrs", "percentHoursSaved": 0, "conflictReductionRatePercent": 0, "totalConflictsResolved": len(bundles), "totalBundlesCreated": len(bundles), "totalRequestsProcessed": len(pending), "hasOverlaps": bool(bundles), "estimatedPassengerMinutesLost": 0, "delayWeightUsed": 0.5, "riskModelStatus": "serverless-fallback", "riskLambda": 1.0, "solverStatus": "FEASIBLE_SERVERLESS_FALLBACK"}


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            self._send_json(200, solve(payload.get("requests", [])))
        except Exception as error:
            self._send_json(500, {"error": str(error)})
