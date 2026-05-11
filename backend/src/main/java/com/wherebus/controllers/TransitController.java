package com.wherebus.controllers;

import com.google.transit.realtime.GtfsRealtime.VehiclePosition;
import com.wherebus.models.Route;
import com.wherebus.models.Stop;
import com.wherebus.services.EtaCalculationService;
import com.wherebus.services.LiveTrackingService;
import com.wherebus.services.TransitService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST Controller serving static transit structures, real-time arrival predictions,
 * and live fleet debugging telemetry.
 */
@RestController
@RequestMapping("/api/transit")
@CrossOrigin(origins = "http://localhost:3000") // Allows Next.js to fetch data without CORS blocks
@Tag(name = "Transit Engine Endpoints", description = "Operations serving static memory data, linked-list path resolution, and live GTFS-Realtime calculations.")
public class TransitController {

    private final TransitService transitService;
    private final EtaCalculationService etaCalculationService;
    private final LiveTrackingService liveTrackingService;

    // Spring automatically injects all three required services here
    public TransitController(
            TransitService transitService,
            EtaCalculationService etaCalculationService,
            LiveTrackingService liveTrackingService) {
        this.transitService = transitService;
        this.etaCalculationService = etaCalculationService;
        this.liveTrackingService = liveTrackingService;
    }

    /**
     * Hit http://localhost:8080/api/transit/test to verify the service is injected properly.
     */
    @Operation(
            summary = "Verify Core Wiring",
            description = "A basic health check that confirms dependency injection is active and tests reading a designated stop identifier directly from the internal Hash Table."
    )
    @ApiResponse(
            responseCode = "200",
            description = "Service verified successfully. Returns a plain string confirming the stop lookup status.",
            content = @Content(mediaType = "text/plain", examples = @ExampleObject(value = "TransitService is wired up! Found stop: KL1441 KL GATEWAY - LRT UNIVERSITI,L/RAYA PERSEKUTUAN"))
    )
    @GetMapping("/test")
    public String testDataLink() {
        Stop stop = transitService.getStopById("1006035");
        if (stop != null) {
            return "TransitService is wired up! Found stop: " + stop.getName();
        }
        return "TransitService is wired up, but stop 1006035 is missing.";
    }

    /**
     * Retrieves the basic details of a specific route.
     * Example: GET /api/transit/routes/T7890
     */
    @Operation(
            summary = "Get Route Metadata",
            description = "Pulls static descriptive details for a designated route directly from the in-memory route directory."
    )
    @ApiResponse(
            responseCode = "200",
            description = "Route payload retrieved successfully.",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = Route.class))
    )
    @GetMapping("/routes/{routeId}")
    public Route getRouteDetails(
            @Parameter(description = "Alphanumeric key identifying the route.", example = "T7890")
            @PathVariable String routeId) {
        return transitService.getRouteById(routeId);
    }

    /**
     * Retrieves the exact sequence of stops for a given route.
     * This converts the linked list of string IDs into a list of actual Stop objects
     * (containing latitudes and longitudes) so the Next.js map can draw the line.
     * Example: GET /api/transit/routes/T7890/path
     */
    @Operation(
            summary = "Resolve Geographical Path",
            description = "Transforms an internal Linked List of stop string keys into an ordered sequence of physical Stop entities containing precise geographic telemetry."
    )
    @ApiResponse(
            responseCode = "200",
            description = "Ordered array of coordinate points returned successfully.",
            content = @Content(mediaType = "application/json", array = @ArraySchema(schema = @Schema(implementation = Stop.class)))
    )
    @GetMapping("/routes/{routeId}/path")
    public List<Stop> getRoutePath(
            @Parameter(description = "Target route identifier to resolve.", example = "T7890")
            @PathVariable String routeId) {
        LinkedList<String> stopIds = transitService.getRoutePath(routeId);
        List<Stop> path = new ArrayList<>();

        if (stopIds == null) {
            return path; // Return empty list if route doesn't exist
        }

        // Loop through the linked list and fetch the actual coordinate data from the hash table
        for (String stopId : stopIds) {
            Stop stop = transitService.getStopById(stopId);
            if (stop != null) {
                path.add(stop);
            }
        }

        return path;
    }

    /**
     * Unified search endpoint for stops and routes.
     * Example: GET /api/transit/search?q=Universiti
     */
    @Operation(
            summary = "Search Directories",
            description = "Simultaneously queries both the static stops and routes memory directories via flexible string matching to feed client search modules."
    )
    @ApiResponse(
            responseCode = "200",
            description = "Matched search results returned successfully.",
            content = @Content(mediaType = "application/json", examples = @ExampleObject(
                    value = "{\n  \"stops\": [\n    {\n      \"id\": \"1001410\",\n      \"name\": \"KL1441 KL GATEWAY - LRT UNIVERSITI,L/RAYA PERSEKUTUAN\",\n      \"latitude\": 3.1147,\n      \"longitude\": 101.6618\n    }\n  ],\n  \"routes\": [\n    {\n      \"id\": \"T7890\",\n      \"name\": \"T789\",\n      \"longName\": \"Stesen LRT Universiti ~ Universiti Malaya via Pantai Hillpark\"\n    }\n  ]\n}"
            ))
    )
    @GetMapping("/search")
    public Map<String, Object> searchTransit(
            @Parameter(description = "Search term matching names, routes, or system keys.", example = "Universiti")
            @RequestParam String q) {
        Map<String, Object> response = new HashMap<>();

        if (q == null || q.trim().isEmpty()) {
            response.put("stops", new ArrayList<>());
            response.put("routes", new ArrayList<>());
            return response;
        }

        response.put("stops", transitService.searchStops(q));
        response.put("routes", transitService.searchRoutes(q));

        return response;
    }

    /**
     * Retrieves sorted real-time ETAs for a specific stop.
     * Example: GET /api/transit/eta?routeId=T789&stopId=1001410
     */
    @Operation(
            summary = "Calculate Real-Time Approaching ETAs",
            description = "Computes Haversine spherical distance metrics against active live vehicles and drains an internal Priority Queue (Min-Heap) to return arriving buses ordered strictly by lowest remaining travel time."
    )
    @ApiResponse(
            responseCode = "200",
            description = "Sorted list of arrival predictions returned successfully.",
            content = @Content(mediaType = "application/json", examples = @ExampleObject(
                    value = "[\n  {\n    \"vehicleId\": \"WB4408N\",\n    \"licensePlate\": \"WB4408N\",\n    \"distanceMeters\": 16,\n    \"etaSeconds\": 0,\n    \"etaFormatted\": \"Arriving\"\n  },\n  {\n    \"vehicleId\": \"VFE4091\",\n    \"licensePlate\": \"VFE4091\",\n    \"distanceMeters\": 850,\n    \"etaSeconds\": 154,\n    \"etaFormatted\": \"2 min\"\n  }\n]"
            ))
    )
    @GetMapping("/eta")
    public List<Map<String, Object>> getRealtimeEta(
            @Parameter(description = "Requested public route identifier.", example = "T789")
            @RequestParam String routeId,
            @Parameter(description = "Unique target stop system identifier.", example = "1001410")
            @RequestParam String stopId) {
        return etaCalculationService.getArrivalsForStop(routeId, stopId);
    }

    /**
     * Retrieves live GPS coordinates for all buses actively running on a route.
     * Example: GET /api/transit/vehicles?routeId=T789
     */
    @Operation(
            summary = "Get Active Fleet Coordinates",
            description = "Pulls raw GPS telemetry from the thread-safe ConcurrentHashMap for all actively moving buses assigned to a route, allowing the frontend map to animate moving markers. Accounts for Prasarana's internal trailing zero format."
    )
    @ApiResponse(
            responseCode = "200",
            description = "Live vehicle telemetry returned successfully.",
            content = @Content(mediaType = "application/json", examples = @ExampleObject(
                    value = "[\n  {\n    \"vehicleId\": \"WB4408N\",\n    \"licensePlate\": \"WB4408N\",\n    \"latitude\": 3.106551,\n    \"longitude\": 101.666084\n  }\n]"
            ))
    )
    @GetMapping("/vehicles")
    public List<Map<String, Object>> getLiveVehiclesForRoute(
            @Parameter(description = "Target public route ID to filter vehicles by.", example = "T789")
            @RequestParam String routeId) {
        List<Map<String, Object>> vehicles = new ArrayList<>();
        Map<String, com.google.transit.realtime.GtfsRealtime.VehiclePosition> fleet =
                liveTrackingService.getActiveVehicles();

        for (Map.Entry<String, com.google.transit.realtime.GtfsRealtime.VehiclePosition> entry : fleet.entrySet()) {
            com.google.transit.realtime.GtfsRealtime.VehiclePosition v = entry.getValue();

            if (v.hasTrip()) {
                String broadcastedRouteId = v.getTrip().getRouteId();

                // Match requested route exactly OR match with Prasarana's appended '0'
                if (routeId.equalsIgnoreCase(broadcastedRouteId) || (routeId + "0").equalsIgnoreCase(broadcastedRouteId)) {
                    Map<String, Object> busData = new HashMap<>();
                    busData.put("vehicleId", entry.getKey());
                    busData.put("latitude", v.getPosition().getLatitude());
                    busData.put("longitude", v.getPosition().getLongitude());
                    busData.put("licensePlate", v.getVehicle().hasLicensePlate()
                            ? v.getVehicle().getLicensePlate()
                            : entry.getKey());

                    vehicles.add(busData);
                }
            }
        }
        return vehicles;
    }

    /**
     * TEMPORARY DEBUG ENDPOINT
     * Hit http://localhost:8080/api/transit/debug-fleet to see exactly how Prasarana
     * is formatting their active Route IDs right now.
     */
    @Operation(
            summary = "Debug Active Fleet Feed",
            description = "A development utility that outputs the total size of the active memory table alongside raw telemetry samples to verify live broadcast structures."
    )
    @ApiResponse(
            responseCode = "200",
            description = "Raw fleet debug metrics compiled successfully.",
            content = @Content(mediaType = "application/json", examples = @ExampleObject(
                    value = "{\n  \"totalActiveBuses\": 130,\n  \"uniqueRoutesActiveNow\": [\"T7890\", \"T6400\", \"U6000\"],\n  \"sampleVehicleData\": [\n    {\n      \"vehicleId\": \"WB4408N\",\n      \"broadcastedRouteId\": \"T7890\",\n      \"lat\": 3.106551,\n      \"lon\": 101.666084\n    }\n  ]\n}"
            ))
    )
    @GetMapping("/debug-fleet")
    public Map<String, Object> debugActiveFleet() {
        Map<String, Object> response = new HashMap<>();
        Map<String, VehiclePosition> fleet = liveTrackingService.getActiveVehicles();

        response.put("totalActiveBuses", fleet.size());

        // Collect all unique Route IDs currently moving in the city
        Set<String> activeRouteIds = new HashSet<>();
        List<Map<String, Object>> sampleBuses = new ArrayList<>();

        int count = 0;
        for (Map.Entry<String, VehiclePosition> entry : fleet.entrySet()) {
            VehiclePosition v = entry.getValue();

            String routeId = v.hasTrip() ? v.getTrip().getRouteId() : "NO_ROUTE_ID";
            activeRouteIds.add(routeId);

            // Grab a few samples to inspect the raw data structure
            if (count < 5) {
                Map<String, Object> sample = new HashMap<>();
                sample.put("vehicleId", entry.getKey());
                sample.put("broadcastedRouteId", routeId);
                sample.put("lat", v.getPosition().getLatitude());
                sample.put("lon", v.getPosition().getLongitude());
                sampleBuses.add(sample);
                count++;
            }
        }

        response.put("uniqueRoutesActiveNow", activeRouteIds);
        response.put("sampleVehicleData", sampleBuses);

        return response;
    }
}