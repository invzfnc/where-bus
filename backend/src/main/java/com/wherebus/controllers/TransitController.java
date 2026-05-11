package com.wherebus.controllers;

import com.wherebus.models.Route;
import com.wherebus.models.Stop;
import com.wherebus.services.EtaCalculationService;
import com.wherebus.services.TransitService;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;

/**
 * REST Controller serving both static transit structures and real-time arrival predictions.
 */
@RestController
@RequestMapping("/api/transit")
@CrossOrigin(origins = "http://localhost:3000") // Allows Next.js to fetch data without CORS blocks
public class TransitController {

    private final TransitService transitService;
    private final EtaCalculationService etaCalculationService;

    public TransitController(TransitService transitService, EtaCalculationService etaCalculationService) {
        this.transitService = transitService;
        this.etaCalculationService = etaCalculationService;
    }

    /**
     * Quick verification endpoint to confirm core dependency injection.
     * Example: GET http://localhost:8080/api/transit/test
     */
    @GetMapping("/test")
    public String testDataLink() {
        Stop stop = transitService.getStopById("1006035");
        if (stop != null) {
            return "TransitService is wired up! Found stop: " + stop.getName();
        }
        return "TransitService is wired up, but stop 1006035 is missing.";
    }

    /**
     * Retrieves basic descriptive details for a specific route.
     * Example: GET /api/transit/routes/T789
     */
    @GetMapping("/routes/{routeId}")
    public Route getRouteDetails(@PathVariable String routeId) {
        return transitService.getRouteById(routeId);
    }

    /**
     * Retrieves the exact ordered sequence of physical stops for a given route path.
     * Example: GET /api/transit/routes/T789/path
     */
    @GetMapping("/routes/{routeId}/path")
    public List<Stop> getRoutePath(@PathVariable String routeId) {
        LinkedList<String> stopIds = transitService.getRoutePath(routeId);
        List<Stop> path = new ArrayList<>();

        if (stopIds == null) {
            return path;
        }

        for (String stopId : stopIds) {
            Stop stop = transitService.getStopById(stopId);
            if (stop != null) {
                path.add(stop);
            }
        }

        return path;
    }

    /**
     * Unified search endpoint querying both stops and routes via string matching.
     * Example: GET /api/transit/search?q=Masjid
     */
    @GetMapping("/search")
    public Map<String, Object> searchTransit(@RequestParam String q) {
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
     * Computes and returns real-time approaching vehicles sorted by lowest ETA via a Priority Queue.
     * Example: GET /api/transit/eta?routeId=T789&stopId=100432
     */
    @GetMapping("/eta")
    public List<Map<String, Object>> getRealtimeEta(
            @RequestParam String routeId,
            @RequestParam String stopId) {
        return etaCalculationService.getArrivalsForStop(routeId, stopId);
    }
}