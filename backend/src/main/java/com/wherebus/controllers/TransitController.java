package com.wherebus.controllers;

import com.wherebus.models.Route;
import com.wherebus.models.Stop;
import com.wherebus.services.TransitService;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedList;
import java.util.List;

/**
 * REST Controller for serving static transit data to the frontend.
 * Allows the client app to search for routes, stops, and retrieve geographic paths.
 */
@RestController
@RequestMapping("/api/transit")
@CrossOrigin(origins = "http://localhost:3000") // Allows Next.js to fetch data without being blocked
public class TransitController {

    private final TransitService transitService;

    // Spring automatically injects the TransitService here
    public TransitController(TransitService transitService) {
        this.transitService = transitService;
    }

    /**
     * 1. THE QUICK TEST ENDPOINT
     * Hit http://localhost:8080/api/transit/test to verify the service is injected properly.
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
     * Retrieves the basic details of a specific route.
     * Example: GET /api/transit/routes/B1000
     */
    @GetMapping("/routes/{routeId}")
    public Route getRouteDetails(@PathVariable String routeId) {
        return transitService.getRouteById(routeId);
    }

    /**
     * Retrieves the exact sequence of stops for a given route.
     * This converts the linked list of string IDs into a list of actual Stop objects
     * (containing latitudes and longitudes) so the Next.js map can draw the line.
     * * Example: GET /api/transit/routes/B1000/path
     */
    @GetMapping("/routes/{routeId}/path")
    public List<Stop> getRoutePath(@PathVariable String routeId) {
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
}