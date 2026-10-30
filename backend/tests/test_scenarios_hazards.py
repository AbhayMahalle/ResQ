import json
import os
import networkx as nx
import pytest
from shapely.geometry import LineString, Polygon
from backend.db.database import get_db_connection, init_db
from backend.graph.effective_graph import EffectiveGraphView
from backend.graph.geometry_utils import create_circle_polygon
from backend.graph.manager import graph_manager
from backend.routers.closures import apply_road_closure, bulk_remove_road_closures, list_closures, remove_road_closure
from backend.routers.hazards import create_hazard, delete_hazard
from backend.routers.routes import calculate_route, compare_routes
from backend.routers.scenarios import (
    activate_scenario,
    create_scenario,
    duplicate_scenario,
    list_scenarios,
    reset_scenario,
)
from backend.schemas.models import (
    BulkRemoveClosuresRequest,
    HazardCreate,
    RoadOverrideCreate,
    RouteRequest,
    ScenarioCreate,
)


@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    """Point database to a temporary directory for isolation."""
    test_db = str(tmp_path / "test_res_q.db")
    monkeypatch.setattr("backend.db.database.DB_PATH", test_db)
    init_db()
    yield


@pytest.fixture
def registered_network() -> str:
    """Create and register a synthetic test network in graph_manager and DB."""
    net_id = "test_net_01"
    G = nx.MultiDiGraph()
    nodes = {
        10: {"x": -122.4200, "y": 37.7740},
        20: {"x": -122.4180, "y": 37.7740},
        30: {"x": -122.4160, "y": 37.7740},
        40: {"x": -122.4200, "y": 37.7720},
        50: {"x": -122.4160, "y": 37.7720},
    }
    for n, d in nodes.items():
        G.add_node(n, x=d["x"], y=d["y"])

    def add_edge(u, v, length, way_id, oneway=False):
        geom = LineString([(nodes[u]["x"], nodes[u]["y"]), (nodes[v]["x"], nodes[v]["y"])])
        G.add_edge(u, v, key=0, length=length, osmid=way_id, name="Test Rd", oneway=oneway, geometry=geom, speed_kph=40.0)
        if not oneway:
            G.add_edge(v, u, key=0, length=length, osmid=way_id, name="Test Rd", oneway=oneway, geometry=geom, speed_kph=40.0)

    # Road 1: 10 <-> 20 (Way 100)
    add_edge(10, 20, 100.0, 100)
    # Road 2: 20 <-> 30 (Way 101)
    add_edge(20, 30, 100.0, 101)
    # Detour Road: 10 <-> 40 <-> 50 <-> 30 (Way 200)
    add_edge(10, 40, 50.0, 200)
    add_edge(40, 50, 150.0, 200)
    add_edge(50, 30, 50.0, 200)

    graph_manager.register_graph(net_id, G)

    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO networks (id, name, place_or_query, bbox_json, node_count, edge_count, file_path)
            VALUES (?, 'Test Network', 'Synthetic', '[]', ?, ?, '')
            """,
            (net_id, G.number_of_nodes(), G.number_of_edges())
        )
        conn.execute(
            """
            INSERT INTO scenarios (id, network_id, name, description, version, is_active)
            VALUES ('scen_base_01', ?, 'Baseline', 'Baseline graph', 1, 1)
            """,
            (net_id,)
        )

    return net_id


def test_base_graph_immutability(registered_network: str):
    """Applying road closures in a scenario must never mutate the base graph."""
    net_id = registered_network
    base_g = graph_manager.get_base_graph(net_id)
    edge_count_before = base_g.number_of_edges()

    # Create new scenario
    scen = create_scenario(ScenarioCreate(network_id=net_id, name="Flood 2026", description="Severe flooding"))
    scen_id = scen.id

    # Apply road closure
    apply_road_closure(scen_id, RoadOverrideCreate(
        edge_u=10, edge_v=20, edge_key=0, scope="both_directions", state="BLOCKED", closure_reason="flooding"
    ))

    # Base graph remains completely intact and unmuted
    assert base_g.number_of_edges() == edge_count_before
    assert base_g.has_edge(10, 20)
    assert base_g.has_edge(20, 10)

    # But effective view marks it as blocked
    view = graph_manager.get_effective_view(net_id, scen_id)
    assert view.is_edge_blocked(10, 20, 0)
    assert view.is_edge_blocked(20, 10, 0)


def test_scenario_duplication_and_reset(registered_network: str):
    """Test scenario duplication retains overrides, and reset cleans them."""
    net_id = registered_network
    scen = create_scenario(ScenarioCreate(network_id=net_id, name="Earthquake", description="Fault line"))
    scen_id = scen.id

    apply_road_closure(scen_id, RoadOverrideCreate(
        edge_u=20, edge_v=30, scope="edge", state="BLOCKED", closure_reason="structural_damage"
    ))

    # Duplicate scenario
    dup = duplicate_scenario(scen_id, new_name="Earthquake Branch")
    dup_view = graph_manager.get_effective_view(net_id, dup.id)
    assert dup_view.is_edge_blocked(20, 30, 0)

    # Reset original scenario
    reset_scenario(scen_id)
    reset_view = graph_manager.get_effective_view(net_id, scen_id)
    assert not reset_view.is_edge_blocked(20, 30, 0)

    # Duplicated scenario still retains the block (scenarios are independent)
    dup_view2 = graph_manager.get_effective_view(net_id, dup.id)
    assert dup_view2.is_edge_blocked(20, 30, 0)


def test_hazard_geometric_intersection(registered_network: str):
    """
    Test hazard zone circle/polygon intersecting specific road edges.
    Edges inside the hazard are blocked, while external roads remain open.
    """
    net_id = registered_network
    scen = create_scenario(ScenarioCreate(network_id=net_id, name="Chemical Spill", description="Toxic plume"))
    scen_id = scen.id

    # Place a hazard circle around Node 20 (-122.4180, 37.7740) with radius 120m
    hazard_geom = {
        "type": "Circle",
        "center": [-122.4180, 37.7740],
        "radius_m": 120.0,
    }

    haz_resp = create_hazard(scen_id, HazardCreate(
        name="Plume Alpha",
        hazard_type="chemical_spill",
        severity="critical",
        impact_mode="BLOCK_ALL",
        geometry=hazard_geom,
    ))

    assert haz_resp.affected_edges_count >= 2  # Intersects 10<->20 and 20<->30

    view = graph_manager.get_effective_view(net_id, scen_id)
    # 10->20 and 20->30 are blocked by hazard
    assert view.is_edge_blocked(10, 20, 0)
    assert view.is_edge_blocked(20, 30, 0)

    # Detour road 10->40->50->30 is outside the hazard zone and remains open!
    assert not view.is_edge_blocked(10, 40, 0)
    assert not view.is_edge_blocked(40, 50, 0)
    assert not view.is_edge_blocked(50, 30, 0)


def test_route_recalculation_and_comparison(registered_network: str):
    """
    Test dynamic recalculation after scenario closure:
    compares baseline route (200m) with detour route (250m) and verifies stats.
    """
    net_id = registered_network
    scen = create_scenario(ScenarioCreate(network_id=net_id, name="Landslide", description="Mountain slip"))
    scen_id = scen.id

    start_pt = [-122.4200, 37.7740]  # Node 10
    dest_pt = [-122.4160, 37.7740]   # Node 30

    # 1. Baseline route
    base_res = calculate_route(RouteRequest(
        network_id=net_id,
        scenario_id="scen_base_01",
        start_coords=start_pt,
        destination_coords=dest_pt,
        algorithm="dijkstra",
        optimization="distance",
    ))
    assert base_res.status == "success"
    assert base_res.path_nodes == [10, 20, 30]
    assert base_res.total_distance_m == 200.0

    # 2. Block 10->20
    apply_road_closure(scen_id, RoadOverrideCreate(
        edge_u=10, edge_v=20, scope="both_directions", state="BLOCKED", closure_reason="landslide"
    ))

    # 3. Compare routes
    comp = compare_routes(RouteRequest(
        network_id=net_id,
        scenario_id=scen_id,
        start_coords=start_pt,
        destination_coords=dest_pt,
        algorithm="dijkstra",
        optimization="distance",
    ))

    assert comp.is_rerouted is True
    assert comp.original_route_valid is False
    assert comp.scenario_route.status == "success"
    assert comp.scenario_route.path_nodes == [10, 40, 50, 30]
    assert comp.scenario_route.total_distance_m == 250.0
    assert comp.distance_difference_m == 50.0
    assert comp.percentage_increase == 25.0


def test_bulk_remove_road_closures(registered_network):
    """Verify that multiple segments of a road can be bulk reopened at once."""
    net_id = registered_network
    scen = create_scenario(ScenarioCreate(network_id=net_id, name="Bulk Closure Test"))
    scen_id = scen.id

    # 1. Apply closure to both directions (creates 2 segment overrides)
    closures = apply_road_closure(
        scen_id,
        RoadOverrideCreate(
            edge_u=10,
            edge_v=20,
            way_id=100,
            scope="both_directions",
            state="BLOCKED",
            closure_reason="flooding",
            notes="Test Arterial Rd",
        ),
    )
    assert len(closures) == 2
    assert all(c.notes == "Test Arterial Rd" for c in closures)

    # 2. Bulk remove by override IDs
    override_ids = [c.id for c in closures]
    res = bulk_remove_road_closures(
        scen_id,
        BulkRemoveClosuresRequest(override_ids=override_ids),
    )
    assert res["reopened_count"] == 2

    # Verify no closures remain
    remaining = list_closures(scen_id)
    assert len(remaining) == 0


