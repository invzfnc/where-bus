package com.wherebus.models;

/**
 * Represents an active, moving transit vehicle.
 * Implements the Comparable interface to allow instances to be automatically
 * sorted by their Estimated Time of Arrival (ETA) when placed into a Priority Queue.
 */
public class Bus implements Comparable<Bus> {
    private String id;
    private String routeId;
    private double latitude;
    private double longitude;
    private double estimatedTimeOfArrival;

    /**
     * Constructs a new active Bus instance.
     *
     * @param id                     The physical vehicle identifier.
     * @param routeId                The identifier of the route this bus is currently servicing.
     * @param latitude               The live geographical latitude coordinate.
     * @param longitude              The live geographical longitude coordinate.
     * @param estimatedTimeOfArrival The calculated time (in minutes) until the bus reaches the target stop.
     */
    public Bus(String id, String routeId, double latitude, double longitude, double estimatedTimeOfArrival) {
        this.id = id;
        this.routeId = routeId;
        this.latitude = latitude;
        this.longitude = longitude;
        this.estimatedTimeOfArrival = estimatedTimeOfArrival;
    }

    /** @return The physical vehicle identifier. */
    public String getId() { return id; }

    /** @param id The vehicle identifier to set. */
    public void setId(String id) { this.id = id; }

    /** @return The identifier of the route this bus is servicing. */
    public String getRouteId() { return routeId; }

    /** @param routeId The route identifier to set. */
    public void setRouteId(String routeId) { this.routeId = routeId; }

    /** @return The live geographical latitude coordinate. */
    public double getLatitude() { return latitude; }

    /** @param latitude The live latitude to set. */
    public void setLatitude(double latitude) { this.latitude = latitude; }

    /** @return The live geographical longitude coordinate. */
    public double getLongitude() { return longitude; }

    /** @param longitude The live longitude to set. */
    public void setLongitude(double longitude) { this.longitude = longitude; }

    /** @return The calculated ETA in minutes. */
    public double getEstimatedTimeOfArrival() { return estimatedTimeOfArrival; }

    /** @param estimatedTimeOfArrival The ETA in minutes to set. */
    public void setEstimatedTimeOfArrival(double estimatedTimeOfArrival) { this.estimatedTimeOfArrival = estimatedTimeOfArrival; }

    /**
     * Compares this bus with another bus based on their Estimated Time of Arrival.
     * This method is critical for the Priority Queue to sort buses from nearest to furthest.
     *
     * @param otherBus The other Bus object to compare against.
     * @return A negative integer, zero, or a positive integer as this bus's ETA
     * is less than, equal to, or greater than the specified bus's ETA.
     */
    @Override
    public int compareTo(Bus otherBus) {
        return Double.compare(this.estimatedTimeOfArrival, otherBus.estimatedTimeOfArrival);
    }
}