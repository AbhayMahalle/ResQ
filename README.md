<div align="center">

# ResQ
### Smart Disaster Evacuation & Route Optimization System

**Plan safer routes. Simulate disasters. Navigate around blocked roads.**

A map-based disaster-response application that uses graph algorithms to calculate routes, simulate road closures, and identify alternative paths during emergencies.

![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-Frontend-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-Database-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![MapLibre](https://img.shields.io/badge/MapLibre-Interactive%20Maps-396CB2?style=for-the-badge)
![DAA](https://img.shields.io/badge/Project-DAA-7C3AED?style=for-the-badge)

**Design and Analysis of Algorithms (DAA) Course Project**

**Vishwakarma Institute of Technology, Pune**  
**Academic Year 2026–2027**

</div>

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Objectives](#objectives)
- [Key Features](#key-features)
- [Application Workflow](#application-workflow)
- [Road Network and Graph Representation](#road-network-and-graph-representation)
- [Routing Algorithms](#routing-algorithms)
- [Disaster Simulation](#disaster-simulation)
- [Hazard Zones and Road Closures](#hazard-zones-and-road-closures)
- [Emergency Facilities](#emergency-facilities)
- [Search and Navigation](#search-and-navigation)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Installation and Setup](#installation-and-setup)
- [Running the Application](#running-the-application)
- [Using ResQ](#using-resq)
- [Database and Persistence](#database-and-persistence)
- [Testing and Verification](#testing-and-verification)
- [Example Disaster Scenario](#example-disaster-scenario)
- [Design Decisions](#design-decisions)
- [Limitations](#limitations)
- [Future Enhancements](#future-enhancements)
- [References](#references)

---

## Overview

**ResQ — Smart Disaster Evacuation & Route Optimization System** is a map-based disaster-response application developed as a Design and Analysis of Algorithms (DAA) course project.

During emergencies such as floods, fires, landslides, and infrastructure failures, roads may become unsafe or inaccessible. A route that works under normal conditions may no longer be suitable after a disaster affects the road network.

ResQ represents the road network as a graph and uses graph algorithms to calculate routes between locations. Users can search for destinations, visualize routes on an interactive map, simulate road closures, define hazard zones, and recalculate routes according to updated road conditions.

The application keeps the base road network separate from scenario-specific changes. This allows different disaster conditions to be simulated without permanently modifying the original network.

### Project Highlights

- Interactive map with live device location.
- Road-network representation using graph nodes and edges.
- Search suggestions and destination-based route calculation.
- Route planning using BFS, Dijkstra's algorithm, and A* search.
- Disaster simulation with road closures and hazard zones.
- Persistent scenario data stored in SQLite.
- Emergency facility visualization.
- Route recalculation when roads become unavailable.
- User-friendly navigation controls and route information.
- Separate base road data and scenario-specific road conditions.

---

## Problem Statement

During a disaster, roads can become inaccessible because of flooding, fires, fallen trees, damaged infrastructure, or other emergency conditions.

A route that was previously available may become unusable. If a routing system continues to use the original road network without considering these changes, it may recommend a path through a blocked road.

Emergency responders and affected people need a way to examine road conditions, identify accessible paths, and calculate alternative routes.

The problem addressed by ResQ is:

> Given a road network, a starting location, a destination, and a set of disaster-related road closures or restrictions, determine a valid route that avoids inaccessible road segments.

The system represents roads as graph edges and intersections as graph nodes. Disaster-related changes modify the effective graph used during route calculation.

When a road is blocked, the routing engine excludes that road segment from valid paths. If an alternative path exists, the system can calculate and display it. If no valid path exists, the application should report that the destination cannot currently be reached through the available network.

---

## Objectives

1. Represent a geographic road network as a graph.
2. Find paths between a starting location and a destination.
3. Apply graph algorithms to solve route-planning problems.
4. Support shortest-path calculations using appropriate edge costs.
5. Simulate road closures and disaster-related hazards.
6. Prevent route calculations from using blocked road segments.
7. Recalculate routes when road conditions change.
8. Store hazard zones and road closures persistently in SQLite.
9. Retrieve saved disaster scenarios after application reloads.
10. Display emergency facilities such as hospitals, fire stations, police stations, shelters, and warehouses when geographic data is available.
11. Provide an interactive map with search and navigation controls.
12. Demonstrate practical applications of graph theory and algorithm analysis.

---

## Key Features

### 1. Interactive Map

ResQ uses MapLibre GL JS to display an interactive map using the OpenFreeMap Bright style.

Users can:

- Pan and zoom around the map.
- Explore roads and geographic features.
- View route lines and location markers.
- Inspect emergency facility markers.
- View hazard zones and affected roads.
- Access route-planning controls.
- Interact with map-based disaster simulation features.

### 2. Live Device Location

The application uses the browser's Geolocation API to request the device's current location.

When location access succeeds, the application can:

- Center the map on the device's coordinates.
- Display a marker for the current location.
- Use the location as the starting point for route calculation.
- Refresh the location when requested.

Location access depends on browser permissions, device support, and signal availability. If location retrieval fails, the application should communicate the problem clearly and allow the user to retry.

### 3. Destination Search

The search interface helps users find places and relevant facilities.

The intended workflow is:

1. Enter a place name.
2. Review matching suggestions.
3. Select a destination.
4. Retrieve its coordinates.
5. Calculate a route from the active starting location.
6. Display the route on the map.

Search suggestions should respond to the entered text and prioritize relevant matches within the supported network area.

### 4. Route Planning

ResQ calculates paths through the available road network.

Depending on the selected route preference and implemented cost model, route information may include:

- Route geometry.
- Total distance.
- Estimated travel time.
- Number of navigation steps.
- Starting and destination markers.
- Road-closure warnings.
- Route availability.

The displayed metrics depend on the data available to the routing engine.

### 5. Disaster Simulation

Users can simulate emergency conditions by modifying road availability and creating hazard zones.

Examples include:

- Blocking a road because of flooding.
- Marking a road inaccessible after structural damage.
- Restricting access to a road.
- Creating a geographic hazard zone.
- Recalculating routes after a road closure.
- Comparing route availability before and after a disruption.

### 6. Persistent Disaster Scenarios

ResQ stores scenario-related hazard and road-condition records in SQLite.

Saved records can be retrieved after a page reload or application restart. They remain available until the corresponding records are deleted, according to the implemented persistence behavior.

This allows users to revisit a disaster scenario without manually recreating all its conditions.

### 7. Emergency Facilities

The application is designed to display important facilities such as:

- Hospitals and medical centers.
- Fire stations.
- Police stations.
- Emergency shelters.
- Warehouses and supply facilities.

Distinct map markers help users recognize facility categories. Facility availability and geographic accuracy depend on the data loaded into the application.

### 8. Route Recalculation

When a road becomes blocked, ResQ updates the effective routing graph and calculates a new route.

The system should avoid blocked road segments and use an alternative path when one is available. If no valid route exists, the application should report route unavailability instead of drawing a path through a blocked road.

### 9. Professional Navigation Interface

The frontend uses non-technical labels to present route choices.

| Route Preference | Purpose |
|---|---|
| **Recommended** | Preferred route according to the configured routing criteria. |
| **Fastest Route** | Prioritizes estimated travel time when suitable data is available. |
| **Simpler Turns** | Prioritizes fewer or simpler turns when supported by the implementation. |

Algorithm names are implementation details and are not necessary for users to understand the available navigation options.

---

## Application Workflow

```text
                 ┌──────────────────────────┐
                 │        Open ResQ         │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │ Load Interactive Map     │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │ Obtain Starting Location │
                 │ and Select Destination   │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │ Load Road Network Graph  │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │ Load Active Scenario     │
                 │ and Road Conditions      │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │ Apply Road Closures      │
                 │ and Relevant Restrictions│
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │ Calculate a Valid Route  │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │ Display Route on Map     │
                 │ and Show Route Details   │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │ Simulate Road Closure    │
                 │ or Add Hazard Zone       │
                 └─────────────┬────────────┘
                               │
                               ▼
                 ┌──────────────────────────┐
                 │ Save Scenario Changes    │
                 │ and Recalculate Route   │
                 └──────────────────────────┘
```

### Route Calculation Process

1. Obtain the starting and destination coordinates.
2. Snap both locations to suitable points on the road network.
3. Load the road graph and active scenario.
4. Apply road closures and relevant access restrictions.
5. Select the appropriate routing method and edge cost.
6. Calculate a path through the effective graph.
7. Convert the selected path into geographic route geometry.
8. Display the route and available metrics on the map.

---

## Road Network and Graph Representation

Graph theory is the foundation of the route-planning component.

### Graph Model

ResQ represents the road network as:

\[
G = (V,E)
\]

Where:

- `V` represents the set of graph nodes.
- `E` represents the set of road segments connecting nodes.

A node may represent a road intersection or endpoint. An edge represents a road segment connecting two nodes.

A route is a sequence of connected nodes and edges between the starting point and the destination.

### Example Road Network

```text
             A
            / \
           /   \
          B-----C
          |      \
          |       \
          D--------E
                   |
                   F
```

If the starting node is `A` and the destination is `F`, the routing algorithm searches for a connected path between them.

If an edge becomes blocked, the algorithm must avoid that edge and search the remaining graph.

This diagram is illustrative. Actual route calculation depends on the road-network data loaded by ResQ.

### Edge Weights

Edges can contain attributes used to calculate route costs, including:

- Road distance.
- Estimated travel time.
- Road accessibility.
- Direction of travel.
- Road identifier.
- Scenario-specific availability.

For a weighted graph, a route's total cost can be represented as:

\[
C(P) = \sum_{e \in P} w(e)
\]

Where:

- `P` is a candidate path.
- `w(e)` is the weight assigned to edge `e`.
- `C(P)` is the total cost of the path.

If the weight represents distance, minimizing total weight minimizes distance. If it represents travel time, minimizing total weight minimizes the estimated travel time represented by the model.

### Directed and Undirected Roads

Some roads allow travel in both directions, while others are one-way.

The graph representation must preserve the relevant road-direction information. The existence of an edge from node `u` to node `v` does not necessarily imply that a valid edge exists from `v` to `u`.

Preserving road direction is important for realistic route calculation.

---

## Routing Algorithms

ResQ uses graph algorithms to solve pathfinding problems.

The algorithms described here are BFS, Dijkstra's algorithm, and A* search. Their practical role depends on how each algorithm is implemented and connected to the application.

### 1. Breadth-First Search (BFS)

**Purpose:** Find a path containing the fewest edges in an unweighted graph.

BFS explores neighboring nodes level by level. It first visits the starting node, then its immediate neighbors, followed by nodes at the next level.

#### Working Principle

1. Start at the source node.
2. Add the source node to a queue.
3. Remove the next node from the queue.
4. Visit its unvisited neighbors.
5. Record parent relationships for path reconstruction.
6. Continue until the destination is reached or no reachable nodes remain.
7. Reconstruct the path from the destination to the source.

#### Complexity

For a graph represented with adjacency lists:

- **Time Complexity:** `O(V + E)`
- **Space Complexity:** `O(V)`

Where `V` is the number of vertices and `E` is the number of edges.

#### Important Consideration

BFS minimizes the number of edges, not necessarily the physical distance or travel time. It is suitable when all edges have equal cost.

### 2. Dijkstra's Algorithm

**Purpose:** Find a minimum-cost path in a graph with non-negative edge weights.

Dijkstra's algorithm maintains the best known cost to each node and repeatedly processes the node with the lowest tentative cost.

#### Working Principle

1. Assign a cost of zero to the source node.
2. Assign an initially infinite cost to other nodes.
3. Select the unprocessed node with the lowest known cost.
4. Examine its outgoing edges.
5. Update neighboring costs when a cheaper path is found.
6. Record parent relationships for path reconstruction.
7. Continue until the destination is finalized or no reachable nodes remain.
8. Reconstruct the minimum-cost path.

#### Complexity

With an adjacency list and a binary heap priority queue:

- **Time Complexity:** Commonly `O((V + E) log V)`
- **Space Complexity:** `O(V + E)`, including the graph representation.

The exact implementation and data structures determine practical performance.

#### Important Consideration

Dijkstra's algorithm requires non-negative edge weights. It can minimize distance or another non-negative cost, provided the graph's edge weights represent the chosen objective correctly.

### 3. A* Search

**Purpose:** Find a minimum-cost path while using a heuristic to guide exploration toward the destination.

A* evaluates candidate nodes using:

`f(n) = g(n) + h(n)`

Where:

- `g(n)` is the cost accumulated from the starting node to node `n`.
- `h(n)` is an estimate of the remaining cost from node `n` to the destination.
- `f(n)` is the estimated total cost of a path through node `n`.

#### Working Principle

1. Add the source node to the priority queue.
2. Calculate its estimated total cost.
3. Select the candidate node with the lowest priority value.
4. Examine its neighbors.
5. Update path costs and parent relationships when a better path is found.
6. Use the heuristic to guide exploration toward the destination.
7. Reconstruct the path when the destination is reached.

#### Complexity

A* performance depends on the graph, heuristic, and implementation. Its worst-case time and space requirements can be exponential in general search settings.

A suitable heuristic can reduce unnecessary exploration. For geographic routing, a distance-based heuristic may be appropriate when it is consistent with the edge-cost model.

#### Important Consideration

A* can find an optimal path when the algorithm and heuristic satisfy the required conditions. A heuristic that overestimates remaining cost may affect optimality.

### Algorithm Comparison

| Algorithm | Cost Model | Main Use | Limitation |
|---|---|---|---|
| BFS | Equal cost per edge | Fewest-edge path | Does not inherently minimize distance or travel time |
| Dijkstra | Non-negative edge weights | Minimum-cost route | May explore many nodes |
| A* | Edge weights plus heuristic | Destination-directed search | Depends on a suitable heuristic |

**Frontend design:** The navigation interface uses user-friendly route preferences rather than exposing algorithm names to regular users.

---

## Disaster Simulation

Disaster simulation allows users to examine how road-network disruptions affect route availability.

### Road Network Before a Disaster

Under normal conditions, the routing engine uses the available road network to calculate a path between the source and destination.

### Road Network After a Disaster

When a road becomes inaccessible, the effective graph must be updated to exclude that road from valid routes.

The algorithm then searches the remaining accessible network.

### Modeling a Road Closure

Let `E_b` be the set of blocked road edges.

The effective graph can be represented as:

`G' = (V, E \ E_b)`

Where:

- `G` is the original graph.
- `V` is the set of graph nodes.
- `E` is the original set of road edges.
- `E_b` is the set of blocked edges.
- `G'` is the graph used for route calculation after applying the closures.

A blocked road segment is excluded from valid routes. Other roads connected to the same intersections remain available unless they are separately affected.

### Disaster Scenarios

| Scenario | Simulated Condition | Expected Routing Behavior |
|---|---|---|
| Flooded road | A road segment is blocked | Route avoids the blocked segment |
| Damaged bridge | A connecting road is unavailable | Route uses another crossing if one exists |
| Fire-affected area | Roads are restricted according to scenario rules | Route avoids roads marked inaccessible |
| Landslide | One or more road segments are blocked | Route is recalculated using available roads |
| Multiple closures | Several edges are unavailable | Route uses the remaining accessible network, if possible |

These are example scenarios. Actual behavior depends on the road-condition rules and geographic data configured in the application.

---

## Hazard Zones and Road Closures

### Hazard Zones

A hazard zone represents a geographic area affected by an emergency.

Examples include:

- Flooded areas.
- Fire-affected areas.
- Landslide zones.
- Damaged infrastructure areas.

A hazard zone may be represented using a circle or polygon, depending on the application's supported geometry tools.

### Connecting Hazards to Roads

Hazard geometry can be checked against road geometry to identify potentially affected road segments.

The application can then apply its configured scenario policy to those segments.

A hazard overlay does not automatically guarantee that every intersecting road is blocked. The outcome depends on the implemented hazard-to-road rules.

### Road Conditions

Scenario-specific road conditions may include:

| Condition | Meaning |
|---|---|
| Open | The road remains available for routing. |
| Restricted | The road has a scenario-specific access restriction. |
| Blocked | The road is excluded from valid routes. |

The routing engine must interpret these states consistently.

### Route Recalculation After a Closure

1. Select the road segment to modify.
2. Mark it as blocked or restricted.
3. Save the change to the active scenario.
4. Update the effective routing graph.
5. Recalculate the route.
6. Display an alternative path if one exists.
7. Report route unavailability if no valid path remains.

The original road network should remain unchanged so that scenario changes can be applied and removed independently.

---

## Emergency Facilities

Emergency facilities help users identify important resources during a disaster.

| Facility | Potential Purpose |
|---|---|
| Hospital | Medical treatment and emergency care |
| Fire station | Fire response and rescue operations |
| Police station | Public safety and emergency coordination |
| Shelter | Temporary refuge for affected people |
| Warehouse | Storage or distribution of emergency supplies |

Facility markers should use distinct, recognizable icons so users can identify categories quickly.

The availability of each facility depends on the loaded geographic data. A map marker should not be treated as proof that a facility is open, operational, or safe during an active disaster.

---

## Search and Navigation

The search and navigation interface connects user-selected destinations to the route-planning engine.

### Search Workflow

1. The user enters a place name.
2. The application requests matching locations.
3. The search interface displays relevant suggestions.
4. The user selects a result.
5. The application obtains the selected location's coordinates.
6. The backend calculates a route from the active origin.
7. The route geometry is returned and displayed on the map.

### Location Matching

Search results should be relevant to the configured network area. This helps reduce unrelated matches outside the supported geographic region.

### Route Display

A route can include:

- Starting marker.
- Destination marker.
- Route polyline.
- Distance.
- Estimated duration.
- Navigation steps, where supported.

### Start Journey

The navigation interface can provide a journey-start action to enter the application's navigation experience.

The accuracy of turn instructions and estimated travel time depends on the road data, route geometry, and navigation features implemented by the project.

---

## Technology Stack

| Technology | Role |
|---|---|
| React | Frontend component framework |
| TypeScript | Frontend type safety |
| Vite | Frontend development server and build tool |
| MapLibre GL JS | Interactive map rendering |
| OpenFreeMap Bright | Base-map style |
| OpenStreetMap | Geographic and road data |
| Python | Backend implementation |
| FastAPI | Backend API framework |
| NetworkX | Graph representation and algorithm support, where used |
| OSMnx | Road-network acquisition and processing, where used |
| SQLite | Persistent scenario and disaster-state storage |
| Pydantic | API request and response validation |
| pytest | Backend automated testing |
| oxlint | Frontend linting, where configured |

Exact versions and additional dependencies should be taken from the project's dependency files.

---

## System Architecture

ResQ follows a frontend–backend architecture.

```text
┌──────────────────────────────────────────────┐
│                  FRONTEND                    │
│                                              │
│  React + TypeScript + Vite                   │
│                                              │
│  ├── Interactive Map                         │
│  ├── Search and Destination Selection        │
│  ├── Route Display                           │
│  ├── Emergency Facility Markers              │
│  ├── Hazard and Road-Closure Controls        │
│  └── Scenario Management                     │
└──────────────────────┬───────────────────────┘
                       │ HTTP API
                       ▼
┌──────────────────────────────────────────────┐
│                   BACKEND                    │
│                                              │
│  FastAPI                                     │
│                                              │
│  ├── Search and Route Endpoints              │
│  ├── Road-Network Processing                 │
│  ├── Graph-Based Routing                     │
│  ├── Scenario Management                     │
│  ├── Road-Condition Updates                  │
│  └── Hazard Management                       │
└──────────────┬──────────────────┬────────────┘
               │                  │
               ▼                  ▼
┌──────────────────────┐  ┌──────────────────────┐
│   Road Graph/Data    │  │   SQLite Database    │
│                      │  │                      │
│ Road nodes and edges │  │ Scenarios            │
│ Road attributes      │  │ Road overrides       │
│ Routing information  │  │ Hazard records       │
└──────────────────────┘  └──────────────────────┘
```

### Frontend Responsibilities

- Render the interactive map.
- Obtain and display the user's location.
- Provide destination search.
- Display route geometry and metrics.
- Show emergency facilities and hazard overlays.
- Provide controls for road closures and scenario management.
- Communicate with the backend API.

### Backend Responsibilities

- Process search and route requests.
- Access and process road-network data.
- Calculate routes using the configured routing implementation.
- Apply scenario-specific road conditions.
- Manage hazard and road-closure records.
- Persist scenario changes in SQLite.
- Return route results and relevant application data.

### Database Responsibilities

- Store scenario metadata.
- Store road overrides and closure records.
- Store hazard records.
- Support retrieval of saved scenario data.

---

## Project Structure

The following is a logical overview, not a guaranteed exact directory listing. Refer to the actual repository for the current filenames and modules.

```text
ResQ/
│
├── backend/
│   ├── main.py
│   ├── routers/
│   ├── graph/
│   ├── services/
│   ├── models/
│   ├── schemas/
│   └── tests/
│
├── src/
│   ├── components/
│   ├── services/
│   ├── config.ts
│   ├── types.ts
│   ├── App.tsx
│   ├── App.css
│   └── index.css
│
├── data/
│   └── processed/
│       └── [road-network data, if stored here]
│
├── public/
├── index.html
├── package.json
├── package-lock.json
├── requirements.txt
├── README.md
└── .gitignore
```

The actual repository may contain additional modules, tests, configuration files, datasets, and assets.

---

## Installation and Setup

### Prerequisites

Install:

- Node.js and npm.
- Python.
- Git, if cloning the repository.

Check the installations:

```bash
node --version
npm --version
python --version
```

On Windows, use `py` instead of `python` if required.

### 1. Open the Project Directory

```bash
cd ResQ
```

Run the command from the directory containing the frontend `package.json`.

### 2. Install Frontend Dependencies

```bash
npm install
```

### 3. Create a Python Virtual Environment

```bash
python -m venv .venv
```

### 4. Activate the Environment

**Windows PowerShell:**

```powershell
.\.venv\Scripts\Activate.ps1
```

**Windows Command Prompt:**

```cmd
.venv\Scripts\activate.bat
```

**Linux or macOS:**

```bash
source .venv/bin/activate
```

### 5. Install Backend Dependencies

If the repository contains `requirements.txt`:

```bash
python -m pip install -r requirements.txt
```

If the project uses a different dependency file or package manager, follow the repository's actual setup instructions.

---

## Running the Application

Run the backend and frontend in separate terminals.

### Terminal 1: Start the Backend

For the previously reported setup, the backend can be started with:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

The module path must match the actual backend entry point. Adjust the command if the repository uses a different path.

Backend address:

`http://127.0.0.1:8000/`

FastAPI documentation:

`http://127.0.0.1:8000/docs`

### Terminal 2: Start the Frontend

```bash
npm run dev -- --host 127.0.0.1 --port 5173
```

Frontend address:

`http://127.0.0.1:5173/`

The frontend must be configured to communicate with the running backend API.

### Important Requirements

- Ensure all dependencies are installed.
- Ensure the backend can locate its road-network data.
- Ensure the configured network covers the selected origin and destination.
- Ensure the frontend API base URL points to the running backend.
- Grant browser location permission to use live device location.
- Keep the backend running while using features that require API access.

---

## Using ResQ

### Calculate a Route

1. Open ResQ in your browser.
2. Allow access to the current device location when prompted.
3. Search for a destination.
4. Select the matching location.
5. Review the route displayed on the map.
6. Inspect the available distance, estimated duration, and route details.

### Simulate a Road Closure

1. Open the disaster simulation or road-condition controls.
2. Select the road segment to modify.
3. Mark the road as blocked.
4. Save the change to the active scenario.
5. Recalculate the route.
6. Confirm that the selected route avoids the blocked segment or that the application reports no available route.

### Add a Hazard Zone

1. Open the hazard-management controls.
2. Create a hazard zone using the supported geometry tools.
3. Configure the available hazard properties.
4. Save the hazard.
5. Inspect the hazard overlay and affected roads.
6. Recalculate the route if the scenario changes road accessibility.

### Verify Persistence

1. Save a road closure or hazard zone.
2. Reload the application.
3. Restore or select the relevant scenario if required.
4. Confirm that the saved record is retrieved.
5. Delete the record using the application's supported delete operation.
6. Reload again to confirm that the deleted record remains absent.

---

## Database and Persistence

ResQ uses SQLite for persistent scenario-related data.

The reported implementation includes the following data categories:

| Data | Purpose |
|---|---|
| Scenarios | Store disaster scenario information and active-state metadata |
| Road overrides | Store scenario-specific road conditions and closures |
| Hazard records | Store geographic hazard zones and associated properties |

### Persistence Workflow

```text
User Changes Scenario
         |
         v
Frontend Sends API Request
         |
         v
Backend Validates Request
         |
         v
SQLite Stores the Change
         |
         v
Updated Scenario State Is Returned
         |
         v
Map and Context Panels Refresh
         |
         v
Saved Data Is Retrieved After Reload
```

Scenario-specific overrides should remain separate from the base road network. This makes it possible to change disaster conditions without permanently altering the imported road data.

Saved records remain available until explicitly deleted, according to the implemented persistence behavior.

---

## Testing and Verification

Testing should cover route calculation, disaster-state persistence, and frontend interactions.

### Backend Tests

If the project uses pytest:

```bash
python -m pytest backend/tests/ -v
```

This command assumes that the backend tests are located in `backend/tests/`. Adjust the path if the repository uses a different test directory.

### Frontend Linting

If the project defines an `npm run lint` script:

```bash
npm run lint
```

### Frontend Production Build

```bash
npm run build
```

A successful build checks the configured TypeScript and Vite production-build steps.

### Recommended Functional Checks

| Test | Expected Result |
|---|---|
| Load the application | The map and main interface appear |
| Obtain device location | The current location is displayed when permission is granted |
| Search for a place | Relevant suggestions appear |
| Select a destination | The selected destination is applied |
| Calculate a route | A valid route is displayed when one exists |
| Block a road | The blocked edge is excluded from valid routes |
| Recalculate after closure | An alternative route appears if available |
| Add a hazard zone | The saved hazard is shown according to the scenario configuration |
| Reload the application | Persisted scenario data is retrieved |
| Delete a hazard | The deleted record is no longer present |
| Request an unreachable destination | The application reports that no valid route is available |

### Recording Test Results

Only report tests as passed after running them against the final project version.

| Verification | Result |
|---|---|
| Backend automated tests | Record the actual result |
| Frontend linting | Record the actual result |
| Frontend production build | Record the actual result |
| Search-to-route flow | Record the actual result |
| Road-closure routing | Record the actual result |
| Hazard persistence | Record the actual result |
| Scenario retrieval after reload | Record the actual result |

---

## Example Disaster Scenario

Consider a simplified road network with a source location `S`, a destination `D`, and two possible paths.

### Initial Network

```text
                 A -------- B
                /            \
               /              \
              S                D
               \              /
                \            /
                 C -------- E
```

Assume the upper path and lower path are both available.

The routing engine evaluates the available paths according to the configured edge costs and selects a valid route.

### After a Road Closure

Suppose the road between `A` and `B` becomes blocked.

```text
                 A ---X--- B
                /            \
               /              \
              S                D
               \              /
                \            /
                 C -------- E
```

`X` represents a blocked edge.

The routing engine must not use the blocked edge. It evaluates the remaining available roads and selects an alternative path if one exists.

### Expected Behavior

1. The road closure is stored in the active scenario.
2. The effective graph excludes the blocked edge.
3. The route is recalculated.
4. An alternative path is displayed if reachable.
5. If no valid path exists, the application reports that the destination is unreachable through the available network.
6. The closure remains saved until it is deleted or the scenario is otherwise changed.

This example illustrates the graph-based approach. Actual results depend on the road network and edge weights used by ResQ.

---

## Design Decisions

### 1. Separate Base Network and Scenario Changes

The original road network should remain separate from disaster-specific road overrides.

This allows users to create, modify, and remove scenario changes without permanently changing the base network.

### 2. Use Graph Algorithms for Routing

Graph algorithms provide a structured way to evaluate connected paths and calculate route costs.

BFS is suitable for unweighted graphs, while Dijkstra's algorithm and A* can support weighted routing under their respective conditions.

### 3. Store Scenario Changes Persistently

SQLite provides local persistent storage for scenario information, road overrides, and hazard records.

Persistence allows the application to restore saved disaster conditions after reloads or restarts.

### 4. Keep the Interface User-Friendly

The frontend presents route choices using understandable labels rather than requiring users to know the underlying algorithm.

The map remains the main interface for route visualization and disaster-related geographic changes.

### 5. Separate Route Calculation from Map Rendering

The routing engine determines a path through the road graph. The frontend displays the resulting route geometry.

Keeping these responsibilities separate makes the application easier to maintain and test.

---

## Limitations

The system's accuracy and usefulness depend on the quality and coverage of the underlying road and geographic data.

Potential limitations include:

- Incomplete or outdated road-network data.
- Missing or inaccurate facility locations.
- Unavailable device location.
- Incomplete travel-time information.
- Limited geographic coverage of the loaded road network.
- Hazard data that may not represent live disaster conditions.
- Routing accuracy that depends on correct road direction and edge costs.
- Facility markers that do not guarantee real-time operational status.
- Search results that depend on the configured geocoding service and supported area.

ResQ is an academic project and should not be treated as a certified emergency-response system without further validation, authoritative data sources, and operational safeguards.

---

## Future Enhancements

Possible future improvements include:

1. Integrating verified real-time disaster alerts.
2. Incorporating live road closures from authoritative sources.
3. Improving travel-time estimates using traffic data.
4. Adding accessibility and evacuation-specific route preferences.
5. Improving the visualization of affected road segments.
6. Supporting more advanced scenario comparisons.
7. Adding better reporting and export options for disaster scenarios.
8. Improving facility data quality and freshness.
9. Adding automated route validation against active road closures.
10. Evaluating algorithm performance on larger road networks.
11. Improving navigation instructions and rerouting behavior.
12. Adding more comprehensive automated end-to-end tests.

These are potential enhancements, not claims about currently implemented functionality.

---

## References

1. **OpenStreetMap** — Geographic and road-map data.  
   https://www.openstreetmap.org/

2. **OpenFreeMap** — Open map styles and tile services.  
   https://openfreemap.org/

3. **MapLibre GL JS** — Interactive map rendering library.  
   https://maplibre.org/maplibre-gl-js/docs/

4. **React** — Frontend component library.  
   https://react.dev/

5. **TypeScript** — Typed JavaScript documentation.  
   https://www.typescriptlang.org/docs/

6. **Vite** — Frontend development and build tool.  
   https://vite.dev/

7. **FastAPI** — Python web framework.  
   https://fastapi.tiangolo.com/

8. **SQLite** — Database documentation.  
   https://www.sqlite.org/docs.html

9. **NetworkX** — Graph creation and algorithm documentation.  
   https://networkx.org/documentation/stable/

10. **OSMnx** — Street-network modeling and analysis.  
    https://osmnx.readthedocs.io/

11. **Python** — Official documentation.  
    https://docs.python.org/3/

12. **pytest** — Python testing framework.  
    https://docs.pytest.org/

---

<div align="center">

**ResQ — Smart Disaster Evacuation & Route Optimization System**

</div>
