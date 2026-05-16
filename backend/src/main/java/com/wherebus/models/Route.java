package com.wherebus.models;

import io.swagger.v3.oas.annotations.media.Schema;

/** A transit route service line. Returned by route search and metadata endpoints. */
@Schema(description = "A transit route.")
public class Route {

    @Schema(description = "Route ID as stored in routes.txt.", example = "T7890")
    private String id;

    @Schema(description = "Short public route name.", example = "T789")
    private String name;

    @Schema(description = "Full terminal-to-terminal route description.", example = "Stesen LRT Universiti ~ Universiti Malaya via Pantai Hillpark")
    private String longName;

    @Schema(description = "Destination display text for outbound direction (direction_id = 0).", example = "UNIVERSITI MALAYA")
    private String headsignOutbound;

    @Schema(description = "Destination display text for inbound direction (direction_id = 1).", example = "STESEN LRT UNIVERSITI")
    private String headsignInbound;

    @Schema(description = "Source feed network. Used by the frontend for route badge styling.", example = "rapid-bus-kl")
    private String category;

    public Route(String id, String name, String longName) {
        this.id = id;
        this.name = name;
        this.longName = longName;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getLongName() { return longName; }
    public void setLongName(String longName) { this.longName = longName; }

    public String getHeadsignOutbound() { return headsignOutbound; }
    public void setHeadsignOutbound(String headsignOutbound) { this.headsignOutbound = headsignOutbound; }

    public String getHeadsignInbound() { return headsignInbound; }
    public void setHeadsignInbound(String headsignInbound) { this.headsignInbound = headsignInbound; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
}
