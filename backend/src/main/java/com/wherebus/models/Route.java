package com.wherebus.models;

/**
 * Represents a specific transit service line (e.g., a campus shuttle route).
 * Routes are used to associate moving buses with their predefined stop sequences.
 */
public class Route {
    private String id;
    private String longName;

    /**
     * Constructs a new Route instance.
     *
     * @param id       The unique identifier for the route (e.g., "T789").
     * @param longName The full descriptive name of the route (e.g., "LRT Universiti ↺ Universiti Malaya").
     */
    public Route(String id, String longName) {
        this.id = id;
        this.longName = longName;
    }

    /** @return The unique identifier of the route. */
    public String getId() { return id; }

    /** @param id The unique identifier to set. */
    public void setId(String id) { this.id = id; }

    /** @return The full descriptive name of the route. */
    public String getLongName() { return longName; }

    /** @param longName The descriptive name to set. */
    public void setLongName(String longName) { this.longName = longName; }
}