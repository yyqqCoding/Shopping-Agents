package com.example.commerce.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.commerce.inventory.Inventory;
import com.example.commerce.store.StoreTerms;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ProductAssemblerTest {

    static final StoreTerms TERMS = new StoreTerms(
            "CNY", new BigDecimal("299"), new BigDecimal("12"), new BigDecimal("25"), "3–5 个工作日", "2 个工作日");
    final ProductAssembler assembler = new ProductAssembler(TERMS);

    static Product family() {
        Product product = new Product();
        product.setId("F-1");
        product.setTitle("冲锋衣");
        product.setCategory("outdoor-apparel");
        product.setCurrency("CNY");
        product.setRetired(false);
        product.setOptions(Map.of("size", List.of("S", "L")));
        product.setDetail(Map.of("attributes", Map.of("color", "绿")));
        return product;
    }

    static Sku sku(String id, String productId, String price) {
        Sku sku = new Sku();
        sku.setId(id);
        sku.setProductId(productId);
        sku.setTitle(id);
        sku.setPrice(new BigDecimal(price));
        sku.setCurrency("CNY");
        sku.setRetired(false);
        sku.setAttributes(Map.of());
        sku.setDetail(Map.of());
        return sku;
    }

    static Map<String, Inventory> stock(Object... idAndStock) {
        Map<String, Inventory> rows = new HashMap<>();
        for (int i = 0; i < idAndStock.length; i += 2) {
            Inventory row = new Inventory();
            row.setSkuId((String) idAndStock[i]);
            row.setStock((Integer) idAndStock[i + 1]);
            row.setLowStockThreshold(8);
            rows.put(row.getSkuId(), row);
        }
        return rows;
    }

    @Test
    void familyShowsItsLowestInStockPrice() {
        List<Sku> skus = List.of(sku("F-1-S", "F-1", "399"), sku("F-1-L", "F-1", "459"));
        ProductView view = assembler.details(family(), skus, stock("F-1-S", 0, "F-1-L", 20));
        assertThat(view.price()).isEqualByComparingTo("459");
        assertThat(view.inStock()).isTrue();
        assertThat(view.variants()).extracting(ProductView::inStock).containsExactly(false, true);
        assertThat(view.variants().get(0).variantOf()).isEqualTo("F-1");
        assertThat(view.attributes()).containsEntry("delivery", "标准配送约 3–5 个工作日");
    }

    @Test
    void familyWithNothingInStockShowsItsLowestPrice() {
        List<Sku> skus = List.of(sku("F-1-S", "F-1", "399"), sku("F-1-L", "F-1", "459"));
        ProductView view = assembler.summary(family(), skus, stock("F-1-S", 0, "F-1-L", 0));
        assertThat(view.price()).isEqualByComparingTo("399");
        assertThat(view.inStock()).isFalse();
        assertThat(view.attributes()).doesNotContainKey("delivery");
        assertThat(view.variants()).isNull();
    }

    @Test
    void lowStockIsStampedFromLiveStock() {
        Product plain = family();
        plain.setId("P-1");
        plain.setOptions(null);
        ProductView view = assembler.summary(plain, List.of(sku("P-1", "P-1", "99")), stock("P-1", 3));
        assertThat(view.attributes()).containsEntry("low_stock", "3");
        assertThat(view.options()).isNull();
    }

    @Test
    void retiredProductIsNeverInStock() {
        Product retired = family();
        retired.setId("P-2");
        retired.setOptions(null);
        retired.setRetired(true);
        ProductView view = assembler.summary(retired, List.of(sku("P-2", "P-2", "99")), stock("P-2", 30));
        assertThat(view.inStock()).isFalse();
    }
}
