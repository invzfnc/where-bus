package com.wherebus.services;

import com.wherebus.models.Route;
import com.wherebus.models.Stop;

import org.springframework.stereotype.Service;
import org.springframework.core.io.ClassPathResource;

import jakarta.annotation.PostConstruct;

import java.util.*;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import com.opencsv.CSVReader;

/**
 * Loads static GTFS data at startup and holds the full transit network in memory.
 *
 * <p><b>Route ID conventions:</b>
 * <ul>
 *   <li>{@code routeDirectory} is keyed by the internal GTFS {@code route_id} from routes.txt
 *       (e.g. {@code "30000016"} for MRT Feeder, {@code "T7890"} for rapid-bus-kl). This is
 *       the first column in routes.txt and is used internally for all static data lookups.</li>
 *   <li>{@code shortNameToRouteId} maps the public short name (e.g. {@code "T815"},
 *       {@code "T789"}) to the internal route_id. The short name matches what Prasarana
 *       broadcasts in the live GTFS-RT feed, so all API endpoints that accept a route
 *       identifier expect the <b>short name</b> (e.g. "T815"), not the internal ID.</li>
 *   <li>Use {@link #resolveRouteIdByShortName(String)} to translate a short name to the
 *       internal ID before any static data lookup.</li>
 * </ul>
 *
 * <p><b>Data structures:</b>
 * <ul>
 *   <li>{@code stopDirectory} / {@code routeDirectory} — HashMap for O(1) ID lookups.
 *       Never mutated after startup, so no synchronisation is needed.</li>
 *   <li>{@code routePaths} — One LinkedList per "routeId_directionId" key, preserving
 *       the ordered stop sequence for each direction independently.</li>
 *   <li>{@code stopCumulativeDistances} — Parallel to routePaths. Cumulative road distance
 *       (km) from route start to each stop, derived from shape polylines. Used by
 *       EtaCalculationService for accurate road distance and hasPassed() checks.</li>
 *   <li>{@code shapePolylines} — Populated during startup only; cleared afterwards to
 *       free memory. Not accessed at request time.</li>
 *   <li>{@code stopGraph} — Adjacency list for future pathfinding use.</li>
 *   <li>{@code stopToRouteDirections} — Inverted index: stop_id → route-direction pairs
 *       that serve it. Built once after all feeds load in O(R × S) time. Enables
 *       O(1) lookup for GET /stops/{stopId}/routes without scanning all route paths.</li>
 * </ul>
 *
 * <p><b>Multi-feed schema differences:</b> rapid-bus-kl and rapid-bus-mrtfeeder use
 * different column layouts. All parsing uses header-row column index maps rather than
 * hardcoded positions.
 *
 * <p><b>shape_dist_traveled:</b> rapid-bus-mrtfeeder provides this in shapes.txt and
 * stop_times.txt (cumulative km). rapid-bus-kl does not — arc-length is computed from
 * shape point coordinates instead.
 */
@Service
public class TransitService {

    private final Map<String, Stop> stopDirectory = new HashMap<>();
    private final Map<String, Route> routeDirectory = new HashMap<>();

    // Maps route short name → internal route_id.
    // e.g. "T815" → "30000016", "T789" → "T7890"
    // The short name is what Prasarana broadcasts in the live feed and what API callers pass.
    private final Map<String, String> shortNameToRouteId = new HashMap<>();

    // key: "routeId_directionId" (internal route_id, e.g. "30000016_0")
    private final Map<String, LinkedList<String>> routePaths = new HashMap<>();

    // Parallel to routePaths: cumulative road distance in km from route start to each stop.
    private final Map<String, List<Double>> stopCumulativeDistances = new HashMap<>();

    // Populated during startup; cleared after stop distances are computed.
    private final Map<String, List<double[]>> shapePolylines = new HashMap<>();

    private final Map<String, String> routeDirectionToShapeId = new HashMap<>();
    private final Map<String, List<String>> stopGraph = new HashMap<>();

    // Inverted index: stop_id → list of RouteAtStop entries (internalRouteId + directionId).
    // Built once after all feeds are loaded. Enables O(1) lookup of all routes
    // serving a given stop without scanning every route path per request.
    private final Map<String, List<RouteAtStop>> stopToRouteDirections = new HashMap<>();

    private static final String[] FEED_DIRECTORIES = {
            "data/rapid-bus-kl",
            "data/rapid-bus-mrtfeeder"
    };

    /** Runs once on startup. Loads all feeds sequentially and logs a summary. */
    @PostConstruct
    public void initializeStaticData() {
        System.out.println("Initialising static GTFS data...");

        for (String folder : FEED_DIRECTORIES) {
            System.out.println("➡️  Loading: " + folder);
            try {
                loadStops(folder);
                loadRoutes(folder);
                loadShapes(folder);
                buildGraphsAndPaths(folder);
            } catch (Exception e) {
                System.err.println("❌ Failed to load [" + folder + "]: " + e.getMessage());
            }
        }

        shapePolylines.clear();
        buildStopIndex();

        System.out.println("✅ Stops loaded:            " + stopDirectory.size());
        System.out.println("✅ Routes loaded:           " + routeDirectory.size());
        System.out.println("✅ Short name mappings:     " + shortNameToRouteId.size());
        System.out.println("✅ Route paths loaded:      " + routePaths.size());
        System.out.println("✅ Stop distances computed: " + stopCumulativeDistances.size());
        System.out.println("✅ Graph vertices:          " + stopGraph.size());
        System.out.println("✅ Stop route index:        " + stopToRouteDirections.size() + " stops indexed");
    }

    // -------------------------------------------------------------------------
    // Header-row column index resolution
    // -------------------------------------------------------------------------

    /**
     * Reads the header row and returns a column name → zero-based index map.
     * Used by all loaders so both feed schemas are handled with one code path.
     */
    private Map<String, Integer> parseColumnIndices(String[] headerRow) {
        Map<String, Integer> cols = new HashMap<>();
        for (int i = 0; i < headerRow.length; i++) {
            cols.put(headerRow[i].trim().toLowerCase(), i);
        }
        return cols;
    }

    private String col(String[] row, Map<String, Integer> cols, String name) {
        Integer idx = cols.get(name);
        return (idx != null && idx < row.length) ? row[idx].trim() : "";
    }

    // -------------------------------------------------------------------------
    // Static data loaders
    // -------------------------------------------------------------------------

    /**
     * Parses stops.txt and populates stopDirectory.
     *
     * <p>rapid-bus-kl:        stop_id, stop_name, stop_desc, stop_lat, stop_lon
     * <p>rapid-bus-mrtfeeder: stop_id, stop_code, stop_name, stop_lat, stop_lon
     */
    private void loadStops(String folderPath) throws Exception {
        String category = folderPath.substring(folderPath.lastIndexOf('/') + 1);
        ClassPathResource resource = new ClassPathResource(folderPath + "/stops.txt");

        try (CSVReader reader = new CSVReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            Map<String, Integer> cols = parseColumnIndices(reader.readNext());
            String[] row;
            while ((row = reader.readNext()) != null) {
                String id = col(row, cols, "stop_id");
                String name = col(row, cols, "stop_name");
                double lat = Double.parseDouble(col(row, cols, "stop_lat"));
                double lon = Double.parseDouble(col(row, cols, "stop_lon"));

                if (stopDirectory.containsKey(id)) {
                    System.out.println("⚠️  Stop ID collision: " + id + " — overwriting with definition from " + category);
                }
                stopDirectory.put(id, new Stop(id, name, lat, lon, category));
            }
        }
    }

    /**
     * Parses routes.txt, populates routeDirectory, and builds the shortNameToRouteId map.
     *
     * <p>rapid-bus-kl:        route_id, agency_id, route_short_name, route_long_name, ...
     * <p>rapid-bus-mrtfeeder: route_id, agency_id, (blank), route_short_name, route_long_name, ...
     *
     * <p>MRT Feeder short names are blank in the raw file — the long name column is used instead.
     * After normalisation, short name is the public identifier (e.g. "T815") and route_id is
     * the internal GTFS key (e.g. "30000016"). Both are stored; shortNameToRouteId maps between them.
     */
    private void loadRoutes(String folderPath) throws Exception {
        String category = folderPath.substring(folderPath.lastIndexOf('/') + 1);
        ClassPathResource resource = new ClassPathResource(folderPath + "/routes.txt");

        try (CSVReader reader = new CSVReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            Map<String, Integer> cols = parseColumnIndices(reader.readNext());
            String[] row;
            while ((row = reader.readNext()) != null) {
                String id = col(row, cols, "route_id");
                String name = col(row, cols, "route_short_name");
                String longName = col(row, cols, "route_long_name");

                if (name.isEmpty()) name = longName;

                if (routeDirectory.containsKey(id)) {
                    System.out.println("⚠️  Route ID collision: " + id + " — overwriting with updated definition.");
                }

                Route route = new Route(id, name, longName);
                route.setCategory(category);
                routeDirectory.put(id, route);

                // Register the short name → internal ID mapping.
                // If two routes share a short name (shouldn't happen, but log it).
                if (!name.isEmpty()) {
                    if (shortNameToRouteId.containsKey(name)) {
                        System.out.println("⚠️  Short name collision: \"" + name + "\" used by both "
                                + shortNameToRouteId.get(name) + " and " + id + ". Keeping first.");
                    } else {
                        shortNameToRouteId.put(name, id);
                    }
                }
            }
        }
    }

    /**
     * Parses shapes.txt and builds shapePolylines.
     *
     * <p>Each shape is stored as an ordered list of [lat, lon, cumulativeDistKm] triples.
     * For rapid-bus-mrtfeeder, shape_dist_traveled is read directly. For rapid-bus-kl
     * (where it is absent), cumulative distance is computed by summing arc-lengths between
     * consecutive shape points.
     */
    private void loadShapes(String folderPath) throws Exception {
        ClassPathResource resource = new ClassPathResource(folderPath + "/shapes.txt");
        Map<String, List<double[]>> rawPoints = new HashMap<>();

        try (CSVReader reader = new CSVReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            Map<String, Integer> cols = parseColumnIndices(reader.readNext());
            boolean hasDistTraveled = cols.containsKey("shape_dist_traveled");

            String[] row;
            while ((row = reader.readNext()) != null) {
                String shapeId = col(row, cols, "shape_id");
                double lat = Double.parseDouble(col(row, cols, "shape_pt_lat"));
                double lon = Double.parseDouble(col(row, cols, "shape_pt_lon"));
                double seq = Double.parseDouble(col(row, cols, "shape_pt_sequence"));
                double dist = hasDistTraveled ? Double.parseDouble(col(row, cols, "shape_dist_traveled")) : -1;

                rawPoints.computeIfAbsent(shapeId, k -> new ArrayList<>())
                         .add(new double[]{seq, lat, lon, dist});
            }
        }

        for (Map.Entry<String, List<double[]>> entry : rawPoints.entrySet()) {
            List<double[]> points = entry.getValue();
            points.sort(Comparator.comparingDouble(p -> p[0]));

            List<double[]> polyline = new ArrayList<>(points.size());
            double cumDist = 0.0;

            for (int i = 0; i < points.size(); i++) {
                double[] p = points.get(i);
                double lat = p[1], lon = p[2];

                if (p[3] >= 0) {
                    cumDist = p[3];
                } else if (i > 0) {
                    double[] prev = polyline.get(i - 1);
                    cumDist += haversineDistanceKm(prev[0], prev[1], lat, lon);
                }
                polyline.add(new double[]{lat, lon, cumDist});
            }
            shapePolylines.put(entry.getKey(), polyline);
        }
    }

    /**
     * Selects one representative trip per route-direction from trips.txt,
     * records the shape_id per route-direction, populates route headsigns,
     * and initialises routePaths entries.
     *
     * <p>Returns tripId → [routeId, directionId, shapeId].
     */
    private Map<String, String[]> loadRepresentativeTrips(String folderPath) throws Exception {
        Map<String, String[]> tripToRouteDirection = new HashMap<>();
        Set<String> seenRouteDirections = new HashSet<>();

        ClassPathResource resource = new ClassPathResource(folderPath + "/trips.txt");

        try (CSVReader reader = new CSVReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            Map<String, Integer> cols = parseColumnIndices(reader.readNext());
            String[] row;
            while ((row = reader.readNext()) != null) {
                String routeId = col(row, cols, "route_id");
                String tripId = col(row, cols, "trip_id");
                String directionId = col(row, cols, "direction_id");
                String shapeId = col(row, cols, "shape_id");
                String headsign = col(row, cols, "trip_headsign");

                String pathKey = routeId + "_" + directionId;
                if (seenRouteDirections.add(pathKey)) {
                    tripToRouteDirection.put(tripId, new String[]{routeId, directionId, shapeId});
                    routePaths.putIfAbsent(pathKey, new LinkedList<>());
                    routeDirectionToShapeId.put(pathKey, shapeId);

                    Route route = routeDirectory.get(routeId);
                    if (route != null && !headsign.isEmpty()) {
                        if ("0".equals(directionId)) route.setHeadsignOutbound(headsign);
                        else route.setHeadsignInbound(headsign);
                    }
                }
            }
        }
        return tripToRouteDirection;
    }

    /**
     * Parses stop_times.txt to build route path LinkedLists, the adjacency graph,
     * and — where available — stop cumulative distances from shape_dist_traveled.
     */
    private void buildGraphsAndPaths(String folderPath) throws Exception {
        Map<String, String[]> targetTrips = loadRepresentativeTrips(folderPath);
        ClassPathResource resource = new ClassPathResource(folderPath + "/stop_times.txt");

        Map<String, List<Double>> distanceAccumulator = new HashMap<>();

        try (CSVReader reader = new CSVReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            Map<String, Integer> cols = parseColumnIndices(reader.readNext());
            boolean hasDistTraveled = cols.containsKey("shape_dist_traveled");

            String previousStopId = null;
            String currentTripId = null;

            String[] row;
            while ((row = reader.readNext()) != null) {
                String tripId = col(row, cols, "trip_id");
                String stopId = col(row, cols, "stop_id");

                if (!targetTrips.containsKey(tripId)) continue;

                if (!tripId.equals(currentTripId)) {
                    previousStopId = null;
                    currentTripId = tripId;
                }

                String[] routeDirection = targetTrips.get(tripId);
                String pathKey = routeDirection[0] + "_" + routeDirection[1];

                LinkedList<String> path = routePaths.get(pathKey);
                if (path.isEmpty() || !path.getLast().equals(stopId)) {
                    path.add(stopId);

                    if (hasDistTraveled) {
                        String distStr = col(row, cols, "shape_dist_traveled");
                        double dist = distStr.isEmpty() ? 0.0 : Double.parseDouble(distStr);
                        distanceAccumulator.computeIfAbsent(pathKey, k -> new ArrayList<>()).add(dist);
                    }
                }

                if (previousStopId != null) {
                    stopGraph.computeIfAbsent(previousStopId, k -> new ArrayList<>()).add(stopId);
                }

                previousStopId = stopId;
            }
        }

        stopCumulativeDistances.putAll(distanceAccumulator);

        for (Map.Entry<String, String[]> entry : targetTrips.entrySet()) {
            String[] routeDirection = entry.getValue();
            String pathKey = routeDirection[0] + "_" + routeDirection[1];
            if (!stopCumulativeDistances.containsKey(pathKey)) {
                computeStopDistancesFromShapes(pathKey, routeDirection[2]);
            }
        }
    }

    /**
     * Projects each stop onto the shape polyline and records its cumulative road distance.
     * Falls back to index-based placeholders if the shape is unavailable.
     */
    private void computeStopDistancesFromShapes(String pathKey, String shapeId) {
        LinkedList<String> path = routePaths.get(pathKey);
        if (path == null || path.isEmpty()) return;

        List<double[]> polyline = shapePolylines.get(shapeId);
        List<Double> distances = new ArrayList<>(path.size());

        if (polyline == null || polyline.isEmpty()) {
            for (int i = 0; i < path.size(); i++) distances.add((double) i);
            stopCumulativeDistances.put(pathKey, distances);
            return;
        }

        for (String stopId : path) {
            Stop stop = stopDirectory.get(stopId);
            if (stop == null) {
                distances.add(distances.isEmpty() ? 0.0 : distances.get(distances.size() - 1));
                continue;
            }
            double minDist = Double.MAX_VALUE;
            double closestCumDist = 0.0;
            for (double[] point : polyline) {
                double d = haversineDistanceKm(stop.getLatitude(), stop.getLongitude(), point[0], point[1]);
                if (d < minDist) {
                    minDist = d;
                    closestCumDist = point[2];
                }
            }
            distances.add(closestCumDist);
        }

        stopCumulativeDistances.put(pathKey, distances);
    }

    // -------------------------------------------------------------------------
    // Search
    // -------------------------------------------------------------------------

    /** Case-insensitive name search across all stops. Returns up to 10 matches. */
    public List<Stop> searchStops(String query) {
        List<Stop> results = new ArrayList<>();
        String lowerQuery = query.toLowerCase();
        for (Stop stop : stopDirectory.values()) {
            if (stop.getName().toLowerCase().contains(lowerQuery)) {
                results.add(stop);
                if (results.size() >= 10) break;
            }
        }
        return results;
    }

    /** Case-insensitive name search across all routes (short name and long name). Returns up to 10 matches. */
    public List<Route> searchRoutes(String query) {
        List<Route> results = new ArrayList<>();
        String lowerQuery = query.toLowerCase();
        for (Route route : routeDirectory.values()) {
            if (route.getName().toLowerCase().contains(lowerQuery)
                    || (route.getLongName() != null && route.getLongName().toLowerCase().contains(lowerQuery))) {
                results.add(route);
                if (results.size() >= 10) break;
            }
        }
        return results;
    }

    // -------------------------------------------------------------------------
    // Geometry helpers
    // -------------------------------------------------------------------------

    private double haversineDistanceKm(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // -------------------------------------------------------------------------
    // Public accessors
    // -------------------------------------------------------------------------

    public Stop getStopById(String id) { return stopDirectory.get(id); }
    public Route getRouteById(String id) { return routeDirectory.get(id); }

    /**
     * Resolves a public route short name to the internal GTFS route_id used as the
     * key in routePaths and stopCumulativeDistances.
     *
     * <p>e.g. "T815" → "30000016", "T789" → "T7890".
     *
     * @param shortName The route short name as displayed on buses and broadcast by Prasarana.
     * @return The internal route_id, or the original shortName unchanged if no mapping exists
     *         (allowing the caller to fall back to treating the input as a direct key).
     */
    public String resolveRouteIdByShortName(String shortName) {
        return shortNameToRouteId.getOrDefault(shortName, shortName);
    }

    /**
     * Returns the ordered stop ID sequence for a route and direction.
     * {@code routeId} must be the internal GTFS route_id — use
     * {@link #resolveRouteIdByShortName(String)} to convert a short name first.
     *
     * @param directionId 0 = outbound, 1 = inbound.
     */
    public LinkedList<String> getRoutePath(String routeId, int directionId) {
        return routePaths.get(routeId + "_" + directionId);
    }

    /**
     * Returns the outbound (direction 0) stop sequence for a route.
     * Used by GET /routes/{shortName}/path for map polyline rendering.
     */
    public LinkedList<String> getRoutePath(String routeId) {
        return routePaths.get(routeId + "_0");
    }

    /**
     * Returns the pre-computed cumulative road distances (km) from route start to each stop,
     * indexed parallel to the list returned by {@link #getRoutePath(String, int)}.
     * {@code routeId} must be the internal GTFS route_id.
     */
    public List<Double> getStopCumulativeDistances(String routeId, int directionId) {
        return stopCumulativeDistances.get(routeId + "_" + directionId);
    }

    public List<String> getAdjacentStops(String stopId) {
        return stopGraph.getOrDefault(stopId, Collections.emptyList());
    }

    // -------------------------------------------------------------------------
    // Stop → route inverted index
    // -------------------------------------------------------------------------

    /**
     * Builds the inverted index from stop ID to the route-direction pairs that serve it.
     *
     * <p>Iterates over every entry in {@code routePaths} (one per route-direction) and
     * registers each stop in that path against the route. Called once after all feeds
     * are loaded and {@code routePaths} is fully populated.
     *
     * <p>Time complexity: O(R × S) at startup, where R = total route-direction pairs
     * and S = average stops per route-direction. O(1) per request after that.
     */
    private void buildStopIndex() {
        for (Map.Entry<String, LinkedList<String>> entry : routePaths.entrySet()) {
            String pathKey = entry.getKey(); // "routeId_directionId"
            int separatorIdx = pathKey.lastIndexOf('_');
            if (separatorIdx == -1) continue;

            String routeId = pathKey.substring(0, separatorIdx);
            int directionId;
            try {
                directionId = Integer.parseInt(pathKey.substring(separatorIdx + 1));
            } catch (NumberFormatException e) {
                continue;
            }

            for (String stopId : entry.getValue()) {
                stopToRouteDirections
                        .computeIfAbsent(stopId, k -> new ArrayList<>())
                        .add(new RouteAtStop(routeId, directionId));
            }
        }
    }

    /**
     * Returns all routes that serve the given stop, including which direction(s) each
     * route serves it in.
     *
     * <p>Multiple entries for the same route with different {@code directionId} values
     * are merged into a single result so the frontend sees one entry per route with
     * {@code servesOutbound} and {@code servesInbound} flags.
     *
     * <p>Time complexity: O(1) index lookup + O(k) merge, where k = number of
     * route-direction pairs serving this stop (typically 2–10).
     *
     * @param stopId stop_id from stops.txt (e.g. "12000802").
     * @return List of route payloads, each containing shortName, longName, headsigns,
     *         and direction availability flags. Empty if the stop is unknown or unserved.
     */
    public List<Map<String, Object>> getRoutesForStop(String stopId) {
        List<RouteAtStop> entries = stopToRouteDirections.get(stopId);
        if (entries == null || entries.isEmpty()) return Collections.emptyList();

        // Merge direction flags per route: routeId → {servesOutbound, servesInbound}
        Map<String, boolean[]> routeDirectionFlags = new LinkedHashMap<>();
        for (RouteAtStop entry : entries) {
            boolean[] flags = routeDirectionFlags.computeIfAbsent(
                    entry.routeId, k -> new boolean[]{false, false});
            if (entry.directionId == 0) flags[0] = true;
            else if (entry.directionId == 1) flags[1] = true;
        }

        List<Map<String, Object>> results = new ArrayList<>();
        for (Map.Entry<String, boolean[]> entry : routeDirectionFlags.entrySet()) {
            Route route = routeDirectory.get(entry.getKey());
            if (route == null) continue;

            boolean[] flags = entry.getValue();
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("shortName", route.getName());
            payload.put("longName", route.getLongName());
            payload.put("headsignOutbound", route.getHeadsignOutbound());
            payload.put("headsignInbound", route.getHeadsignInbound());
            payload.put("servesOutbound", flags[0]);
            payload.put("servesInbound", flags[1]);
            payload.put("category", route.getCategory());
            results.add(payload);
        }

        return results;
    }

    /** Index entry representing a single route-direction pair serving a stop. */
    private static class RouteAtStop {
        final String routeId;
        final int directionId;

        RouteAtStop(String routeId, int directionId) {
            this.routeId = routeId;
            this.directionId = directionId;
        }
    }
}
