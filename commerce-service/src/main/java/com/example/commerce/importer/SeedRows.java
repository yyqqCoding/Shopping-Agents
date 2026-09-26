package com.example.commerce.importer;

import java.math.BigDecimal;
import lombok.Value;

/** Rows the importer writes; JSON columns travel as JSON text. */
public final class SeedRows {

    private SeedRows() {}

    @Value
    public static class ProductRow {
        String id;
        String title;
        String category;
        String currency;
        String shortDescription;
        String imageUrl;
        BigDecimal rating;
        Integer reviewCount;
        String optionsJson;
        String detailJson;
        String evidenceJson;
        String searchText;
        int displayOrder;
        boolean retired;
    }

    @Value
    public static class SkuRow {
        String id;
        String productId;
        String title;
        BigDecimal price;
        String currency;
        String imageUrl;
        String optionValuesJson;
        String attributesJson;
        String detailJson;
        Integer weightG;
        BigDecimal capacityL;
        Integer people;
        BigDecimal comfortTemperatureC;
        BigDecimal rValue;
        Integer waterproofMm;
        String evidenceJson;
        int displayOrder;
        boolean retired;
    }

    /** The stock a SKU starts with; an existing row keeps its stock unless reset. */
    @Value
    public static class StockRow {
        String skuId;
        int stock;
        int lowStockThreshold;
    }

    @Value
    public static class PolicyRow {
        String id;
        String title;
        String category;
        String content;
        String searchText;
    }
}
