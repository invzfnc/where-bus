package com.wherebus.services;

import com.google.transit.realtime.GtfsRealtime.VehiclePosition;
import com.wherebus.models.Stop;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Computes real-time ETAs for buses approaching a stop.
 *
 * <p><b>Route ID convention:</b> All public-facing methods accept the route <b>short name</b>
 * (e.g. {@code "T815"}, {@code "T789"}) — not the internal GTFS route_id. Resolution to the
 * internal key is handled transparently via {@link TransitService#resolveRouteIdByShortName}.
 *
 * <p><b>Distance:</b> Uses pre-computed cumulative road distances from shape polylines where
 * available. Falls back to Haversine × road correction factor when shape data is missing.
 *
 * <p><b>hasPassed():</b> Compares cumulative road arc-lengths. Falls back to no filtering
 * when shape data is unavailable.
 *
 * <p><b>ETA smoothing:</b> Raw ETA values are subject to noise from GPS jitter and
 * stop-snapping instability. A rolling average over the last {@code ETA_HISTORY_SIZE}
 * samples per vehicle-stop pair is applied before returning results. This absorbs
 * single-poll spikes without introducing meaningful display lag.
 *
 * <p><b>Filters:</b>
 * <ul>
 *   <li>Buses with a smoothed ETA above {@code MAX_ETA_SECONDS} (35 minutes) are excluded.</li>
 *   <li>"Arriving" is only shown when road distance is below {@code ARRIVING_DISTANCE_METERS},
 *       preventing a high-speed GPS reading from prematurely marking a distant bus as arrived.</li>
 * </ul>
 *
 * <p><b>Cache eviction:</b> The ETA history cache is pruned of entries for vehicles no longer
 * in the active fleet at the start of each request, preventing unbounded memory growth.
 *
 * <p><b>Speed:</b> Delegates entirely to {@link LiveTrackingService#getSpeedMps}.
 */
@Service
public class EtaCalculationService {

    private final TransitService transitService;
    private final LiveTrackingService liveTrackingService;

    // Fallback multiplier when shape-based road distance is unavailable.
    private static final double HAVERSINE_ROAD_FACTOR = 1.4;

    // Rolling average window size. 3 samples = up to 90 seconds of history at 30s polling.
    private static final int ETA_HISTORY_SIZE = 3;

    // Buses with a smoothed ETA above this are excluded from results.
    private static final int MAX_ETA_SECONDS = 35 * 60; // 2100 seconds

    // "Arriving" is only shown when road distance is below this threshold.
    // Prevents a high derived speed from marking a bus 300m away as arrived.
    private static final double ARRIVING_DISTANCE_METERS = 150.0;

    // ETA history per "vehicleId_stopId" pair. Deque maintains insertion order
    // for the rolling window; ConcurrentHashMap for thread-safe access.
    private final Map<String, Deque<Integer>> etaHistory = new ConcurrentHashMap<>();

    public EtaCalculationService(TransitService transitService, LiveTrackingService liveTrackingService) {
        this.transitService = transitService;
        this.liveTrackingService = liveTrackingService;
    }

    /**
     * Returns all active buses approaching the target stop on the given route,
     * sorted by ascending smoothed ETA. Buses that have already passed the stop,
     * or whose ETA exceeds 35 minutes, are excluded.
     *
     * @param routeShortName Route short name as displayed on buses (e.g. "T815", "T789").
     *                       Do NOT pass the internal GTFS route_id (e.g. "30000016").
     * @param targetStopId   Stop ID as defined in stops.txt (e.g. "12000802").
     * @return Ordered list of arrival predictions, or an empty list if the stop is unknown.
     */
    public List<Map<String, Object>> getArrivalsForStop(String routeShortName, String targetStopId) {
        Stop targetStop = transitService.getStopById(targetStopId);
        if (targetStop == null) {
            System.err.println("⚠️  ETA: stop not found: " + targetStopId);
            return Collections.emptyList();
        }

        String staticRouteId = transitService.resolveRouteIdByShortName(routeShortName);

        // Prune history entries for vehicles no longer in the active fleet.
        evictStaleHistoryEntries();

        PriorityQueue<ArrivalPrediction> heap = new PriorityQueue<>(
                Comparator.comparingInt(ArrivalPrediction::getSmoothedSeconds)
        );

        int totalOnRoute = 0;
        int droppedPassed = 0;
        int droppedTooFar = 0;
        int usedFallback = 0;

        for (Map.Entry<String, VehiclePosition> entry : liveTrackingService.getActiveVehicles().entrySet()) {
            VehiclePosition vehicle = entry.getValue();
            if (!vehicle.hasTrip()) continue;
            if (!LiveTrackingService.matchesRouteId(routeShortName, vehicle.getTrip().getRouteId())) continue;

            totalOnRoute++;
            int directionId = vehicle.getTrip().hasDirectionId() ? vehicle.getTrip().getDirectionId() : 0;
            double busLat = vehicle.getPosition().getLatitude();
            double busLon = vehicle.getPosition().getLongitude();

            RoadPosition busPosition = projectOntoRoute(staticRouteId, directionId, busLat, busLon);
            RoadPosition targetPosition = getStopPosition(staticRouteId, directionId, targetStopId);

            double roadDistanceMeters;

            if (busPosition == null || targetPosition == null) {
                usedFallback++;
                double straightLineMeters = haversineDistanceKm(
                        busLat, busLon, targetStop.getLatitude(), targetStop.getLongitude()) * 1000.0;
                roadDistanceMeters = straightLineMeters * HAVERSINE_ROAD_FACTOR;
            } else {
                if (busPosition.cumulativeDistKm >= targetPosition.cumulativeDistKm) {
                    droppedPassed++;
                    continue;
                }
                roadDistanceMeters = (targetPosition.cumulativeDistKm - busPosition.cumulativeDistKm) * 1000.0;
            }

            double speedMps = liveTrackingService.getSpeedMps(entry.getKey(), vehicle);
            int rawSeconds = (int) (roadDistanceMeters / speedMps);

            // Update rolling history and compute smoothed ETA.
            int smoothedSeconds = updateAndSmooth(entry.getKey(), targetStopId, rawSeconds);

            if (smoothedSeconds > MAX_ETA_SECONDS) {
                droppedTooFar++;
                continue;
            }

            String licensePlate = vehicle.getVehicle().hasLicensePlate()
                    ? vehicle.getVehicle().getLicensePlate() : entry.getKey();

            heap.offer(new ArrivalPrediction(
                    entry.getKey(), licensePlate, roadDistanceMeters,
                    rawSeconds, smoothedSeconds, directionId));
        }

        System.out.println("ℹ️  ETA route=" + routeShortName + " (→" + staticRouteId + ")"
                + " stop=" + targetStopId
                + " → onRoute=" + totalOnRoute
                + " passed=" + droppedPassed
                + " tooFar=" + droppedTooFar
                + " fallback=" + usedFallback
                + " returning=" + heap.size());

        List<Map<String, Object>> arrivals = new ArrayList<>();
        while (!heap.isEmpty()) {
            ArrivalPrediction p = heap.poll();
            Map<String, Object> payload = new HashMap<>();
            payload.put("vehicleId", p.getVehicleId());
            payload.put("licensePlate", p.getLicensePlate());
            payload.put("distanceMeters", Math.round(p.getDistanceMeters()));
            payload.put("etaSeconds", p.getSmoothedSeconds());
            payload.put("etaFormatted", formatEta(p.getSmoothedSeconds(), p.getDistanceMeters()));
            payload.put("directionId", p.getDirectionId());
            payload.put("directionLabel", p.getDirectionId() == 0 ? "outbound" : "inbound");
            arrivals.add(payload);
        }

        return arrivals;
    }

    /**
     * Pushes a new raw ETA sample into the rolling window for a vehicle-stop pair and
     * returns the average of the window.
     *
     * <p>The window is capped at {@code ETA_HISTORY_SIZE} entries. The average absorbs
     * single-poll spikes caused by GPS jitter or stop-snapping instability without
     * introducing meaningful display lag at 30-second polling intervals.
     */
    private int updateAndSmooth(String vehicleId, String stopId, int rawSeconds) {
        String key = vehicleId + "_" + stopId;
        Deque<Integer> history = etaHistory.computeIfAbsent(key, k -> new ArrayDeque<>());

        history.addLast(rawSeconds);
        while (history.size() > ETA_HISTORY_SIZE) {
            history.removeFirst();
        }

        int sum = 0;
        for (int val : history) sum += val;
        return sum / history.size();
    }

    /**
     * Removes ETA history entries for vehicles that are no longer in the active fleet.
     * Called at the start of each request to prevent the history map from growing
     * indefinitely as buses finish their routes and are evicted from the live feed.
     */
    private void evictStaleHistoryEntries() {
        Set<String> activeIds = liveTrackingService.getActiveVehicleIds();
        etaHistory.keySet().removeIf(key -> {
            String vehicleId = key.substring(0, key.lastIndexOf('_'));
            return !activeIds.contains(vehicleId);
        });
    }

    private RoadPosition getStopPosition(String staticRouteId, int directionId, String stopId) {
        LinkedList<String> path = transitService.getRoutePath(staticRouteId, directionId);
        List<Double> distances = transitService.getStopCumulativeDistances(staticRouteId, directionId);
        if (path == null || distances == null) return null;

        List<String> stopIds = new ArrayList<>(path);
        int idx = stopIds.indexOf(stopId);
        if (idx == -1 || idx >= distances.size()) return null;

        return new RoadPosition(distances.get(idx));
    }

    private RoadPosition projectOntoRoute(String staticRouteId, int directionId,
                                           double busLat, double busLon) {
        LinkedList<String> path = transitService.getRoutePath(staticRouteId, directionId);
        List<Double> distances = transitService.getStopCumulativeDistances(staticRouteId, directionId);
        if (path == null || distances == null || path.isEmpty()) return null;

        List<String> stopIds = new ArrayList<>(path);
        int closestIdx = -1;
        double closestDist = Double.MAX_VALUE;

        for (int i = 0; i < stopIds.size(); i++) {
            Stop stop = transitService.getStopById(stopIds.get(i));
            if (stop == null) continue;
            double d = haversineDistanceKm(busLat, busLon, stop.getLatitude(), stop.getLongitude());
            if (d < closestDist) {
                closestDist = d;
                closestIdx = i;
            }
        }

        if (closestIdx == -1 || closestIdx >= distances.size()) return null;
        return new RoadPosition(distances.get(closestIdx));
    }

    private double haversineDistanceKm(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6371.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * Formats the smoothed ETA for display.
     *
     * <p>"Arriving" is only shown when road distance is below {@code ARRIVING_DISTANCE_METERS}.
     * This prevents a momentarily high derived speed from marking a bus as arrived when it
     * is still hundreds of metres away.
     */
    private String formatEta(int smoothedSeconds, double roadDistanceMeters) {
        if (roadDistanceMeters <= ARRIVING_DISTANCE_METERS) return "Arriving";
        if (smoothedSeconds < 60) return "Arriving";
        return (smoothedSeconds / 60) + " min";
    }

    private static class RoadPosition {
        final double cumulativeDistKm;
        RoadPosition(double cumulativeDistKm) { this.cumulativeDistKm = cumulativeDistKm; }
    }

    private static class ArrivalPrediction {
        private final String vehicleId;
        private final String licensePlate;
        private final double distanceMeters;
        private final int rawSeconds;
        private final int smoothedSeconds;
        private final int directionId;

        ArrivalPrediction(String vehicleId, String licensePlate, double distanceMeters,
                          int rawSeconds, int smoothedSeconds, int directionId) {
            this.vehicleId = vehicleId;
            this.licensePlate = licensePlate;
            this.distanceMeters = distanceMeters;
            this.rawSeconds = rawSeconds;
            this.smoothedSeconds = smoothedSeconds;
            this.directionId = directionId;
        }

        String getVehicleId() { return vehicleId; }
        String getLicensePlate() { return licensePlate; }
        double getDistanceMeters() { return distanceMeters; }
        int getRawSeconds() { return rawSeconds; }
        int getSmoothedSeconds() { return smoothedSeconds; }
        int getDirectionId() { return directionId; }
    }
}
