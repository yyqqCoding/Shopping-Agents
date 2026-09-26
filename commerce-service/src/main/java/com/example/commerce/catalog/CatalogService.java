package com.example.commerce.catalog;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.commerce.inventory.Inventory;
import com.example.commerce.inventory.InventoryMapper;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class CatalogService {

    private final ProductMapper products;
    private final SkuMapper skus;
    private final InventoryMapper inventory;
    private final ProductAssembler assembler;

    public CatalogService(
            ProductMapper products, SkuMapper skus, InventoryMapper inventory, ProductAssembler assembler) {
        this.products = products;
        this.skus = skus;
        this.inventory = inventory;
        this.assembler = assembler;
    }

    public SearchPage search(SearchQuery query) {
        List<SearchRow> rows = products.search(query);
        boolean hasMore = rows.size() > query.getLimit();
        List<SearchRow> page = hasMore ? rows.subList(0, query.getLimit()) : rows;
        List<String> ids = page.stream().map(SearchRow::getId).toList();
        SearchCursor next = null;
        if (hasMore) {
            SearchRow last = page.get(page.size() - 1);
            next = new SearchCursor(
                    last.getId(), last.getListPrice(), ratingKey(last), last.getRelevance(), last.getDisplayOrder());
        }
        return new SearchPage(summaries(ids), hasMore, next);
    }

    public ListingPage list(String category, int limit, int offset) {
        LambdaQueryWrapper<Product> where = Wrappers.<Product>lambdaQuery()
                .eq(Product::getRetired, false)
                .eq(category != null, Product::getCategory, category);
        long total = products.selectCount(where);
        List<Product> page = products.selectList(where
                .orderByAsc(Product::getDisplayOrder, Product::getId)
                .last("LIMIT " + limit + " OFFSET " + offset));
        List<ProductView> views = summaries(page.stream().map(Product::getId).toList());
        return new ListingPage(views, offset + views.size() < total, total);
    }

    /** A product or family by its id, or a variant by its own id; retired records included. */
    public Optional<ProductView> details(String id) {
        Product product = products.selectById(id);
        if (product != null) {
            List<Sku> own = skus.ofProducts(List.of(id));
            return Optional.of(assembler.details(product, own, stockOf(own)));
        }
        Sku sku = skus.selectById(id);
        if (sku == null) {
            return Optional.empty();
        }
        Product family = products.selectById(sku.getProductId());
        return Optional.of(assembler.variantDetails(family, sku, stockOf(List.of(sku))));
    }

    /** Summaries in the order of {@code ids}. */
    List<ProductView> summaries(List<String> ids) {
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<String, Product> byId = products.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(Product::getId, product -> product));
        Map<String, List<Sku>> skusByProduct = new LinkedHashMap<>();
        List<Sku> all = skus.ofProducts(ids);
        for (Sku sku : all) {
            skusByProduct.computeIfAbsent(sku.getProductId(), key -> new ArrayList<>()).add(sku);
        }
        Map<String, Inventory> stock = stockOf(all);
        return ids.stream()
                .filter(byId::containsKey)
                .map(id -> assembler.summary(byId.get(id), skusByProduct.getOrDefault(id, List.of()), stock))
                .toList();
    }

    private Map<String, Inventory> stockOf(List<Sku> rows) {
        return inventory.bySku(rows.stream().map(Sku::getId).toList());
    }

    /** The rating sort treats a product without a rating as -1, so the cursor does too. */
    private static BigDecimal ratingKey(SearchRow row) {
        return row.getRating() == null ? BigDecimal.ONE.negate() : row.getRating();
    }
}
