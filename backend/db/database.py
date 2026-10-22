import os
import sqlite3
from contextlib import contextmanager
from typing import Generator

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "res_q.db")


def get_db_path() -> str:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return DB_PATH


@contextmanager
def get_db_connection() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(get_db_path(), timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Initialize database tables with schema and indices."""
    os.makedirs(os.path.dirname(get_db_path()), exist_ok=True)
    with get_db_connection() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS networks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            place_or_query TEXT,
            bbox_json TEXT,
            node_count INTEGER NOT NULL DEFAULT 0,
            edge_count INTEGER NOT NULL DEFAULT 0,
            file_path TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS scenarios (
            id TEXT PRIMARY KEY,
            network_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            is_active INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (network_id) REFERENCES networks(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS road_overrides (
            id TEXT PRIMARY KEY,
            scenario_id TEXT NOT NULL,
            edge_u INTEGER NOT NULL,
            edge_v INTEGER NOT NULL,
            edge_key INTEGER NOT NULL DEFAULT 0,
            way_id INTEGER,
            state TEXT NOT NULL CHECK(state IN ('OPEN', 'RESTRICTED', 'BLOCKED', 'HIGH_RISK', 'UNKNOWN')),
            closure_reason TEXT NOT NULL CHECK(closure_reason IN ('flooding', 'landslide', 'structural_damage', 'debris', 'fire', 'access_restriction', 'other', 'none')),
            risk_penalty REAL NOT NULL DEFAULT 2.0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
            UNIQUE(scenario_id, edge_u, edge_v, edge_key)
        );

        CREATE TABLE IF NOT EXISTS node_overrides (
            id TEXT PRIMARY KEY,
            scenario_id TEXT NOT NULL,
            node_id INTEGER NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('AVAILABLE', 'UNAVAILABLE')),
            reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
            UNIQUE(scenario_id, node_id)
        );

        CREATE TABLE IF NOT EXISTS hazards (
            id TEXT PRIMARY KEY,
            scenario_id TEXT NOT NULL,
            name TEXT NOT NULL,
            hazard_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            impact_mode TEXT NOT NULL CHECK(impact_mode IN ('BLOCK_ALL', 'HIGH_RISK', 'RESTRICTED')),
            risk_penalty REAL NOT NULL DEFAULT 5.0,
            geometry_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS emergency_facilities (
            id TEXT PRIMARY KEY,
            network_id TEXT NOT NULL,
            osm_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('hospital', 'fire_station', 'police', 'shelter', 'warehouse')),
            subcategory TEXT,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            address TEXT,
            phone TEXT,
            raw_tags_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (network_id) REFERENCES networks(id) ON DELETE CASCADE,
            UNIQUE(network_id, osm_id)
        );

        CREATE INDEX IF NOT EXISTS idx_scenarios_network ON scenarios(network_id);
        CREATE INDEX IF NOT EXISTS idx_road_overrides_scenario ON road_overrides(scenario_id);
        CREATE INDEX IF NOT EXISTS idx_node_overrides_scenario ON node_overrides(scenario_id);
        CREATE INDEX IF NOT EXISTS idx_hazards_scenario ON hazards(scenario_id);
        CREATE INDEX IF NOT EXISTS idx_facilities_network ON emergency_facilities(network_id);
        CREATE INDEX IF NOT EXISTS idx_facilities_category ON emergency_facilities(category);
        """)

