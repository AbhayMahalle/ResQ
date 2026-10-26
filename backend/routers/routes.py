from typing import Any, Dict
from fastapi import APIRouter, HTTPException
from backend.graph.algorithms import execute_routing
from backend.graph.manager import graph_manager
from backend.graph.snapper import snap_coordinate_to_accessible_node
from backend.schemas.models import (
    RouteComparisonResponse,
    RouteRequest,
    RouteResponse,
    SnappedPoint,
)

from backend.db.database import get_db_connection

router = APIRouter(prefix="/api/routes", tags=["Routing"])


def _make_snap_error_message(label: str, lon: float, lat: float, dist_m: float, network_id: str) -> str:
    if dist_m > 2000.0:
        km = dist_m / 1000.0
        net_name = "the active road network"
        try:
            with get_db_connection() as conn:
                row = conn.execute("SELECT name FROM networks WHERE id = ?", (network_id,)).fetchone()
                if row:
                    net_name = f"'{row['name']}'"
        except Exception:
            pass
        return (
            f"{label} point ({lat:.4f}°, {lon:.4f}°) is {km:,.1f} km away from {net_name}. "
            f"The loaded road network covers a different geographic region. "
            f"Please switch to a road network for this area or import roads here in the Roads tab."
        )
    return f"{label} location is too far ({dist_m:.0f}m) from any accessible road or is completely isolated by closures."


@router.post("/snap")
def snap_point(network_id: str, lon: float, lat: float, scenario_id: str = None, max_dist_m: float = 1500.0) -> SnappedPoint:
    """Snap a coordinate to the nearest accessible road node."""
    try:
        base_g = graph_manager.get_base_graph(network_id)
        view = graph_manager.get_effective_view(network_id, scenario_id)
        snapped = snap_coordinate_to_accessible_node(
            base_g,
            lon=lon,
            lat=lat,
            max_snap_distance_m=max_dist_m,
            is_node_unavailable_fn=view.is_node_unavailable,
            is_edge_blocked_fn=view.is_edge_blocked,
        )
        return SnappedPoint(**snapped)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/calculate", response_model=RouteResponse)
def calculate_route(req: RouteRequest) -> RouteResponse:
    """
    Calculate route between start and destination using selectable Dijkstra, A*, or BFS.
    Snaps coordinates, respects directed edges, one-way roads, scenario closures, and hazards.
    """
    try:
        base_g = graph_manager.get_base_graph(req.network_id)
        view = graph_manager.get_effective_view(req.network_id, req.scenario_id)

        # Snap start coordinate
        snap_start = snap_coordinate_to_accessible_node(
            base_g,
            lon=req.start_coords[0],
            lat=req.start_coords[1],
            max_snap_distance_m=req.max_snap_distance_m,
            is_node_unavailable_fn=view.is_node_unavailable,
            is_edge_blocked_fn=view.is_edge_blocked,
        )

        # Snap destination coordinate
        snap_dest = snap_coordinate_to_accessible_node(
            base_g,
            lon=req.destination_coords[0],
            lat=req.destination_coords[1],
            max_snap_distance_m=req.max_snap_distance_m,
            is_node_unavailable_fn=view.is_node_unavailable,
            is_edge_blocked_fn=view.is_edge_blocked,
        )

        snapped_start_model = SnappedPoint(**snap_start)
        snapped_dest_model = SnappedPoint(**snap_dest)
        if not snap_start["accessible"]:
            msg = _make_snap_error_message("Start", req.start_coords[0], req.start_coords[1], snap_start["distance_m"], req.network_id)
            return RouteResponse(
                status="inaccessible_start",
                message=msg,
                algorithm=req.algorithm,
                optimization=req.optimization,
                snapped_start=snapped_start_model,
                snapped_destination=snapped_dest_model,
            )

        if not snap_dest["accessible"]:
            msg = _make_snap_error_message("Destination", req.destination_coords[0], req.destination_coords[1], snap_dest["distance_m"], req.network_id)
            return RouteResponse(
                status="inaccessible_target",
                message=msg,
                algorithm=req.algorithm,
                optimization=req.optimization,
                snapped_start=snapped_start_model,
                snapped_destination=snapped_dest_model,
            )

        start_node = snap_start["node_id"]
        dest_node = snap_dest["node_id"]

        # Run routing algorithm
        routing_res = execute_routing(
            G=base_g,
            start_node=start_node,
            target_node=dest_node,
            algorithm=req.algorithm,
            optimization=req.optimization,
            is_edge_blocked_fn=view.is_edge_blocked,
            is_node_unavailable_fn=view.is_node_unavailable,
            get_edge_penalty_fn=view.get_edge_penalty,
        )

        res_dict = routing_res.to_dict()
        res_dict["snapped_start"] = snapped_start_model
        res_dict["snapped_destination"] = snapped_dest_model
        return RouteResponse(**res_dict)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Routing calculation failed: {str(e)}")


@router.post("/compare", response_model=RouteComparisonResponse)
def compare_routes(req: RouteRequest) -> RouteComparisonResponse:
    """
    Compare baseline route against scenario route to evaluate detour impact:
    distance difference, travel time increase, percentage increase, and validity.
    """
    try:
        # Calculate baseline route (no scenario overrides)
        base_req = RouteRequest(
            network_id=req.network_id,
            scenario_id=None,
            start_coords=req.start_coords,
            destination_coords=req.destination_coords,
            algorithm=req.algorithm,
            optimization=req.optimization,
            max_snap_distance_m=req.max_snap_distance_m,
        )
        baseline_res = calculate_route(base_req)

        # Calculate scenario route
        scenario_res = calculate_route(req)

        if baseline_res.status != "success" and scenario_res.status != "success":
            return RouteComparisonResponse(
                baseline_route=baseline_res,
                scenario_route=scenario_res,
                is_rerouted=False,
                original_route_valid=False,
                summary="Neither baseline nor scenario route could be established.",
            )

        if baseline_res.status == "success" and scenario_res.status != "success":
            return RouteComparisonResponse(
                baseline_route=baseline_res,
                scenario_route=scenario_res,
                is_rerouted=True,
                original_route_valid=False,
                summary="Baseline route is severed by closures; no alternative route exists under active scenario.",
            )

        # Both routes exist
        b_dist = baseline_res.total_distance_m
        s_dist = scenario_res.total_distance_m
        diff_dist = round(s_dist - b_dist, 2)
        pct_increase = round((diff_dist / b_dist) * 100.0, 1) if b_dist > 0 else 0.0

        b_time = baseline_res.total_travel_time_s
        s_time = scenario_res.total_travel_time_s
        diff_time = round(s_time - b_time, 1) if (b_time is not None and s_time is not None) else None

        # Check if original baseline edges are still intact under current scenario
        view = graph_manager.get_effective_view(req.network_id, req.scenario_id)
        original_valid = True
        for edge in baseline_res.path_edges:
            if view.is_edge_blocked(edge.u, edge.v, edge.key):
                original_valid = False
                break

        is_rerouted = (abs(diff_dist) > 1.0 or not original_valid or baseline_res.path_nodes != scenario_res.path_nodes)

        if not is_rerouted:
            summary = "Route is unaffected by active scenario closures."
        elif diff_dist >= 0:
            summary = f"Route diverted: +{diff_dist:.0f}m (+{pct_increase:.1f}% distance)"
            if diff_time is not None and diff_time > 0:
                summary += f", +{diff_time:.0f}s travel time"
        else:
            summary = f"Alternative route found: {s_dist:.0f}m"

        return RouteComparisonResponse(
            baseline_route=baseline_res,
            scenario_route=scenario_res,
            is_rerouted=is_rerouted,
            original_route_valid=original_valid,
            distance_difference_m=diff_dist,
            percentage_increase=pct_increase,
            travel_time_difference_s=diff_time,
            summary=summary,
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Route comparison failed: {str(e)}")

