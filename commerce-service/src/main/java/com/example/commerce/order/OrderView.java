package com.example.commerce.order;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

/** An order in the agent's wire shape ({@code shopping_agent.types.Order}). */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record OrderView(
        String orderId,
        String status,
        OffsetDateTime placedAt,
        List<Item> items,
        BigDecimal total,
        String currency,
        String estimatedDelivery) {

    /** {@code productId} is the SKU id; {@code variantOf} names its family. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Item(
            String productId,
            String title,
            int quantity,
            BigDecimal price,
            Map<String, String> optionValues,
            String variantOf) {}
}
