package com.example.commerce.catalog;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * A product record in the agent's wire shape ({@code shopping_agent.types.ProductDetails}):
 * a summary leaves the detail fields null; a family's details carry its {@code variants};
 * {@code evidence} holds the frozen price trend and review aspects for the detail views.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProductView(
        String productId,
        String title,
        BigDecimal price,
        String currency,
        BigDecimal rating,
        Integer reviewCount,
        String imageUrl,
        String category,
        List<String> labels,
        Map<String, String> attributes,
        boolean inStock,
        String shortDescription,
        Map<String, List<String>> options,
        Map<String, String> optionValues,
        String variantOf,
        String longDescription,
        Map<String, String> specs,
        List<String> reviewHighlights,
        List<ProductView> variants,
        Map<String, Object> evidence) {}
