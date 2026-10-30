import pytest
from backend.graph.navigation_engine import (
    calculate_bearing,
    determine_turn_type,
    generate_maneuver_instructions,
    get_bearing_name,
)
from backend.routers.search import calculate_haversine


def test_calculate_bearing_and_cardinal():
    # North
    b_north = calculate_bearing(0.0, 0.0, 0.0, 1.0)
    assert round(b_north) == 0
    assert get_bearing_name(b_north) == "north"

    # East
    b_east = calculate_bearing(0.0, 0.0, 1.0, 0.0)
    assert round(b_east) == 90
    assert get_bearing_name(b_east) == "east"

    # South
    b_south = calculate_bearing(0.0, 1.0, 0.0, 0.0)
    assert round(b_south) == 180
    assert get_bearing_name(b_south) == "south"

    # West
    b_west = calculate_bearing(1.0, 0.0, 0.0, 0.0)
    assert round(b_west) == 270
    assert get_bearing_name(b_west) == "west"


def test_determine_turn_type():
    # Straight (0 to 25 deg diff)
    turn, desc = determine_turn_type(0.0, 10.0)
    assert turn == "straight"

    # Turn right (~90 deg diff)
    turn, desc = determine_turn_type(0.0, 90.0)
    assert turn == "turn_right"

    # Turn left (~ -90 deg diff or 270)
    turn, desc = determine_turn_type(90.0, 0.0)
    assert turn == "turn_left"

    # U-turn (~180 deg diff)
    turn, desc = determine_turn_type(0.0, 180.0)
    assert turn == "uturn"


def test_generate_maneuver_instructions():
    edges = [
        {
            "name": "Main Street",
            "length_m": 150.0,
            "travel_time_s": 15.0,
            "geometry": [[73.85, 18.46], [73.85, 18.47]],
        },
        {
            "name": "Oak Avenue",
            "length_m": 200.0,
            "travel_time_s": 20.0,
            "geometry": [[73.85, 18.47], [73.86, 18.47]],
        },
    ]

    instructions = generate_maneuver_instructions(edges)
    assert len(instructions) == 3  # Start, turn, arrive
    assert instructions[0]["turn_type"] == "start"
    assert "Main Street" in instructions[0]["instruction"]
    assert instructions[1]["turn_type"] == "turn_right"
    assert "Oak Avenue" in instructions[1]["instruction"]
    assert instructions[2]["turn_type"] == "arrive"


def test_haversine_distance():
    # Distance between (0,0) and (0, 1 deg lat) ~ 111.19 km = 111195 m
    dist = calculate_haversine(0.0, 0.0, 1.0, 0.0)
    assert 111000.0 < dist < 112000.0

