package com.example.commerce.importer;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.commerce.importer.SeedRows.ProductRow;
import com.example.commerce.importer.SeedRows.SkuRow;
import com.example.commerce.importer.SeedRows.StockRow;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class CatalogSeedTest {

    static final Path DATA = Path.of("..", "examples", "assistant", "data");
    static final ObjectMapper JSON = new ObjectMapper();
    static CatalogSeed seed;
    static Map<String, ProductRow> products;
    static Map<String, SkuRow> skus;
    static Map<String, StockRow> stock;

    @BeforeAll
    static void load() throws Exception {
        seed = new CatalogSeed(DATA, JSON);
        products = index(seed.products, ProductRow::getId);
        skus = index(seed.skus, SkuRow::getId);
        stock = index(seed.stock, StockRow::getSkuId);
    }

    @Test
    void everyAuthoredRecordBecomesRows() throws Exception {
        JsonNode catalog = JSON.readTree(Files.readString(DATA.resolve("catalog.json")));
        JsonNode legacy = JSON.readTree(Files.readString(DATA.resolve("legacy/catalog.json")));
        assertThat(seed.products).hasSize(catalog.path("products").size() + legacy.path("products").size());
        // Every SKU has exactly one stock row.
        assertThat(stock.keySet()).isEqualTo(skus.keySet());
        assertThat(seed.policies).isNotEmpty();
    }

    @Test
    void plainProductIsItsOwnSku() {
        SkuRow sku = skus.get("OD-1001");
        assertThat(sku.getProductId()).isEqualTo("OD-1001");
        assertThat(sku.getOptionValuesJson()).isNull();
        assertThat(sku.getWeightG()).isEqualTo(1850);
        assertThat(sku.getPeople()).isEqualTo(2);
        assertThat(sku.getWaterproofMm()).isEqualTo(3000);
        assertThat(stock.get("OD-1001").getStock()).isEqualTo(4);
        assertThat(products.get("OD-1001").getOptionsJson()).isNull();
        assertThat(products.get("OD-1001").getEvidenceJson()).contains("price_intelligence");
    }

    @Test
    void variantsAreFilledFromTheirFamily() {
        ProductRow family = products.get("OD-4001");
        assertThat(family.getOptionsJson()).contains("\"size\"");
        SkuRow small = skus.get("OD-4001-S");
        assertThat(small.getProductId()).isEqualTo("OD-4001");
        assertThat(small.getOptionValuesJson()).contains("\"S\"");
        assertThat(small.getAttributesJson()).contains("category_label");
        assertThat(small.getPrice()).isEqualByComparingTo(new BigDecimal("499"));
        assertThat(small.getEvidenceJson()).isNotNull();
        // A variant takes its family's authored stock; one authored out of stock starts at zero.
        assertThat(stock.get("OD-4001-S").getStock()).isEqualTo(36);
        assertThat(stock.get("OD-4004-XL").getStock()).isZero();
    }

    @Test
    void outOfStockPlainProductStartsAtZero() {
        assertThat(stock.get("OD-1012").getStock()).isZero();
    }

    @Test
    void legacyRecordsAreRetiredAndUnbranded() {
        ProductRow legacy = products.get("AR-1001");
        assertThat(legacy.isRetired()).isTrue();
        assertThat(legacy.getTitle()).doesNotStartWith("ACME");
        assertThat(legacy.getCurrency()).isEqualTo("USD");
        assertThat(legacy.getDetailJson()).contains("已下架，仅供历史查看");
        assertThat(stock.get("AR-1001").getStock()).isZero();
        assertThat(skus.get("AR-1008-12LB").isRetired()).isTrue();
    }

    @Test
    void displayOrderFollowsTheCatalog() {
        assertThat(products.get("OD-1001").getDisplayOrder()).isLessThan(products.get("OD-1002").getDisplayOrder());
        assertThat(seed.products.stream().map(ProductRow::getSearchText))
                .allMatch(text -> !text.isBlank() && text.length() <= 2000);
    }

    private static <T> Map<String, T> index(java.util.List<T> rows, Function<T, String> id) {
        return rows.stream().collect(Collectors.toMap(id, row -> row));
    }
}
