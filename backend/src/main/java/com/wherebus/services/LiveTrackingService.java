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
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service responsible for fetching, parsing, and storing live RapidKL bus GPS data.
 * Acts as the real-time heartbeat of the application.
 */
@Service
public class LiveTrackingService {

    // Thread-safe Hash Table to store actively moving buses concurrently.
    // Key: Vehicle ID, Value: The latest parsed VehiclePosition Protobuf object
    private final Map<String, VehiclePosition> activeVehicles = new ConcurrentHashMap<>();

    // The official public GTFS-Realtime endpoint for RapidKL Buses
    private static final String LIVE_FEED_URL = "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl";

    /**
     * The Heartbeat Worker.
     * Runs automatically every 30 seconds to ingest fresh binary GPS data.
     */
    @Scheduled(fixedRate = 30000)
    public void refreshLiveVehiclePositions() {
        System.out.println("⏳ [Heartbeat] Requesting live RapidKL bus coordinates...");

        try {
            URL url = new URI(LIVE_FEED_URL).toURL();
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();

            // Configure robust production headers and timeouts
            connection.setRequestMethod("GET");
            connection.setRequestProperty("User-Agent", "WhereBus-TransitApp/1.0");
            connection.setConnectTimeout(5000); // 5-second handshake timeout
            connection.setReadTimeout(5000);    // 5-second stream read timeout

            int responseCode = connection.getResponseCode();
            if (responseCode == HttpURLConnection.HTTP_OK) {

                // Decode the binary stream directly into Google Protobuf objects
                try (InputStream inputStream = connection.getInputStream()) {
                    FeedMessage feed = FeedMessage.parseFrom(inputStream);
                    int updatedCount = 0;

                    for (FeedEntity entity : feed.getEntityList()) {
                        if (entity.hasVehicle()) {
                            VehiclePosition vehicle = entity.getVehicle();
                            String vehicleId = vehicle.getVehicle().getId();

                            // Thread-safe insertion/update into our memory structure
                            activeVehicles.put(vehicleId, vehicle);
                            updatedCount++;
                        }
                    }

                    System.out.println("✅ [Heartbeat] Successfully ingested " + updatedCount + " active RapidKL buses.");
                }
            } else {
                System.err.println("⚠️ [Heartbeat] Received unexpected HTTP response: " + responseCode);
            }

            connection.disconnect();

        } catch (Exception e) {
            System.err.println("❌ [Heartbeat] Failed to fetch live GTFS-RT feed: " + e.getMessage());
        }
    }

    /**
     * O(1) concurrent access to the entire active fleet.
     */
    public Map<String, VehiclePosition> getActiveVehicles() {
        return activeVehicles;
    }

    /**
     * O(1) lookup for an individual bus's live telemetry.
     */
    public VehiclePosition getVehicleById(String vehicleId) {
        return activeVehicles.get(vehicleId);
    }
}