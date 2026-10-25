import math
from typing import Any, Dict, List, Optional, Tuple


def calculate_bearing(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Calculate forward azimuth / bearing in degrees [0, 360)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)

    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)

    bearing = math.degrees(math.atan2(y, x))
    return (bearing + 360.0) % 360.0


def get_bearing_name(bearing: float) -> str:
    """Convert bearing degrees to cardinal direction."""
    directions = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]
    idx = int((bearing + 22.5) / 45.0) % 8
    return directions[idx]


def determine_turn_type(prev_bearing: float, next_bearing: float) -> Tuple[str, str]:
    """
    Calculate relative turn angle and return turn type and verbal descriptor.
    """
    diff = (next_bearing - prev_bearing + 540.0) % 360.0 - 180.0

    if abs(diff) <= 25.0:
        return "straight", "Continue straight"
    elif 25.0 < diff <= 60.0:
        return "slight_right", "Slight right"
    elif 60.0 < diff <= 125.0:
        return "turn_right", "Turn right"
    elif 125.0 < diff <= 165.0:
        return "sharp_right", "Sharp right"
    elif diff > 165.0 or diff < -165.0:
        return "uturn", "Make a U-turn"
    elif -60.0 <= diff < -25.0:
        return "slight_left", "Slight left"
    elif -125.0 <= diff < -60.0:
        return "turn_left", "Turn left"
    else:
        return "sharp_left", "Sharp left"


def generate_maneuver_instructions(
    path_edges: List[Dict[str, Any]],
    default_speed_kph: float = 30.0,
) -> List[Dict[str, Any]]:
    """
    Generate turn-by-turn navigation instructions from genuine road geometry and names.
    Consolidates continuous segments on the same named road.
    """
    if not path_edges:
        return []

    raw_steps: List[Dict[str, Any]] = []

    for i, edge in enumerate(path_edges):
        road_name = edge.get("name")
        if not road_name or road_name == "None" or not isinstance(road_name, str):
            road_name = "unnamed road"

        length_m = float(edge.get("length_m") or 0.0)
        travel_time_s = float(edge.get("travel_time_s") or (length_m / (default_speed_kph / 3.6)))

        geometry = edge.get("geometry", [])
        if len(geometry) >= 2:
            start_pt = geometry[0]
            end_pt = geometry[-1]
            bearing = calculate_bearing(start_pt[0], start_pt[1], end_pt[0], end_pt[1])
        else:
            bearing = 0.0
            start_pt = [0.0, 0.0]

        raw_steps.append({
            "road_name": road_name,
            "length_m": length_m,
            "travel_time_s": travel_time_s,
            "bearing": bearing,
            "point": start_pt,
        })

    # Consolidate sequential steps with the same road name
    consolidated_steps: List[Dict[str, Any]] = []
    current_step: Optional[Dict[str, Any]] = None

    for step in raw_steps:
        if current_step is None:
            current_step = {
                "road_name": step["road_name"],
                "distance_m": step["length_m"],
                "duration_s": step["travel_time_s"],
                "bearing": step["bearing"],
                "point": step["point"],
            }
        elif current_step["road_name"].lower() == step["road_name"].lower():
            current_step["distance_m"] += step["length_m"]
            current_step["duration_s"] += step["travel_time_s"]
            # update bearing towards the end
            current_step["bearing"] = step["bearing"]
        else:
            consolidated_steps.append(current_step)
            current_step = {
                "road_name": step["road_name"],
                "distance_m": step["length_m"],
                "duration_s": step["travel_time_s"],
                "bearing": step["bearing"],
                "point": step["point"],
            }

    if current_step is not None:
        consolidated_steps.append(current_step)

    # Build final maneuver instructions with explicit turn maneuvers
    instructions: List[Dict[str, Any]] = []
    prev_bearing: Optional[float] = None

    for i, c_step in enumerate(consolidated_steps):
        r_name = c_step["road_name"]
        dist = round(c_step["distance_m"], 1)
        dur = round(c_step["duration_s"], 1)
        pt = c_step["point"]

        if i == 0:
            cardinal = get_bearing_name(c_step["bearing"])
            instruction_text = (
                f"Head {cardinal} on {r_name}"
                if r_name != "unnamed road"
                else f"Head {cardinal}"
            )
            turn_type = "start"
        else:
            turn_type, action_word = determine_turn_type(prev_bearing, c_step["bearing"])
            instruction_text = (
                f"{action_word} onto {r_name}"
                if r_name != "unnamed road"
                else f"{action_word}"
            )

        instructions.append({
            "step_index": i + 1,
            "instruction": instruction_text,
            "turn_type": turn_type,
            "road_name": r_name,
            "distance_m": dist,
            "duration_s": dur,
            "point": pt,
        })

        prev_bearing = c_step["bearing"]

    # Final arrival step
    last_pt = path_edges[-1].get("geometry", [[0, 0]])[-1]
    instructions.append({
        "step_index": len(instructions) + 1,
        "instruction": "Arrive at destination",
        "turn_type": "arrive",
        "road_name": consolidated_steps[-1]["road_name"] if consolidated_steps else "destination",
        "distance_m": 0.0,
        "duration_s": 0.0,
        "point": last_pt,
    })

    return instructions

