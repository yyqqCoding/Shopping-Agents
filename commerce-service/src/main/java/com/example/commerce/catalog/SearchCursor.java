package com.example.commerce.catalog;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;

/**
 * The sort keys of the last row on a page. Its fields are the ones the agent's
 * {@code search_products} tool schema allows in {@code cursor}; each sort reads its own.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record SearchCursor(
        String id, BigDecimal price, BigDecimal rating, BigDecimal relevance, Integer displayOrder) {}
