package com.wherebus.services;

import com.google.transit.realtime.GtfsRealtime.VehiclePosition;
import com.wherebus.models.Stop;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Service responsible for calculating real-time ETAs using geographic math
 * and sorting incoming arrivals via a Priority Queue (Min-Heap).
 */
@Service
public class EtaCalculationService {

    private final TransitService transitService;
    private final LiveTrackingService liveTrackingService;

    // Average inner-city bus speed in Kuala Lumpur (roughly 20 km/h expressed in meters per second)
    private static final double DEFAULT_BUS_SPEED_MPS = 5.5;

    public EtaCalculationService(TransitService transitService, LiveTrackingService liveTrackingService) {
        this.transitService = transitService;
        this.liveTrackingService = liveTrackingService;
    }

    /**
     * Calculates and orders all approaching buses for a specific stop on a specific route.
     */
    public List<Map<String, Object>> getArrivalsForStop(String routeId, String targetStopId) {
        Stop targetStop = transitService.getStopById(targetStopId);
        if (targetStop == null) {
            return Collections.emptyList();
        }

        // 1. Initialize a Priority Queue that sorts arrivals by the lowest ETA (seconds remaining)
        PriorityQueue<ArrivalPrediction> arrivalHeap = new PriorityQueue<>(
                Comparator.comparingInt(ArrivalPrediction::getSecondsRemaining)
        );

        // 2. Grab the live fleet from memory
        Map<String, VehiclePosition> activeFleet = liveTrackingService.getActiveVehicles();

        // 3. Filter and calculate ETAs
        for (Map.Entry<String, VehiclePosition> entry : activeFleet.entrySet()) {
            VehiclePosition vehicle = entry.getValue();

            // In GTFS-RT, the route ID is typically stored inside the Trip descriptor
            if (vehicle.hasTrip() && routeId.equalsIgnoreCase(vehicle.getTrip().getRouteId())) {

                double busLat = vehicle.getPosition().getLatitude();
                double busLon = vehicle.getPosition().getLongitude();

                // Calculate spherical distance in meters using the Haversine formula
                double distanceMeters = calculateHaversineDistance(
                        busLat, busLon, targetStop.getLatitude(), targetStop.getLongitude()
                );

                // Try to get live speed from the bus, otherwise use our KL average fallback
                double speedMps = vehicle.getPosition().hasSpeed() && vehicle.getPosition().getSpeed() > 1.0
                        ? vehicle.getPosition().getSpeed()
                        : DEFAULT_BUS_SPEED_MPS;

                int secondsRemaining = (int) (distanceMeters / speedMps);

                // Only queue buses that are within a reasonable distance (e.g., less than 15km away)
                if (distanceMeters < 15000) {
                    String licensePlate = vehicle.getVehicle().hasLicensePlate()
                            ? vehicle.getVehicle().getLicensePlate()
                            : entry.getKey();

                    arrivalHeap.offer(new ArrivalPrediction(
                            entry.getKey(), licensePlate, distanceMeters, secondsRemaining
                    ));
                }
            }
        }

        // 4. Drain the Priority Queue into an ordered list for the JSON response
        List<Map<String, Object>> sortedArrivals = new ArrayList<>();
        while (!arrivalHeap.isEmpty()) {
            ArrivalPrediction prediction = arrivalHeap.poll();

            Map<String, Object> payload = new HashMap<>();
            payload.put("vehicleId", prediction.getVehicleId());
            payload.put("licensePlate", prediction.getLicensePlate());
            payload.put("distanceMeters", Math.round(prediction.getDistanceMeters()));
            payload.put("etaSeconds", prediction.getSecondsRemaining());
            payload.put("etaFormatted", formatEta(prediction.getSecondsRemaining()));

            sortedArrivals.add(payload);
        }

        return sortedArrivals;
    }

    /**
     * The Haversine Formula.
     * Calculates the great-circle distance between two GPS coordinates in meters.
     */
    private double calculateHaversineDistance(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371000; // Earth radius in meters
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);

        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);

        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private String formatEta(int totalSeconds) {
        if (totalSeconds < 60) return "Arriving";
        int minutes = totalSeconds / 60;
        return minutes + " min";
    }

    /**
     * Internal helper class representing an item inside our Priority Queue.
     */
    private static class ArrivalPrediction {
        private final String vehicleId;
        private final String licensePlate;
        private final double distanceMeters;
        private final int secondsRemaining;

        public ArrivalPrediction(String vehicleId, String licensePlate, double distanceMeters, int secondsRemaining) {
            this.vehicleId = vehicleId;
            this.licensePlate = licensePlate;
            this.distanceMeters = distanceMeters;
            this.secondsRemaining = secondsRemaining;
        }

        public String getVehicleId() { return vehicleId; }
        public String getLicensePlate() { return licensePlate; }
        public double getDistanceMeters() { return distanceMeters; }
        public int getSecondsRemaining() { return secondsRemaining; }
    }
}
