package com.wherebus.services;

import com.google.transit.realtime.GtfsRealtime.FeedEntity;
import com.google.transit.realtime.GtfsRealtime.FeedMessage;
import com.google.transit.realtime.GtfsRealtime.VehiclePosition;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Polls Prasarana's GTFS-Realtime feeds and maintains a merged, thread-safe
 * snapshot of all active vehicle positions.
 *
 * <p><b>Polling strategy:</b> The two feeds are fetched sequentially with a short delay
 * between them to avoid hitting the data.gov.my rate limiter with back-to-back requests
 * in the same scheduler tick. Each feed tracks its own consecutive failure count;
 * on a 429 the feed is skipped for {@code BACKOFF_CYCLES} cycles before retrying.
 *
 * <p><b>Speed derivation:</b> Prasarana's {@code speed} field is broadcast in km/h despite
 * the GTFS-RT spec mandating m/s. The field is converted on read (÷ 3.6). Derived speed
 * from consecutive position deltas is preferred and more reliable.
 *
 * <p><b>Stale eviction:</b> Vehicles not updated within {@code STALE_THRESHOLD_MS} are
 * removed to prevent ghost buses from appearing in ETA results after a route ends.
 */
@Service
public class LiveTrackingService {

    // Key: vehicleId, Value: latest VehiclePosition.
    private final Map<String, VehiclePosition> activeVehicles = new ConcurrentHashMap<>();

    // Last known [lat, lon, timestamp] per vehicle for derived speed computation.
    private final Map<String, double[]> previousPositions = new ConcurrentHashMap<>();

    // Derived speed in m/s from consecutive position deltas.
    private final Map<String, Double> derivedSpeeds = new ConcurrentHashMap<>();

    // Per-feed consecutive 429 count. Indexed parallel to LIVE_FEED_URLS.
    private final AtomicInteger[] feedBackoffCycles = {new AtomicInteger(0), new AtomicInteger(0)};

    // How many 15-second cycles to skip a feed after a 429 before retrying.
    // 4 cycles = 60 seconds backoff on rate-limit.
    private static final int BACKOFF_CYCLES = 4;

    // Delay between fetching the two feeds in the same scheduler tick (ms).
    // Spreads load and reduces the chance of consecutive requests hitting the rate limiter.
    private static final long INTER_FEED_DELAY_MS = 3000;

    private static final long STALE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
    private static final double MIN_DERIVED_SPEED_MPS = 0.5;

    // Fallback ~11 km/h. Package-private so EtaCalculationService can reference it.
    static final double DEFAULT_SPEED_MPS = 3.0;

    private static final String[] LIVE_FEED_URLS = {
            "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl",
            "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-mrtfeeder"
    };

    /**
     * Fetches both Prasarana feeds sequentially every 15 seconds.
     * Feeds that returned a 429 on the previous cycle are skipped and retried after
     * {@code BACKOFF_CYCLES} cycles (60 seconds at the default rate).
     */
    @Scheduled(fixedRate = 15000)
    public void refreshVehiclePositions() {
        int totalIngested = 0;
        long now = System.currentTimeMillis();

        for (int i = 0; i < LIVE_FEED_URLS.length; i++) {
            // Skip this feed if it is in a backoff window.
            if (feedBackoffCycles[i].get() > 0) {
                int remaining = feedBackoffCycles[i].decrementAndGet();
                System.out.println("⏭️  Skipping feed (backoff, " + remaining + " cycles left): " + LIVE_FEED_URLS[i]);
                continue;
            }

            // Stagger requests to avoid back-to-back hits on the rate limiter.
            if (i > 0) {
                try { Thread.sleep(INTER_FEED_DELAY_MS); } catch (InterruptedException ignored) {}
            }

            int ingested = fetchFeed(LIVE_FEED_URLS[i], feedBackoffCycles[i]);
            totalIngested += ingested;
        }

        evictStaleVehicles(now);
        System.out.println("✅ Fleet updated: " + totalIngested + " ingested, "
                + activeVehicles.size() + " active.");
    }

    /**
     * Fetches and parses a single GTFS-RT feed URL.
     *
     * @param feedUrl      The endpoint to fetch.
     * @param backoffCount The feed's backoff counter — set to BACKOFF_CYCLES on 429.
     * @return Number of vehicle positions ingested from this feed.
     */
    private int fetchFeed(String feedUrl, AtomicInteger backoffCount) {
        int count = 0;
        try {
            URL url = new URI(feedUrl).toURL();
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("User-Agent", "WhereBus/2.0");
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(8000);

            int responseCode = connection.getResponseCode();

            if (responseCode == HttpURLConnection.HTTP_OK) {
                try (InputStream inputStream = connection.getInputStream()) {
                    FeedMessage feed = FeedMessage.parseFrom(inputStream);
                    for (FeedEntity entity : feed.getEntityList()) {
                        if (!entity.hasVehicle()) continue;
                        VehiclePosition vehicle = entity.getVehicle();
                        String vehicleId = vehicle.getVehicle().getId();
                        updateDerivedSpeed(vehicleId, vehicle);
                        activeVehicles.put(vehicleId, vehicle);
                        count++;
                    }
                }
            } else if (responseCode == 429) {
                backoffCount.set(BACKOFF_CYCLES);
                System.err.println("⚠️  429 rate-limited on: " + feedUrl
                        + " — backing off for " + BACKOFF_CYCLES + " cycles ("
                        + (BACKOFF_CYCLES * 15) + "s).");
            } else {
                System.err.println("⚠️  Feed returned " + responseCode + ": " + feedUrl);
            }

            connection.disconnect();

        } catch (Exception e) {
            System.err.println("❌ Failed to fetch [" + feedUrl + "]: " + e.getMessage());
        }
        return count;
    }

    /**
     * Computes derived speed from the delta between the previous and current position.
     * Only stored if the resulting speed is above {@code MIN_DERIVED_SPEED_MPS} — below
     * this the bus is considered stationary and the fallback should be used instead.
     */
    private void updateDerivedSpeed(String vehicleId, VehiclePosition vehicle) {
        if (!vehicle.hasTimestamp()) return;

        double currLat = vehicle.getPosition().getLatitude();
        double currLon = vehicle.getPosition().getLongitude();
        long currTimestamp = vehicle.getTimestamp();

        double[] prev = previousPositions.get(vehicleId);
        if (prev != null) {
            long deltaSeconds = currTimestamp - (long) prev[2];
            if (deltaSeconds > 0) {
                double distanceMeters = haversineDistance(prev[0], prev[1], currLat, currLon);
                double speedMps = distanceMeters / deltaSeconds;

                if (speedMps >= MIN_DERIVED_SPEED_MPS) {
                    derivedSpeeds.put(vehicleId, speedMps);
                } else {
                    derivedSpeeds.remove(vehicleId);
                }
            }
        }

        previousPositions.put(vehicleId, new double[]{currLat, currLon, currTimestamp});
    }

    /** Removes vehicles whose last timestamp is older than STALE_THRESHOLD_MS. */
    private void evictStaleVehicles(long now) {
        long staleBeforeMs = now - STALE_THRESHOLD_MS;
        activeVehicles.entrySet().removeIf(entry -> {
            VehiclePosition v = entry.getValue();
            if (!v.hasTimestamp()) return false;
            boolean stale = (v.getTimestamp() * 1000L) < staleBeforeMs;
            if (stale) {
                previousPositions.remove(entry.getKey());
                derivedSpeeds.remove(entry.getKey());
            }
            return stale;
        });
    }

    /**
     * Returns the best available speed estimate for a vehicle in m/s.
     *
     * <p>Priority:
     * <ol>
     *   <li>Derived speed from consecutive position deltas.</li>
     *   <li>Feed {@code speed} field ÷ 3.6 — Prasarana broadcasts km/h despite the spec.</li>
     *   <li>{@code DEFAULT_SPEED_MPS} fallback (~11 km/h).</li>
     * </ol>
     */
    public double getSpeedMps(String vehicleId, VehiclePosition vehicle) {
        Double derived = derivedSpeeds.get(vehicleId);
        if (derived != null) return derived;

        if (vehicle.getPosition().hasSpeed()) {
            double feedSpeedKmh = vehicle.getPosition().getSpeed();
            if (feedSpeedKmh > 1.0 && feedSpeedKmh < 120.0) {
                return feedSpeedKmh / 3.6;
            }
        }

        return DEFAULT_SPEED_MPS;
    }

    /**
     * Returns all vehicles currently on the given route with GPS coordinates and direction.
     *
     * <p>Prasarana broadcasts route IDs that match the static route_id in routes.txt exactly
     * for most routes. The trailing-"0" variant is also checked to handle edge cases where
     * the broadcast ID has an extra suffix (e.g. frontend sends "T789", feed broadcasts "T7890").
     * Note: if the static route_id is already "T7890", pass "T7890" — not "T789".
     */
    public List<Map<String, Object>> getVehiclesByRoute(String routeId) {
        List<Map<String, Object>> vehicles = new ArrayList<>();

        for (Map.Entry<String, VehiclePosition> entry : activeVehicles.entrySet()) {
            VehiclePosition v = entry.getValue();
            if (!v.hasTrip()) continue;

            String broadcastedId = v.getTrip().getRouteId();
            if (!matchesRouteId(routeId, broadcastedId)) continue;

            int directionId = v.getTrip().hasDirectionId() ? v.getTrip().getDirectionId() : 0;

            Map<String, Object> vehicle = new HashMap<>();
            vehicle.put("vehicleId", entry.getKey());
            vehicle.put("latitude", v.getPosition().getLatitude());
            vehicle.put("longitude", v.getPosition().getLongitude());
            vehicle.put("bearing", v.getPosition().hasBearing() ? v.getPosition().getBearing() : null);
            vehicle.put("licensePlate", v.getVehicle().hasLicensePlate()
                    ? v.getVehicle().getLicensePlate() : entry.getKey());
            vehicle.put("directionId", directionId);
            vehicle.put("directionLabel", directionId == 0 ? "outbound" : "inbound");

            vehicles.add(vehicle);
        }

        return vehicles;
    }

    /**
     * Checks whether a queried route ID matches a broadcasted route ID.
     *
     * <p>Handles two known Prasarana ID quirks:
     * <ul>
     *   <li>Case-insensitive match (some IDs differ in casing between feeds).</li>
     *   <li>Trailing-"0" suffix: if the queried ID has a "0" appended relative to the
     *       broadcast (e.g. query "T7890" vs broadcast "T789"), or vice versa.</li>
     *   <li>Space-and-direction suffixes like "T155 Outbound" — matched by checking if
     *       the broadcast ID starts with the queried ID.</li>
     * </ul>
     */
    private boolean matchesRouteId(String queryId, String broadcastedId) {
        if (queryId.equalsIgnoreCase(broadcastedId)) return true;
        if ((queryId + "0").equalsIgnoreCase(broadcastedId)) return true;
        if (queryId.endsWith("0") && queryId.substring(0, queryId.length() - 1)
                .equalsIgnoreCase(broadcastedId)) return true;
        // Handle "T155 Outbound" style suffixes.
        if (broadcastedId.toLowerCase().startsWith(queryId.toLowerCase() + " ")) return true;
        return false;
    }

    /** Returns a debug snapshot of the current fleet state. */
    public Map<String, Object> getFleetSnapshot() {
        Set<String> activeRouteIds = new HashSet<>();
        List<Map<String, Object>> samples = new ArrayList<>();

        for (Map.Entry<String, VehiclePosition> entry : activeVehicles.entrySet()) {
            VehiclePosition v = entry.getValue();
            String routeId = v.hasTrip() ? v.getTrip().getRouteId() : "NO_ROUTE_ID";
            activeRouteIds.add(routeId);

            if (samples.size() < 5) {
                Map<String, Object> sample = new HashMap<>();
                sample.put("vehicleId", entry.getKey());
                sample.put("broadcastedRouteId", routeId);
                sample.put("lat", v.getPosition().getLatitude());
                sample.put("lon", v.getPosition().getLongitude());
                sample.put("derivedSpeedMps", derivedSpeeds.get(entry.getKey()));
                samples.add(sample);
            }
        }

        Map<String, Object> snapshot = new HashMap<>();
        snapshot.put("totalActiveBuses", activeVehicles.size());
        snapshot.put("uniqueRoutesActiveNow", activeRouteIds);
        snapshot.put("sampleVehicleData", samples);
        return snapshot;
    }

    private double haversineDistance(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    public VehiclePosition getVehicleById(String vehicleId) { return activeVehicles.get(vehicleId); }
    public Map<String, VehiclePosition> getActiveVehicles() { return activeVehicles; }
}
