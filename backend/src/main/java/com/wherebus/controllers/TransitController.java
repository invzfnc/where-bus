package com.wherebus.controllers;

import com.wherebus.models.Route;
import com.wherebus.models.Stop;
import com.wherebus.services.EtaCalculationService;
import com.wherebus.services.LiveTrackingService;
import com.wherebus.services.TransitService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST endpoints for static transit data, live vehicle positions, and ETA predictions.
 *
 * <p><b>Route identifier convention:</b> All endpoints that accept a {@code routeId}
 * parameter expect the route <b>short name</b> — the public identifier printed on buses
 * and broadcast by Prasarana in the live GTFS-RT feed.
 * <ul>
 *   <li>MRT Feeder routes: use the short name (e.g. {@code "T815"}, {@code "T459"}).</li>
 *   <li>rapid-bus-kl routes: use the short name (e.g. {@code "T789"}, {@code "U300"}).</li>
 * </ul>
 * Do <b>not</b> pass the internal GTFS {@code route_id} from routes.txt (e.g.
 * {@code "30000016"}). Use {@code GET /search?q=T815} to look up a route's short name
 * and stop IDs before calling the live data endpoints.
 *
 * <p><b>Stop identifier convention:</b> All endpoints that accept a {@code stopId}
 * expect the {@code stop_id} value from stops.txt (numeric string, e.g. {@code "12000802"}).
 * Use {@code GET /search?q=Universiti} to find stop IDs by name.
 */
@RestController
@RequestMapping("/api/transit")
@CrossOrigin(origins = {"http://localhost:3000", "where-bus-app.vercel.app"})
@Tag(name = "Transit", description = "Routes, stops, live vehicle positions, and ETA predictions.")
public class TransitController {

    private final TransitService transitService;
    private final EtaCalculationService etaCalculationService;
    private final LiveTrackingService liveTrackingService;

    public TransitController(
            TransitService transitService,
            EtaCalculationService etaCalculationService,
            LiveTrackingService liveTrackingService) {
        this.transitService = transitService;
        this.etaCalculationService = etaCalculationService;
        this.liveTrackingService = liveTrackingService;
    }

    /**
     * Returns static metadata for a route given its short name.
     * GET /api/transit/routes/{shortName}
     */
    @Operation(
            summary = "Get route metadata",
            description = "Returns the route's short name, long name, and direction headsigns. "
                    + "Pass the route short name (e.g. 'T815'), not the internal GTFS route_id.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            schema = @Schema(implementation = Route.class)))
    @GetMapping("/routes/{shortName}")
    public Route getRouteDetails(
            @Parameter(description = "Route short name as displayed on buses.", example = "T815")
            @PathVariable String shortName) {
        String routeId = transitService.resolveRouteIdByShortName(shortName);
        return transitService.getRouteById(routeId);
    }

    /**
     * Returns the ordered outbound stop sequence for a route, suitable for drawing a map polyline.
     * GET /api/transit/routes/{shortName}/path
     */
    @Operation(
            summary = "Get outbound route stop sequence",
            description = "Returns stops in outbound (direction 0) order. "
                    + "Pass the route short name (e.g. 'T815').")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json",
            array = @ArraySchema(schema = @Schema(implementation = Stop.class))))
    @GetMapping("/routes/{shortName}/path")
    public List<Stop> getRoutePath(
            @Parameter(description = "Route short name as displayed on buses.", example = "T815")
            @PathVariable String shortName) {
        String routeId = transitService.resolveRouteIdByShortName(shortName);
        LinkedList<String> stopIds = transitService.getRoutePath(routeId);
        if (stopIds == null) return Collections.emptyList();

        List<Stop> path = new ArrayList<>();
        for (String stopId : stopIds) {
            Stop stop = transitService.getStopById(stopId);
            if (stop != null) path.add(stop);
        }
        return path;
    }

    /**
     * Searches stops and routes by name. Returns up to 10 results per category.
     * GET /api/transit/search?q=Universiti
     *
     * <p>Use the {@code name} field from route results as the {@code routeId} for
     * {@code /vehicles} and {@code /eta}. Use the {@code id} field from stop results
     * as the {@code stopId}.
     */
    @Operation(
            summary = "Search stops and routes by name",
            description = "Returns up to 10 matching stops and routes. "
                    + "From route results, use the 'name' field (short name, e.g. 'T815') as the routeId for /vehicles and /eta. "
                    + "From stop results, use the 'id' field (e.g. '12000802') as the stopId.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json"))
    @GetMapping("/search")
    public Map<String, Object> searchTransit(
            @Parameter(description = "Partial stop name or route number.", example = "Universiti")
            @RequestParam String q) {
        if (q == null || q.trim().isEmpty()) {
            return Map.of("stops", List.of(), "routes", List.of());
        }
        return Map.of(
                "stops", transitService.searchStops(q),
                "routes", transitService.searchRoutes(q)
        );
    }

    /**
     * Returns active buses approaching a stop, sorted by ascending ETA.
     * GET /api/transit/eta?routeId=T815&stopId=12000802
     */
    @Operation(
            summary = "Get real-time ETAs for a stop",
            description = "Returns buses approaching the given stop on the given route, sorted by ETA. "
                    + "**routeId**: pass the route short name (e.g. 'T815' or 'T789') — "
                    + "do NOT pass the internal GTFS route_id (e.g. '30000016'). "
                    + "**stopId**: pass the stop_id from stops.txt (e.g. '12000802'). "
                    + "Use /search to find both values by name. "
                    + "Each result includes: "
                    + "**directionId** (0 = outbound, 1 = inbound) for filtering by direction of travel; "
                    + "**stopsAway** (integer) — number of stops between the bus and the target stop "
                    + "derived from the static GTFS stop sequence, null if shape data is unavailable for the route.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json"))
    @GetMapping("/eta")
    public List<Map<String, Object>> getRealtimeEta(
            @Parameter(description = "Route short name (e.g. 'T815'). Not the internal route_id.", example = "T815")
            @RequestParam String routeId,
            @Parameter(description = "stop_id from stops.txt.", example = "12000802")
            @RequestParam String stopId) {
        return etaCalculationService.getArrivalsForStop(routeId, stopId);
    }

    /**
     * Returns all routes that serve the given stop, with direction availability flags.
     * GET /api/transit/stops/{stopId}/routes
     *
     * <p>Each result includes:
     * <ul>
     *   <li>{@code shortName} — use this as the {@code routeId} for /vehicles and /eta.</li>
     *   <li>{@code servesOutbound} / {@code servesInbound} — whether the route serves
     *       this stop in each direction. Use these to filter routes relevant to the
     *       user's direction of travel when they select a source and destination stop.</li>
     * </ul>
     */
    @Operation(
            summary = "Get routes serving a stop",
            description = "Returns all routes that stop at the given stop ID, with direction flags. "
                    + "Use the returned 'shortName' field as the routeId for /vehicles and /eta. "
                    + "Use 'servesOutbound' and 'servesInbound' to filter by the user's direction of travel. "
                    + "Use /search to find stop IDs by name.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json"))
    @GetMapping("/stops/{stopId}/routes")
    public List<Map<String, Object>> getRoutesForStop(
            @Parameter(description = "stop_id from stops.txt.", example = "12000802")
            @PathVariable String stopId) {
        return transitService.getRoutesForStop(stopId);
    }

    /**
     * GET /api/transit/vehicles?routeId=T815
     *
     * <p>Response fields per vehicle:
     * <ul>
     *   <li>{@code directionId}: 0 = outbound, 1 = inbound.</li>
     *   <li>{@code bearing}: degrees clockwise from True North; null if not broadcast.</li>
     * </ul>
     */
    @Operation(
            summary = "Get live vehicle positions for a route",
            description = "Returns GPS coordinates and direction for all active buses on the route. "
                    + "**routeId**: pass the route short name (e.g. 'T815' or 'T789') — "
                    + "do NOT pass the internal GTFS route_id. "
                    + "If results are unexpectedly empty, use /debug-fleet to verify the "
                    + "exact route ID format being broadcast by Prasarana.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json"))
    @GetMapping("/vehicles")
    public List<Map<String, Object>> getLiveVehiclesForRoute(
            @Parameter(description = "Route short name (e.g. 'T815'). Not the internal route_id.", example = "T815")
            @RequestParam String routeId) {
        return liveTrackingService.getVehiclesByRoute(routeId);
    }

    /**
     * Debug endpoint: shows the raw Prasarana broadcast structure for the live fleet.
     * GET /api/transit/debug-fleet
     *
     * <p>Check {@code uniqueRoutesActiveNow} to see the exact route ID format Prasarana is
     * broadcasting. If a route short name is not in that list, either no buses are currently
     * active or the feed is using a different format than expected.
     */
    @Operation(
            summary = "Debug live fleet feed",
            description = "Shows total active buses, all unique broadcasted route IDs, and 5 sample vehicles. "
                    + "Use this when /vehicles returns unexpected results to verify broadcast route ID formats.")
    @ApiResponse(responseCode = "200", content = @Content(mediaType = "application/json"))
    @GetMapping("/debug-fleet")
    public Map<String, Object> debugActiveFleet() {
        return liveTrackingService.getFleetSnapshot();
    }
}
