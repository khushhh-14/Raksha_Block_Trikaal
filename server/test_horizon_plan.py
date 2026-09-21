from cp_sat_server import build_horizon_plan


def request(index: int, duration: int = 120) -> dict:
    return {
        "id": f"REQ-{index}",
        "department": "ENGINEERING",
        "section": "NDLS-GZB",
        "requestedDate": "2026-09-20",
        "requestedStartTime": "01:00",
        "requestedEndTime": "03:00",
        "durationMinutes": duration,
        "lineType": "DOUBLE",
        "machineryDeployed": [f"machine-{index % 3}"],
        "status": "PENDING",
        "mlRisk": 80 - index,
    }


plan = build_horizon_plan([request(index) for index in range(9)], 7, "2026-09-20", {"NDLS-GZB": 360})
assert plan["totalMinutesSaved"] > 0
assert any(day["bundledWindows"] for day in plan["dailyPlan"])

plan = build_horizon_plan([request(index) for index in range(25)], 7, "2026-09-20", {"NDLS-GZB": 360})
assert plan["solverStatus"] != "INFEASIBLE"

plan = build_horizon_plan([request(index, 60) for index in range(40)], 7, "2026-09-20", {"NDLS-GZB": 120})
assert len(plan["backlogUnscheduled"]) > 0
assert plan["solverStatus"] != "INFEASIBLE"

print("All horizon plan assertions passed")