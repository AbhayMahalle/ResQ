import math
import networkx as nx
import pytest
from shapely.geometry import LineString
from backend.graph.algorithms import (
    execute_routing,
    route_astar,
    route_bfs,
    route_dijkstra,
)
from backend.graph.snapper import snap_coordinate_to_accessible_node


@pytest.fixture
def synthetic_graph() -> nx.MultiDiGraph:
    """
    Construct a deterministic synthetic road network:
         (N1) ----[e1: len=100m, speed=30kph]----> (N2) ----[e2: len=100m, speed=30kph]----> (N3)
           |                                                                                     ^
           | [e3: len=40m, speed=30kph]                                                          | [e5: len=40m, speed=100kph]
           v                                                                                     |
         (N4) -----------------[e4: len=200m, speed=100kph]------------------------------------> (N5)
    Parallel edge on N1->N2: [e1_alt: len=150m]
    One-way edge N2->N1 is NOT present (directed graph).
    """
    G = nx.MultiDiGraph()

    # Coordinates in approx San Francisco area
    nodes = {
        1: {"x": -122.4200, "y": 37.7740},
        2: {"x": -122.4180, "y": 37.7740},
        3: {"x": -122.4160, "y": 37.7740},
        4: {"x": -122.4200, "y": 37.7720},
        5: {"x": -122.4160, "y": 37.7720},
    }

    for n, data in nodes.items():
        G.add_node(n, x=data["x"], y=data["y"])

    def make_edge(u, v, length, speed_kph, key=0, name="Road"):
        u_pt = (nodes[u]["x"], nodes[u]["y"])
        v_pt = (nodes[v]["x"], nodes[v]["y"])
        t_time = length / (speed_kph * 1000.0 / 3600.0)
        G.add_edge(
            u, v, key=key,
            length=length,
            speed_kph=speed_kph,
            travel_time=t_time,
            oneway=True,
            name=name,
            geometry=LineString([u_pt, v_pt])
        )

    # N1 -> N2 (primary edge and parallel edge)
    make_edge(1, 2, length=100.0, speed_kph=30.0, key=0, name="Main St")
    make_edge(1, 2, length=150.0, speed_kph=30.0, key=1, name="Main St Parallel")

    # N2 -> N3
    make_edge(2, 3, length=100.0, speed_kph=30.0, key=0, name="Main St East")

    # Detour path: N1 -> N4 -> N5 -> N3
    make_edge(1, 4, length=40.0, speed_kph=30.0, key=0, name="South Ave")
    make_edge(4, 5, length=200.0, speed_kph=100.0, key=0, name="Expressway")
    make_edge(5, 3, length=40.0, speed_kph=100.0, key=0, name="North Ramp")

    return G


def test_graph_construction(synthetic_graph: nx.MultiDiGraph):
    """Test MultiDiGraph construction, parallel edges, and directionality."""
    G = synthetic_graph
    assert G.number_of_nodes() == 5
    assert G.number_of_edges() == 6

    # Verify parallel edges between 1 and 2
    assert len(G[1][2]) == 2
    assert G[1][2][0]["length"] == 100.0
    assert G[1][2][1]["length"] == 150.0

    # Verify directionality (1->2 exists, 2->1 does not)
    assert G.has_edge(1, 2)
    assert not G.has_edge(2, 1)


def test_bfs_shortest_by_edge_count(synthetic_graph: nx.MultiDiGraph):
    """BFS must return the path with the fewest number of edges."""
    G = synthetic_graph
    res = route_bfs(G, start_node=1, target_node=3, is_edge_blocked_fn=lambda u, v, k: False, is_node_unavailable_fn=lambda n: False)
    assert res.status == "success"
    # Direct path N1->N2->N3 has 2 edges, whereas detour N1->N4->N5->N3 has 3 edges
    assert res.path_nodes == [1, 2, 3]
    assert len(res.path_edges) == 2


def test_dfs_rejected_as_unsupported(synthetic_graph: nx.MultiDiGraph):
    """DFS has been removed from ResQ and must be rejected with an informative error."""
    G = synthetic_graph
    with pytest.raises(ValueError, match="Algorithm 'dfs' has been removed"):
        execute_routing(G, start_node=1, target_node=3, algorithm="dfs")


def test_dijkstra_distance_vs_time(synthetic_graph: nx.MultiDiGraph):
    """
    Dijkstra distance optimization selects shortest meters (N1->N2->N3: 200m vs N1->N4->N5->N3: 280m).
    Dijkstra travel-time optimization selects faster path (Expressway detour: 40/8.3 + 200/27.8 + 40/27.8 = 4.8 + 7.2 + 1.4 = 13.4s vs 200/8.3 = 24.0s).
    """
    G = synthetic_graph

    # Distance optimization
    res_dist = route_dijkstra(
        G, 1, 3, "distance",
        is_edge_blocked_fn=lambda u, v, k: False,
        is_node_unavailable_fn=lambda n: False,
        get_edge_penalty_fn=lambda u, v, k: (1.0, False)
    )
    assert res_dist.status == "success"
    assert res_dist.path_nodes == [1, 2, 3]
    assert res_dist.total_distance_m == 200.0

    # Time optimization
    res_time = route_dijkstra(
        G, 1, 3, "time",
        is_edge_blocked_fn=lambda u, v, k: False,
        is_node_unavailable_fn=lambda n: False,
        get_edge_penalty_fn=lambda u, v, k: (1.0, False)
    )
    assert res_time.status == "success"
    assert res_time.path_nodes == [1, 4, 5, 3]
    assert res_time.total_distance_m == 280.0
    assert res_time.total_travel_time_s < res_dist.total_travel_time_s


def test_astar_optimality(synthetic_graph: nx.MultiDiGraph):
    """A* finds the exact optimal distance path and expands <= nodes."""
    G = synthetic_graph
    res_astar = route_astar(
        G, 1, 3, "distance",
        is_edge_blocked_fn=lambda u, v, k: False,
        is_node_unavailable_fn=lambda n: False,
        get_edge_penalty_fn=lambda u, v, k: (1.0, False)
    )
    assert res_astar.status == "success"
    assert res_astar.path_nodes == [1, 2, 3]
    assert res_astar.total_distance_m == 200.0


def test_blocked_edge_reroutes(synthetic_graph: nx.MultiDiGraph):
    """Blocking the primary road segment forces automatic rerouting via available detour."""
    G = synthetic_graph

    # Block edge (1, 2, 0) and parallel edge (1, 2, 1)
    def is_blocked(u, v, k):
        return u == 1 and v == 2

    res = execute_routing(
        G, 1, 3, algorithm="dijkstra", optimization="distance",
        is_edge_blocked_fn=is_blocked
    )
    assert res.status == "success"
    # Must detour through 4 and 5
    assert res.path_nodes == [1, 4, 5, 3]
    assert res.total_distance_m == 280.0


def test_no_route_when_disconnected(synthetic_graph: nx.MultiDiGraph):
    """When all outgoing paths are blocked, algorithm returns no_path_found and never fabricates routes."""
    G = synthetic_graph

    # Block both N1->N2 and N1->N4
    def is_blocked(u, v, k):
        return u == 1

    res = execute_routing(
        G, 1, 3, algorithm="dijkstra", optimization="distance",
        is_edge_blocked_fn=is_blocked
    )
    assert res.status == "no_path_found"
    assert res.path_nodes == []
    assert res.geometry is None


def test_unavailable_node_guard(synthetic_graph: nx.MultiDiGraph):
    """Inaccessible/unavailable start or destination node halts with clear status."""
    G = synthetic_graph
    res = execute_routing(
        G, 1, 3, algorithm="astar",
        is_node_unavailable_fn=lambda n: n == 1
    )
    assert res.status == "inaccessible_start"

    res_dest = execute_routing(
        G, 1, 3, algorithm="astar",
        is_node_unavailable_fn=lambda n: n == 3
    )
    assert res_dest.status == "inaccessible_target"


def test_snapping_accessible_and_inaccessible(synthetic_graph: nx.MultiDiGraph):
    """Test snapping to closest accessible node within distance limit."""
    G = synthetic_graph

    # Close to Node 2 (-122.4180, 37.7740)
    snap = snap_coordinate_to_accessible_node(G, lon=-122.41805, lat=37.77405, max_snap_distance_m=100.0)
    assert snap["accessible"] is True
    assert snap["node_id"] == 2
    assert snap["distance_m"] < 50.0

    # Very far away (> 500m)
    snap_far = snap_coordinate_to_accessible_node(G, lon=-122.4000, lat=37.7500, max_snap_distance_m=200.0)
    assert snap_far["accessible"] is False

