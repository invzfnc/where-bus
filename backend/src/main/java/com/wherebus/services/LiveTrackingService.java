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
 * Polls Prasarana's GTFS-Realtime feeds every 30 seconds and maintains a merged,
 * thread-safe snapshot of all active vehicle positions.
 *
 * <p><b>Polling strategy:</b> The two feeds are fetched sequentially with
 * {@code INTER_FEED_DELAY_MS} (10 seconds) between them to reduce back-to-back
 * rate limit hits on data.gov.my. Each feed tracks its own consecutive failure count;
 * on a 429 the feed is skipped for {@code BACKOFF_CYCLES} (4) cycles = 2 minutes.
 *
 * <p><b>Blackout-safe eviction:</b> Stale vehicle eviction only runs when at least one
 * feed was attempted in the current cycle. During a full rate-limit blackout (both feeds
 * in backoff), the last known positions are preserved so ETA and vehicle endpoints
 * continue returning results rather than an empty fleet.
 *
 * <p><b>Speed derivation:</b> Prasarana's {@code speed} field is broadcast in km/h despite
 * the GTFS-RT spec mandating m/s. The field is converted on read (÷ 3.6). Derived speed
 * from consecutive position deltas is preferred and more reliable. Two guards are applied:
 * <ul>
 *   <li>Displacements below {@code MIN_MOVEMENT_METERS} are treated as GPS jitter and
 *       skipped — they produce near-zero derived speeds that would inflate ETAs.</li>
 *   <li>Derived speed is capped at {@code MAX_DERIVED_SPEED_MPS} — values above this
 *       indicate a GPS position jump rather than genuine movement.</li>
 * </ul>
 *
 * <p><b>Stale eviction:</b> Vehicles not updated within {@code STALE_THRESHOLD_MS}
 * (10 minutes) are removed when a healthy feed cycle runs.
 */
@Service
public class LiveTrackingService {

    private final Map<String, VehiclePosition> activeVehicles = new ConcurrentHashMap<>();
    private final Map<String, double[]> previousPositions = new ConcurrentHashMap<>();
    private final Map<String, Double> derivedSpeeds = new ConcurrentHashMap<>();

    private final AtomicInteger[] feedBackoffCycles = {new AtomicInteger(0), new AtomicInteger(0)};

    // How many 30s cycles to skip after a 429. 4 cycles = 2 minutes backoff.
    private static final int BACKOFF_CYCLES = 4;

    // Spread the two feed requests apart to reduce back-to-back rate limit hits.
    private static final long INTER_FEED_DELAY_MS = 10000;

    // Vehicles are only evicted if they haven't been seen for this long AND at least
    // one feed is currently healthy. This prevents a full fleet wipe during a rate-limit
    // blackout where no new data arrives but the buses haven't actually stopped running.
    private static final long STALE_THRESHOLD_MS = 10 * 60 * 1000;

    // Displacements below this are treated as GPS jitter, not real movement.
    private static final double MIN_MOVEMENT_METERS = 20.0;

    // Below this the bus is considered stationary — use fallback speed instead.
    private static final double MIN_DERIVED_SPEED_MPS = 0.5;

    // Above this the position delta is a GPS jump, not genuine movement.
    // 15 m/s ≈ 54 km/h — a safe ceiling for a KL city bus.
    private static final double MAX_DERIVED_SPEED_MPS = 15.0;

    static final double DEFAULT_SPEED_MPS = 3.0;

    private static final String[] LIVE_FEED_URLS = {
            "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl",
            "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-mrtfeeder"
    };

    /** Fetches both Prasarana feeds sequentially every 30 seconds. */
    @Scheduled(fixedRate = 30000)
    public void refreshVehiclePositions() {
        int totalIngested = 0;
        long now = System.currentTimeMillis();
        boolean anyFeedAttempted = false;

        for (int i = 0; i < LIVE_FEED_URLS.length; i++) {
            if (feedBackoffCycles[i].get() > 0) {
                int remaining = feedBackoffCycles[i].decrementAndGet();
                System.out.println("⏭️  Skipping feed (backoff, " + remaining + " cycles left): " + LIVE_FEED_URLS[i]);
                continue;
            }
            if (i > 0) {
                try { Thread.sleep(INTER_FEED_DELAY_MS); } catch (InterruptedException ignored) {}
            }
            anyFeedAttempted = true;
            totalIngested += fetchFeed(LIVE_FEED_URLS[i], feedBackoffCycles[i]);
        }

        // Only evict stale vehicles when at least one feed was attempted successfully.
        // During a full rate-limit blackout (all feeds in backoff), preserving the last
        // known positions is better than wiping the fleet and returning empty results.
        if (anyFeedAttempted) {
            evictStaleVehicles(now);
        }

        System.out.println("✅ Fleet updated: " + totalIngested + " ingested, "
                + activeVehicles.size() + " active.");
    }

    private int fetchFeed(String feedUrl, AtomicInteger backoffCount) {
        int count = 0;
        try {
            URL url = new URI(feedUrl).toURL();
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("User-Agent", "Mozilla/5.0 (compatible; WhereBus/2.0)");
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
                // Respect Retry-After if the server provides it (value is in seconds).
                // Convert to cycles (round up) so we wait at least as long as requested.
                // Fall back to BACKOFF_CYCLES if the header is absent or unparseable.
                int cycles = BACKOFF_CYCLES;
                String retryAfter = connection.getHeaderField("Retry-After");
                if (retryAfter != null) {
                    try {
                        int retrySeconds = Integer.parseInt(retryAfter.trim());
                        cycles = (int) Math.ceil((double) retrySeconds / 30);
                    } catch (NumberFormatException ignored) {}
                }
                backoffCount.set(cycles);
                System.err.println("⚠️  429 rate-limited: " + feedUrl
                        + " — backing off for " + cycles + " cycles ("
                        + (cycles * 30) + "s)."
                        + (retryAfter != null ? " Retry-After: " + retryAfter + "s." : ""));
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
     *
     * <p>Skipped entirely if displacement is below {@code MIN_MOVEMENT_METERS} — this
     * filters GPS jitter where the reported position oscillates a few metres around a
     * fixed point, which would otherwise produce near-zero derived speeds.
     *
     * <p>Derived speed is capped at {@code MAX_DERIVED_SPEED_MPS}. Values above this
     * indicate a GPS position jump (common when a feed update skips several cycles) rather
     * than genuine high-speed movement, and would otherwise produce unrealistically low ETAs.
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

                // Skip if movement is below the jitter threshold.
                if (distanceMeters < MIN_MOVEMENT_METERS) {
                    previousPositions.put(vehicleId, new double[]{currLat, currLon, currTimestamp});
                    return;
                }

                double speedMps = distanceMeters / deltaSeconds;

                if (speedMps < MIN_DERIVED_SPEED_MPS) {
                    // Bus is stationary — remove stale derived speed so the fallback is used.
                    derivedSpeeds.remove(vehicleId);
                } else {
                    // Clamp to plausible city bus ceiling before storing.
                    derivedSpeeds.put(vehicleId, Math.min(speedMps, MAX_DERIVED_SPEED_MPS));
                }
            }
        }

        previousPositions.put(vehicleId, new double[]{currLat, currLon, currTimestamp});
    }

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
     * <p>Priority: derived (position deltas, clamped to MAX_DERIVED_SPEED_MPS)
     * → feed speed ÷ 3.6 (Prasarana broadcasts km/h) → DEFAULT_SPEED_MPS fallback.
     */
    public double getSpeedMps(String vehicleId, VehiclePosition vehicle) {
        Double derived = derivedSpeeds.get(vehicleId);
        if (derived != null) return derived;

        if (vehicle.getPosition().hasSpeed()) {
            double feedSpeedKmh = vehicle.getPosition().getSpeed();
            if (feedSpeedKmh > 1.0 && feedSpeedKmh < 120.0) {
                return Math.min(feedSpeedKmh / 3.6, MAX_DERIVED_SPEED_MPS);
            }
        }
        return DEFAULT_SPEED_MPS;
    }

    /**
     * Checks whether a queried route short name matches a broadcasted route ID.
     *
     * <p>Handles known Prasarana quirks:
     * <ul>
     *   <li>Case-insensitive exact match.</li>
     *   <li>Trailing-"0" appended to query: "T789" matches broadcast "T7890".</li>
     *   <li>Trailing-"0" on broadcast: "T7890" query matches broadcast "T789".</li>
     *   <li>Direction suffix on broadcast: "T155" matches "T155 Outbound".</li>
     * </ul>
     *
     * <p>{@code public static} so {@link EtaCalculationService} uses the same logic
     * without duplication.
     */
    public static boolean matchesRouteId(String queryId, String broadcastedId) {
        if (queryId.equalsIgnoreCase(broadcastedId)) return true;
        if ((queryId + "0").equalsIgnoreCase(broadcastedId)) return true;
        if (queryId.endsWith("0")
                && queryId.substring(0, queryId.length() - 1).equalsIgnoreCase(broadcastedId)) return true;
        if (broadcastedId.toLowerCase().startsWith(queryId.toLowerCase() + " ")) return true;
        return false;
    }

    /** Returns vehicles currently on the given route with GPS coordinates and direction. */
    public List<Map<String, Object>> getVehiclesByRoute(String routeId) {
        List<Map<String, Object>> vehicles = new ArrayList<>();
        for (Map.Entry<String, VehiclePosition> entry : activeVehicles.entrySet()) {
            VehiclePosition v = entry.getValue();
            if (!v.hasTrip()) continue;
            if (!matchesRouteId(routeId, v.getTrip().getRouteId())) continue;

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
    public Set<String> getActiveVehicleIds() { return activeVehicles.keySet(); }
}
