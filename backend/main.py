import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from backend.db.database import init_db
from backend.routers import closures, facilities, hazards, networks, routes, scenarios, search


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize SQLite database schema on startup
    init_db()

    # Pre-warm default network graph and street search index asynchronously
    def _warmup():
        try:
            from backend.db.database import get_db_connection
            from backend.graph.manager import graph_manager
            with get_db_connection() as conn:
                row = conn.execute("SELECT id FROM networks ORDER BY node_count DESC LIMIT 1").fetchone()
                if row:
                    net_id = row["id"]
                    graph_manager.get_base_graph(net_id)
                    graph_manager.get_street_index(net_id)
        except Exception:
            pass

    import threading
    threading.Thread(target=_warmup, daemon=True).start()
    yield


app = FastAPI(
    title="Res-Q Disaster Simulation & Route Optimization API",
    description="FastAPI graph-based disaster simulation, road network import, and route optimization backend.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Register routers
app.include_router(networks.router)
app.include_router(routes.router)
app.include_router(scenarios.router)
app.include_router(closures.router)
app.include_router(hazards.router)
app.include_router(facilities.router)
app.include_router(search.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "Res-Q Routing Backend"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)

