package com.example.commerce.catalog;

import com.example.commerce.inventory.Inventory;
import com.example.commerce.store.StoreTerms;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Builds {@link ProductView}s from rows and live stock. Availability is computed here and
 * nowhere else: a SKU is in stock while it is not retired and its stock is above zero; a
 * family is in stock while any variant is and shows its lowest in-stock price.
 */
@Component
public class ProductAssembler {

    static final String DELIVERY = "delivery";
    static final String LOW_STOCK = "low_stock";
    private static final int DEFAULT_THRESHOLD = 8;

    private final StoreTerms terms;

    public ProductAssembler(StoreTerms terms) {
        this.terms = terms;
    }

    public ProductView summary(Product product, List<Sku> skus, Map<String, Inventory> stock) {
        return listing(product, skus, stock, false);
    }

    public ProductView details(Product product, List<Sku> skus, Map<String, Inventory> stock) {
        return listing(product, skus, stock, true);
    }

    /** A variant looked up by its own id: the family's shared fields with its own. */
    public ProductView variantDetails(Product family, Sku sku, Map<String, Inventory> stock) {
        return variant(family, sku, stock, true);
    }

    public static int stockOf(Sku sku, Map<String, Inventory> stock) {
        Inventory row = stock.get(sku.getId());
        return Boolean.TRUE.equals(sku.getRetired()) || row == null ? 0 : row.getStock();
    }

    private ProductView listing(Product product, List<Sku> skus, Map<String, Inventory> stock, boolean full) {
        Map<String, Object> detail = product.getDetail();
        boolean retired = Boolean.TRUE.equals(product.getRetired());
        BigDecimal price;
        String currency = product.getCurrency();
        int available;
        int threshold = skus.stream()
                .map(sku -> stock.get(sku.getId()))
                .filter(row -> row != null)
                .map(Inventory::getLowStockThreshold)
                .findFirst()
                .orElse(DEFAULT_THRESHOLD);
        List<ProductView> variants = null;
        if (product.isFamily()) {
            List<Sku> sellable = skus.stream().filter(sku -> stockOf(sku, stock) > 0).toList();
            price = (sellable.isEmpty() ? skus : sellable).stream()
                    .map(Sku::getPrice)
                    .min(Comparator.naturalOrder())
                    .orElse(BigDecimal.ZERO);
            available = sellable.stream().mapToInt(sku -> stockOf(sku, stock)).sum();
            if (full) {
                variants = skus.stream().map(sku -> variant(product, sku, stock, false)).toList();
            }
        } else {
            Sku own = skus.stream()
                    .filter(sku -> sku.getId().equals(product.getId()))
                    .findFirst()
                    .orElseThrow(() -> new IllegalStateException("Product without its SKU: " + product.getId()));
            price = own.getPrice();
            currency = own.getCurrency();
            available = stockOf(own, stock);
        }
        boolean inStock = !retired && available > 0;
        return new ProductView(
                product.getId(),
                product.getTitle(),
                price,
                currency,
                product.getRating(),
                product.getReviewCount(),
                product.getImageUrl(),
                product.getCategory(),
                strings(detail.get("labels")),
                stamped(stringMap(detail.get("attributes")), inStock, available, threshold),
                inStock,
                product.getShortDescription(),
                product.isFamily() ? product.getOptions() : null,
                null,
                null,
                full ? (String) detail.get("long_description") : null,
                full ? stringMap(detail.get("specs")) : null,
                full ? strings(detail.get("review_highlights")) : null,
                variants,
                full ? product.getEvidence() : null);
    }

    private ProductView variant(Product family, Sku sku, Map<String, Inventory> stock, boolean full) {
        Map<String, Object> detail = sku.getDetail();
        int available = stockOf(sku, stock);
        boolean inStock = !Boolean.TRUE.equals(family.getRetired()) && available > 0;
        Inventory row = stock.get(sku.getId());
        int threshold = row == null ? DEFAULT_THRESHOLD : row.getLowStockThreshold();
        return new ProductView(
                sku.getId(),
                sku.getTitle(),
                sku.getPrice(),
                sku.getCurrency(),
                family.getRating(),
                family.getReviewCount(),
                sku.getImageUrl() != null ? sku.getImageUrl() : family.getImageUrl(),
                family.getCategory(),
                null,
                stamped(sku.getAttributes(), inStock, available, threshold),
                inStock,
                (String) detail.get("short_description"),
                null,
                sku.getOptionValues(),
                family.getId(),
                full ? (String) detail.get("long_description") : null,
                full ? stringMap(detail.get("specs")) : null,
                null,
                null,
                full ? sku.getEvidence() : null);
    }

    /** The attributes the store stamps from live stock: the delivery promise and "only N left". */
    private Map<String, String> stamped(Map<String, String> authored, boolean inStock, int available, int threshold) {
        Map<String, String> attributes = new LinkedHashMap<>(authored == null ? Map.of() : authored);
        attributes.remove(DELIVERY);
        attributes.remove(LOW_STOCK);
        if (inStock) {
            attributes.put(DELIVERY, terms.deliveryLabel());
            if (available <= threshold) {
                attributes.put(LOW_STOCK, Integer.toString(available));
            }
        }
        return attributes;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, String> stringMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, String>) map : null;
    }

    @SuppressWarnings("unchecked")
    private static List<String> strings(Object value) {
        return value instanceof List<?> list ? (List<String>) list : null;
    }
}
