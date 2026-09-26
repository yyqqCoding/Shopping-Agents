package com.example.commerce.catalog;

import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * The agent's {@code search_products} call: keywords already split by the agent API,
 * the structured filters, the sort, the page size and the cursor from the previous page.
 */
public record SearchRequest(
        List<String> terms,
        String category,
        BigDecimal minPrice,
        BigDecimal maxPrice,
        BigDecimal minRating,
        Boolean inStock,
        Map<String, String> attributes,
        String sort,
        Integer limit,
        @Valid SearchCursor cursor) {}
