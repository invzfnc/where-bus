# where bus?

A real-time bus tracking web app for Kuala Lumpur's RapidKL and MRT Feeder networks. Enter your stop, see which buses are coming and how far away they are.

> Note: The frontend is still under development at the time of writing, and only partial functionality is currently supported.

## Features

- **Live bus positions**: GPS coordinates and heading for every active bus on a route, updated every 30 seconds from Prasarana's live feed
- **Real-time ETA**: arrival time estimates sorted by proximity, filtered to buses actually heading toward your stop
- **Route discovery**: search stops and routes by name, or look up every route serving a specific stop
- **Direction awareness**: outbound and inbound buses are distinguished so you only see buses going your way
- **Stop path visualisation**: full ordered stop sequence for any route, ready to draw as a map polyline

---

## Tech Stack

| | Frontend | Backend |
|---|---|---|
| **Framework** | Next.js, React | Spring Boot |
| **Language** | TypeScript | Java 25 |
| **Styling** | Tailwind CSS |- |
| **Maps** | Leaflet |- |
| **Animation** | Framer Motion |- |
| **API Docs** |- | Swagger / OpenAPI 3 |
| **Build** | npm | Maven |

---

## Architecture

*where bus?* has no traditional database. Instead, the entire transit network, every stop, route, and stop sequence for Kuala Lumpur, is loaded from static GTFS files into memory when the server starts. Live GPS positions are fetched from Prasarana's public GTFS-Realtime API on a 30-second cycle and merged into the same in-memory store. Every API request is served entirely from RAM, which keeps response times low and removes the need to run or manage a database server.

The frontend connects to the backend over a standard REST API. When a user selects a route and stop, the frontend requests the list of approaching buses. The backend finds matching vehicles in the live fleet, computes road distances using the route's shape geometry, sorts results by arrival time, and returns a ranked list, all within a single request.

Two Prasarana data feeds are combined: `rapid-bus-kl` (standard trunk and local routes) and `rapid-bus-mrtfeeder` (MRT Feeder green network). Both are served through the same API endpoints.

<details>
<summary><strong>Design decisions - read more</strong></summary>

<br>

**Why no database?**

Static GTFS data is read-only after startup. Querying a database for every stop lookup or route path request would add 5-20ms of latency per call with no benefit. The data never changes between requests. A `HashMap` lookup is nanoseconds. For a real-time transit app where the entire value proposition is freshness and speed, that difference matters. The two feeds together fit comfortably in memory.

**In-memory data structures**

Static data uses plain `HashMap`. It is never mutated after startup, so no synchronisation is needed and reads are maximally fast. Live vehicle positions use `ConcurrentHashMap` specifically because a background `@Scheduled` thread writes new positions every 30 seconds while HTTP request threads are concurrently reading the same map. A plain `HashMap` would cause a race condition here.

Route stop sequences are stored as `LinkedList<String>` per route-direction (key: `"routeId_directionId"`). Insertion order is preserved exactly as defined in `stop_times.txt`. This ordered sequence is the backbone of both map rendering and ETA calculation.

An inverted index (`stopToRouteDirections`) maps each stop ID to the route-direction pairs that serve it. Built once at startup in O(R * S) time (routes * stops per route), it makes "which routes serve this stop?" an O(1) lookup rather than a full scan of all route paths per request.

ETA results are sorted using a `PriorityQueue` (min-heap). Each bus is inserted with its ETA as the priority key, the heap always yields the soonest arrival first. This is O(log N) per insertion versus O(N log N) for sorting after the fact.

**Shape-based road distance**

Straight-line (Haversine) distance between a bus and a stop is a poor proxy for how long it will actually take to arrive, urban road geometry adds overhead over crow-flies distance due to roundabouts, one-way systems, and elevated highways. Instead, each stop's cumulative road distance from the start of its route is pre-computed at startup by projecting it onto the route's shape polyline from `shapes.txt`. At query time, ETA distance is simply `stopCumulativeDist - busCumulativeDist`.

For MRT Feeder routes, `shape_dist_traveled` is already provided in the static files and is read directly. For rapid-bus-kl, cumulative arc-length is computed by summing Haversine distances between consecutive shape points.

**hasPassed(): direction filtering**

Without direction filtering, a bus that has already driven past your stop would appear in ETA results as "Arriving" (it's only 100m away, just behind you). The fix: compare the bus's projected arc-length position along the route against the target stop's arc-length. If the bus is at or past the stop's position in its direction of travel, it is excluded. This uses the same pre-computed cumulative distance table as the ETA calculation.

**ETA smoothing**

Raw ETA values can be noisy. GPS positions may oscillate slightly between polls, and the "nearest stop" projection can snap to a different stop when a bus is equidistant between two, causing apparent jumps of several minutes between consecutive readings. A 3-sample rolling average per vehicle-stop pair absorbs single-poll spikes without introducing meaningful display lag at 30-second polling intervals.

**Prasarana feed quirks**

The live GTFS-RT feed has several non-standard behaviours that required specific handling:
- Prasarana broadcasts the `speed` field in km/h. It is converted to m/s (divide by 3.6) for ETA arithmetic. If absent or outside a plausible range, a fallback of ~11 km/h is used.
- Some routes have a trailing `"0"` appended to their ID in the live feed (e.g. `"T7890"` for route `"T789"`). Route matching checks both the canonical ID and the suffixed variant.
- Some routes encode direction as a string suffix in the route ID field (e.g. `"T155 Outbound"`) instead of using the `direction_id` field. These are matched by prefix.
- The two static feeds (`rapid-bus-kl` and `rapid-bus-mrtfeeder`) have different column layouts across all five GTFS files. A header-row column index parser handles both schemas with one code path rather than branching on feed type.

**Rate limiting**

data.gov.my enforces a limit of 4 requests per minute across all GTFS Realtime endpoints ([source](https://developer.data.gov.my/rate-limit)). With two feeds per cycle this puts us exactly at the limit. The two feed requests are staggered 10 seconds apart within each 30-second cycle to avoid bursting. On a 429 response, the affected feed backs off for 2 minutes (respecting the `Retry-After` header if provided). During a full blackout, the last known vehicle positions are preserved rather than clearing the fleet. Stale data is better than no data for a transit app.

</details>

---

## Project Structure

```
where-bus/
├── frontend/                       # Next.js frontend (Work in progress, full docs coming soon)
├── backend/                        # Spring Boot application
│   └── src/main/
│       ├── java/com/wherebus/
│       │   ├── controllers/
│       │   │   ├── HealthController.java      # GET /api/health
│       │   │   └── TransitController.java     # All transit endpoints
│       │   ├── models/
│       │   │   ├── Route.java                 # Route data model
│       │   │   ├── Stop.java                  # Stop data model
│       │   │   └── VehicleResponse.java       # Live vehicle response model
│       │   ├── services/
│       │   │   ├── TransitService.java        # Static GTFS data + in-memory network
│       │   │   ├── LiveTrackingService.java   # GTFS-RT feed polling + fleet state
│       │   │   └── EtaCalculationService.java # ETA computation + smoothing
│       │   └── WhereBusApplication.java       # Entry point
│       └── resources/
│           ├── data/
│           │   ├── rapid-bus-kl/              # Static GTFS feed (RapidKL)
│           │   │   ├── routes.txt
│           │   │   ├── stops.txt
│           │   │   ├── trips.txt
│           │   │   ├── stop_times.txt
│           │   │   └── shapes.txt
│           │   └── rapid-bus-mrtfeeder/       # Static GTFS feed (MRT Feeder)
│           │       ├── routes.txt
│           │       ├── stops.txt
│           │       ├── trips.txt
│           │       ├── stop_times.txt
│           │       └── shapes.txt
│           └── application.properties
└── frontend/                       # Next.js application (in progress)
    └── where-bus/
```

---

## Getting Started

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Java | 25 LTS | [Download](https://www.oracle.com/java/technologies/downloads/) |
| Maven | 3.9+ | See install note below |
| Node.js | 18+ | Includes npm |
| IntelliJ IDEA | Any | Recommended for backend |

**Maven installation:** Download the zip from [maven.apache.org](https://maven.apache.org/download.cgi), extract it, and add the `bin/` folder to your system PATH. On macOS you can use `brew install maven`, on Windows `choco install maven`.

---

### Backend

**Using IntelliJ IDEA (recommended)**

1. Open IntelliJ IDEA and select **Open**, then navigate to the `backend/` folder.
2. IntelliJ will detect the Maven project and sync dependencies automatically. If it doesn't, right-click `pom.xml` → **Maven** → **Reload Project**.
3. Open `src/main/java/com/wherebus/WhereBusApplication.java`.
4. Click the **Run** button in the top-right toolbar.

The server starts on `http://localhost:8080`. You'll see startup logs confirming how many stops, routes, and shape distances were loaded from the static GTFS files.

**Using the terminal**

```bash
cd backend
mvn spring-boot:run
```

**Verify it's running**

```
GET http://localhost:8080/api/health
```

Should return: `WhereBus API is up and running!`

**API documentation (Swagger UI)**

```
http://localhost:8080/swagger-ui/index.html
```

All endpoints are documented here with example values and a live "Try it out" feature.

---

### Frontend

> The frontend is currently in development. Only partial functions are supported.

1. Navigate to `frontend/where-bus/`
2. Run `npm install`
3. Run `npm run dev`
4. Open `http://localhost:3000`

### Accessing on mobile (same network)

To test on a phone while running the dev server on your computer:

1. Find your computer's local IP address (`ipconfig` on Windows, `ifconfig` on macOS/Linux).
2. Start the frontend server bound to all interfaces:
   ```bash
   npm run dev -- -H 0.0.0.0
   ```
3. On your phone (connected to the same Wi-Fi), open:
   ```
   http://your-ip-address:3000
   ```

## API Reference

Base URL: `http://localhost:8080/api`

All `routeId` parameters accept the **route short name** as displayed on buses (e.g. `T815`, `T789`). All `stopId` parameters accept the numeric stop ID from `stops.txt`. Use `/transit/search` to look up both.

| Method | Endpoint | Parameters | Description |
|---|---|---|---|
| `GET` | `/health` | - | Server health check |
| `GET` | `/transit/search` | `q` - search term | Search stops and routes by name. Returns up to 10 of each. Use the route `name` field as `routeId` and the stop `id` field as `stopId` for other endpoints. |
| `GET` | `/transit/routes/{shortName}` | `shortName` - e.g. `T815` | Static route metadata: short name, long name, outbound and inbound headsigns. |
| `GET` | `/transit/routes/{shortName}/path` | `shortName` - e.g. `T815` | Ordered stop sequence for the outbound direction. Suitable for drawing a route polyline on a map. |
| `GET` | `/transit/stops/{stopId}/routes` | `stopId` - e.g. `12000802` | All routes serving a stop, with `servesOutbound` and `servesInbound` flags per route. Use to show available routes when a user taps a stop. |
| `GET` | `/transit/vehicles` | `routeId` - e.g. `T815` | Live GPS coordinates, bearing, and direction for all active buses on a route. |
| `GET` | `/transit/eta` | `routeId` - e.g. `T815`, `stopId` - e.g. `12000802` | Approaching buses sorted by ETA. Excludes buses that have passed the stop and buses more than 35 minutes away. Each result includes `directionId` (0 = outbound, 1 = inbound) for frontend filtering. |
| `GET` | `/transit/debug-fleet` | - | Raw feed diagnostic: total active buses, all broadcasted route IDs, and 5 sample vehicle entries. Use when `/vehicles` returns unexpected results. |

---

## Known Limitations

**ETA accuracy**

Bus position is projected onto the route by snapping to the nearest stop in the sequence, not the nearest point on the shape polyline. When a bus is between two stops, it snaps to the closer one, which may introduce a small error in the computed road distance. This is acceptable at a 30-second refresh interval but a true polyline projection would be more precise.

ETA is computed as `road distance / speed`. Speed comes from the feed's `speed` field (broadcast by Prasarana in km/h), with a fallback of ~11 km/h when the field is absent. Neither accounts for traffic signals, dwell time at stops, or congestion. The same limitations that affect most real-time transit apps without access to historical speed profiles.

**Rate limiting**

data.gov.my enforces 4 requests per minute with no authenticated tier available ([source](https://developer.data.gov.my/rate-limit)). This constrains the refresh interval to 30 seconds and occasionally causes temporary data gaps when both feeds are rate-limited simultaneously. Vehicle positions from the last successful poll are preserved during blackout periods.

**Circular and looping routes**

The `hasPassed()` check compares cumulative arc-length along the route shape. On routes that loop back close to their starting point, a bus on the return segment may have a lower arc-length than a stop on the outbound segment, producing an incorrect pass result. This may affect looping routes in the dataset.

**Static data freshness**

The GTFS static files bundled in `src/main/resources/data/` must be manually updated when Prasarana changes route structures or stop locations. A future improvement would be to fetch and reload static data on a scheduled basis from Prasarana's GTFS Static endpoint.

## Data Sources

- **Static GTFS data**: [GTFS Static API Endpoint](https://developer.data.gov.my/realtime-api/gtfs-static)
- **Live vehicle positions**: [GTFS Realtime API Endpoint](https://developer.data.gov.my/realtime-api/gtfs-realtime)
