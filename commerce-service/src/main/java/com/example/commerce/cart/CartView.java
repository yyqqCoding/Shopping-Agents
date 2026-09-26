package com.example.commerce.cart;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** A cart in the agent's wire shape ({@code shopping_agent.types.Cart}), priced now. */
public record CartView(List<Line> items, String currency) {

    public BigDecimal subtotal() {
        return items.stream()
                .map(line -> line.price().multiply(BigDecimal.valueOf(line.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** {@code productId} is the SKU id; {@code unavailableReason} is set when it cannot be bought. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Line(
            String productId,
            String title,
            BigDecimal price,
            int quantity,
            String imageUrl,
            Map<String, String> optionValues,
            String variantOf,
            String category,
            String unavailableReason) {}
}
