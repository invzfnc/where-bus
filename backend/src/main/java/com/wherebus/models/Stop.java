package com.wherebus.models;

/**
 * Represents a physical bus stop within the transit network.
 * This object is used as a vertex (node) within the routing Graph and
 * is stored in a Hash Table for fast O(1) lookups.
 */
public class Stop {
    private String id;
    private String name;
    private double latitude;
    private double longitude;

    /**
     * Constructs a new Stop instance.
     *
     * @param id        The unique identifier for the bus stop (e.g., "100432").
     * @param name      The human-readable name of the stop (e.g., "Masjid Ar-Rahman").
     * @param latitude  The geographical latitude coordinate of the stop.
     * @param longitude The geographical longitude coordinate of the stop.
     */
    public Stop(String id, String name, double latitude, double longitude) {
        this.id = id;
        this.name = name;
        this.latitude = latitude;
        this.longitude = longitude;
    }

    /** @return The unique identifier of the stop. */
    public String getId() { return id; }

    /** @param id The unique identifier to set. */
    public void setId(String id) { this.id = id; }

    /** @return The human-readable name of the stop. */
    public String getName() { return name; }

    /** @param name The human-readable name to set. */
    public void setName(String name) { this.name = name; }

    /** @return The geographical latitude coordinate. */
    public double getLatitude() { return latitude; }

    /** @param latitude The geographical latitude to set. */
    public void setLatitude(double latitude) { this.latitude = latitude; }

    /** @return The geographical longitude coordinate. */
    public double getLongitude() { return longitude; }

    /** @param longitude The geographical longitude to set. */
    public void setLongitude(double longitude) { this.longitude = longitude; }
}