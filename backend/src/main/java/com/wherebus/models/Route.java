package com.wherebus.models;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Represents a specific transit service line.
 * Routes are used to associate moving buses with their predefined stop sequences.
 */
@Schema(description = "Entity representing a static transit route service.")
public class Route {
    @Schema(description = "Short alphanumeric code identifying the route.", example = "T7890")
    private String id;

    @Schema(description = "Standard display name for the route.", example = "T789")
    private String name;

    @Schema(description = "Full descriptive terminal-to-terminal route string.", example = "Stesen LRT Universiti ~ Universiti Malaya via Pantai Hillpark")
    private String longName;

    /**
     * Constructs a new Route instance.
     *
     * @param id       The unique identifier for the route (e.g., "B1000").
     * @param name     The short name of the route (e.g., "SUNWAY LINE").
     * @param longName The full descriptive name of the route (e.g., "BRT USJ 7 - BRT Setia Jaya").
     */
    public Route(String id, String name, String longName) {
        this.id = id;
        this.name = name;
        this.longName = longName;
    }

    /** @return The unique identifier of the route. */
    public String getId() { return id; }

    /** @param id The unique identifier to set. */
    public void setId(String id) { this.id = id; }

    /** @return The short name of the route. */
    public String getName() { return name; }

    /** @param name The short name to set. */
    public void setName(String name) { this.name = name; }

    /** @return The full descriptive name of the route. */
    public String getLongName() { return longName; }

    /** @param longName The descriptive name to set. */
    public void setLongName(String longName) { this.longName = longName; }
}