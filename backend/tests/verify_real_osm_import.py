import os
import sys
import networkx as nx
from backend.db.database import init_db
from backend.graph.importer import import_osm_road_network
from backend.graph.manager import graph_manager
from backend.graph.algorithms import execute_routing

def test_real_osm_import():
    print("--- Testing Real OpenStreetMap Road Network Import ---")
    init_db()

    # Import small real bounded area around Bern city center (46.9480, 7.4474), dist=500m
    lat, lon = 46.9480, 7.4474
    dist_m = 500.0

    print(f"Importing genuine OSM road network around ({lat}, {lon}) with radius {dist_m}m...")
    metadata = import_osm_road_network(
        name="Test Verification Area",
        point=[lat, lon],
        distance_m=dist_m,
        network_type="drive",
    )

    print("Import succeeded!")
    print(f"Network ID: {metadata['id']}")
    print(f"Nodes count: {metadata['node_count']}")
    print(f"Edges count: {metadata['edge_count']}")
    print(f"Bounding box: {metadata['bbox']}")

    assert metadata["node_count"] > 10, "Expected > 10 nodes in real network"
    assert metadata["edge_count"] > 10, "Expected > 10 edges in real network"

    # Test loading from GraphManager
    G = graph_manager.get_base_graph(metadata["id"])
    assert G.number_of_nodes() == metadata["node_count"]

    # Test routing on the real graph between first and another reachable node
    node_ids = list(G.nodes())
    start = node_ids[0]
    # Find a connected target
    target = None
    for n in node_ids[1:]:
        if nx.has_path(G, start, n):
            target = n
            break

    if target is not None:
        route_res = execute_routing(G, start, target, algorithm="dijkstra", optimization="distance")
        print(f"Calculated real route from {start} to {target}:")
        print(f"  Status: {route_res.status}")
        print(f"  Distance: {route_res.total_distance_m} m")
        print(f"  Path nodes: {len(route_res.path_nodes)}")
        assert route_res.status == "success"
        assert len(route_res.path_nodes) >= 2
    else:
        print("Note: First node had no reachable target; graph has multiple weakly connected components.")

    print("=== Real OSM Import Verification Passed Successfully ===")

if __name__ == "__main__":
    test_real_osm_import()

