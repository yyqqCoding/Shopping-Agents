package com.example.commerce.catalog;

import java.math.BigDecimal;
import lombok.Data;

/** One product id with the sort keys the page and its cursor are built from. */
@Data
public class SearchRow {
    private String id;
    private BigDecimal listPrice;
    private BigDecimal relevance;
    private BigDecimal rating;
    private Integer displayOrder;
}
