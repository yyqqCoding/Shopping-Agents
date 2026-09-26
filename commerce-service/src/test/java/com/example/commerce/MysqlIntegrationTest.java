package com.example.commerce;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.commerce.cart.CartItem;
import com.example.commerce.cart.CartItemMapper;
import com.example.commerce.cart.CartService;
import com.example.commerce.catalog.CatalogService;
import com.example.commerce.catalog.ProductView;
import com.example.commerce.catalog.SearchCursor;
import com.example.commerce.catalog.SearchPage;
import com.example.commerce.catalog.SearchQuery;
import com.example.commerce.catalog.SearchRequest;
import com.example.commerce.catalog.Sku;
import com.example.commerce.catalog.SkuMapper;
import com.example.commerce.common.BizException;
import com.example.commerce.common.CommerceProperties;
import com.example.commerce.common.ErrorCode;
import com.example.commerce.importer.CatalogSeed;
import com.example.commerce.importer.ImportMapper;
import com.example.commerce.importer.SeedRows.StockRow;
import com.example.commerce.inventory.Inventory;
import com.example.commerce.inventory.InventoryMapper;
import com.example.commerce.order.OrderController;
import com.example.commerce.order.OrderView;
import com.example.commerce.order.SubmitRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Runs against a real MySQL 8: {@code COMMERCE_TEST_DB_URL}, {@code COMMERCE_TEST_DB_USER}
 * and {@code COMMERCE_TEST_DB_PASSWORD}. The {@code test} profile of
 * {@code deploy/commerce/compose.yaml} starts a throwaway database and runs these.
 * Row locks, lock ordering and unique-key races cannot be reproduced without one.
 */
@EnabledIfEnvironmentVariable(named = "COMMERCE_TEST_DB_URL", matches = ".+")
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = {
            "spring.datasource.url=${COMMERCE_TEST_DB_URL}",
            "spring.datasource.username=${COMMERCE_TEST_DB_USER:root}",
            "spring.datasource.password=${COMMERCE_TEST_DB_PASSWORD:}",
            "spring.datasource.hikari.maximum-pool-size=10",
            "commerce.service-token=test-token",
            "logging.level.com.example.commerce=INFO",
        })
class MysqlIntegrationTest {

    static final String PLAIN = "OD-1001";

    @Autowired CatalogService catalog;
    @Autowired CartService carts;
    @Autowired OrderController orders;
    @Autowired CartItemMapper cartItems;
    @Autowired InventoryMapper inventory;
    @Autowired SkuMapper skus;
    @Autowired ImportMapper importer;
    @Autowired TransactionTemplate transaction;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired CommerceProperties properties;

    CatalogSeed seed;

    @BeforeEach
    void freshCatalog() throws Exception {
        seed = new CatalogSeed(Path.of(properties.dataDir()), json);
        transaction.executeWithoutResult(status -> {
            jdbc.update("DELETE FROM cart_item");
            importer.deleteOrderItems();
            importer.deleteOrders();
            seed.products.forEach(importer::upsertProduct);
            seed.skus.forEach(importer::upsertSku);
            seed.policies.forEach(importer::upsertPolicy);
            seed.stock.forEach(importer::resetStock);
        });
    }

    // -- catalog ----------------------------------------------------------------------

    @Test
    void everyConditionIsMetByOneSku() {
        // OD-4001-S becomes cheap but sold out; its in-stock siblings stay at 499.
        jdbc.update("UPDATE sku SET price = 1 WHERE id = 'OD-4001-S'");
        setStock("OD-4001-S", 0);
        assertThat(ids(search(null, "outdoor-apparel", new BigDecimal("100"), true, Map.of())))
                .doesNotContain("OD-4001");
        assertThat(ids(search(null, "outdoor-apparel", new BigDecimal("100"), null, Map.of())))
                .contains("OD-4001");
    }

    @Test
    void numericFiltersCompareNumbers() {
        List<ProductView> light = search(null, "outdoor-shelter", null, null, Map.of("max_weight_g", "1000"));
        for (ProductView product : light) {
            List<Sku> own = skus.ofProducts(List.of(product.productId()));
            assertThat(own).anyMatch(sku -> sku.getWeightG() != null && sku.getWeightG() <= 1000);
        }
        assertThat(search(null, "outdoor-shelter", null, null, Map.of("max_weight_g", "轻"))).isEmpty();
    }

    @Test
    void pagesCoverTheCategoryWithoutRepeats() {
        for (String sort : List.of("relevance", "price_asc", "price_desc", "rating")) {
            List<String> seen = new ArrayList<>();
            SearchCursor cursor = null;
            do {
                SearchPage page = catalog.search(new SearchQuery(new SearchRequest(
                        List.of(), "outdoor-shelter", null, null, null, null, Map.of(), sort, 3, cursor)));
                page.products().forEach(product -> seen.add(product.productId()));
                cursor = page.hasMore() ? page.nextCursor() : null;
            } while (cursor != null);
            long total = catalog.list("outdoor-shelter", 100, 0).total();
            assertThat(seen).as(sort).doesNotHaveDuplicates().hasSize((int) total);
        }
    }

    @Test
    void retiredRecordsKeepTheirDetailsButLeaveSearch() {
        assertThat(catalog.details("AR-1001")).get().satisfies(product -> assertThat(product.inStock()).isFalse());
        assertThat(ids(search(List.of("咖啡"), null, null, null, Map.of()))).noneMatch(id -> id.startsWith("AR-"));
    }

    // -- cart -------------------------------------------------------------------------

    @Test
    void addingChecksStockButTakesNone() {
        String user = uuid();
        String conversation = uuid();
        assertCode(() -> carts.add(user, conversation, PLAIN, 5), ErrorCode.UNAVAILABLE);
        carts.add(user, conversation, PLAIN, 2);
        assertThat(stockOf(PLAIN)).isEqualTo(4);
        assertThat(carts.get(user, conversation).items()).singleElement()
                .satisfies(line -> assertThat(line.quantity()).isEqualTo(2));
        assertCode(() -> carts.add(user, conversation, "AR-1001", 1), ErrorCode.UNAVAILABLE);
    }

    // -- orders -----------------------------------------------------------------------

    @Test
    void neverSellsMoreThanTheStock() throws Exception {
        assertThat(stockOf(PLAIN)).isEqualTo(4);
        List<Result> results = submitConcurrently(50, PLAIN, 1);
        assertThat(results.stream().filter(Result::placed)).hasSize(4);
        assertThat(results.stream().filter(r -> r.code == ErrorCode.OUT_OF_STOCK)).hasSize(46);
        assertThat(stockOf(PLAIN)).isZero();
        assertReconciled();
    }

    @Test
    void sellsEveryUnitWhenBuyersQueue() throws Exception {
        setStock(PLAIN, 10);
        List<Result> results = submitConcurrently(20, PLAIN, 1);
        assertThat(results.stream().filter(Result::placed)).hasSize(10);
        assertThat(stockOf(PLAIN)).isZero();
    }

    @Test
    void aShortLineRollsBackTheWholeOrder() {
        // x sorts first, so its stock is taken before y comes up short.
        String x = PLAIN;
        String y = "OD-1002";
        String user = uuid();
        String conversation = uuid();
        carts.add(user, conversation, x, 2);
        carts.add(user, conversation, y, 3);
        setStock(y, 2);
        int before = stockOf(x);
        assertCode(() -> submit(user, conversation, uuid(), Map.of(x, 2, y, 3)), ErrorCode.OUT_OF_STOCK);
        assertThat(stockOf(x)).isEqualTo(before);
        assertThat(carts.get(user, conversation).items()).hasSize(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM orders", Integer.class)).isZero();
    }

    @Test
    void ordersNamingTheSameSkusInEitherOrderBothComplete() throws Exception {
        String x = "OD-1002";
        String y = "OD-1003";
        ExecutorService pool = Executors.newFixedThreadPool(8);
        try {
            List<Future<OrderView>> placed = new ArrayList<>();
            CountDownLatch start = new CountDownLatch(1);
            for (int i = 0; i < 8; i++) {
                String user = uuid();
                String conversation = uuid();
                // Added in opposite orders; the submission locks by sku_id either way.
                if (i % 2 == 0) {
                    carts.add(user, conversation, x, 1);
                    carts.add(user, conversation, y, 1);
                } else {
                    carts.add(user, conversation, y, 1);
                    carts.add(user, conversation, x, 1);
                }
                placed.add(pool.submit(() -> {
                    start.await();
                    return submit(user, conversation, uuid(), Map.of(x, 1, y, 1));
                }));
            }
            start.countDown();
            for (Future<OrderView> order : placed) {
                assertThat(order.get().orderId()).startsWith("SO");
            }
        } finally {
            pool.shutdown();
        }
        assertReconciled();
    }

    @Test
    void oneIdempotencyKeyPlacesOneOrder() throws Exception {
        String user = uuid();
        String conversation = uuid();
        String key = uuid();
        carts.add(user, conversation, PLAIN, 1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch start = new CountDownLatch(1);
            Callable<OrderView> attempt = () -> {
                start.await();
                return submit(user, conversation, key, Map.of(PLAIN, 1));
            };
            Future<OrderView> first = pool.submit(attempt);
            Future<OrderView> second = pool.submit(attempt);
            start.countDown();
            assertThat(first.get().orderId()).isEqualTo(second.get().orderId());
        } finally {
            pool.shutdown();
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM orders", Integer.class)).isEqualTo(1);
        assertThat(stockOf(PLAIN)).isEqualTo(3);
    }

    @Test
    void aChangedCartIsNotSubmitted() {
        String user = uuid();
        String conversation = uuid();
        carts.add(user, conversation, PLAIN, 1);
        carts.add(user, conversation, "OD-1002", 1);
        assertCode(() -> submit(user, conversation, uuid(), Map.of(PLAIN, 1)), ErrorCode.CART_CHANGED);
        assertThat(stockOf(PLAIN)).isEqualTo(4);
    }

    @Test
    void aSubmittedCartIsEmpty() {
        String user = uuid();
        String conversation = uuid();
        carts.add(user, conversation, PLAIN, 1);
        OrderView order = submit(user, conversation, uuid(), Map.of(PLAIN, 1));
        assertThat(order.items()).singleElement().satisfies(item -> assertThat(item.productId()).isEqualTo(PLAIN));
        assertThat(carts.get(user, conversation).items()).isEmpty();
        assertCode(() -> submit(user, conversation, uuid(), Map.of(PLAIN, 1)), ErrorCode.CART_EMPTY);
        assertThat(orders.list(user, 5)).extracting(OrderView::orderId).containsExactly(order.orderId());
    }

    // -- import -----------------------------------------------------------------------

    @Test
    void reimportKeepsStockAndResetRestoresIt() {
        String user = uuid();
        String conversation = uuid();
        carts.add(user, conversation, PLAIN, 1);
        submit(user, conversation, uuid(), Map.of(PLAIN, 1));
        transaction.executeWithoutResult(status -> seed.stock.forEach(importer::insertStock));
        assertThat(stockOf(PLAIN)).isEqualTo(3);
        transaction.executeWithoutResult(status -> {
            importer.deleteOrderItems();
            importer.deleteOrders();
            seed.stock.forEach(importer::resetStock);
        });
        assertThat(stockOf(PLAIN)).isEqualTo(4);
        assertReconciled();
    }

    // -- helpers ----------------------------------------------------------------------

    record Result(OrderView order, ErrorCode code) {
        boolean placed() {
            return order != null;
        }
    }

    List<Result> submitConcurrently(int buyers, String sku, int quantity) throws Exception {
        List<String[]> ready = new ArrayList<>();
        for (int i = 0; i < buyers; i++) {
            String user = uuid();
            String conversation = uuid();
            // Put the line in the cart directly: the add-time stock check would refuse
            // carts beyond the stock, and the race under test is at submission.
            CartItem line = new CartItem();
            line.setUserId(user);
            line.setConversationId(conversation);
            line.setSkuId(sku);
            line.setQuantity(quantity);
            cartItems.insert(line);
            ready.add(new String[] {user, conversation});
        }
        ExecutorService pool = Executors.newFixedThreadPool(buyers);
        try {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Result>> futures = new ArrayList<>();
            for (String[] buyer : ready) {
                futures.add(pool.submit(() -> {
                    start.await();
                    try {
                        return new Result(submit(buyer[0], buyer[1], uuid(), Map.of(sku, quantity)), null);
                    } catch (BizException refused) {
                        return new Result(null, refused.code());
                    }
                }));
            }
            start.countDown();
            List<Result> results = new ArrayList<>();
            for (Future<Result> future : futures) {
                results.add(future.get());
            }
            return results;
        } finally {
            pool.shutdown();
        }
    }

    OrderView submit(String user, String conversation, String key, Map<String, Integer> lines) {
        List<SubmitRequest.Line> shown = lines.entrySet().stream()
                .map(entry -> new SubmitRequest.Line(entry.getKey(), entry.getValue()))
                .toList();
        return orders.submit(user, key, new SubmitRequest(conversation, shown));
    }

    List<ProductView> search(
            List<String> terms, String category, BigDecimal maxPrice, Boolean inStock, Map<String, String> attributes) {
        return catalog.search(new SearchQuery(new SearchRequest(
                terms == null ? List.of() : terms, category, null, maxPrice, null, inStock, attributes,
                null, 8, null))).products();
    }

    /** Stock plus every quantity ordered equals the authored stock, for every SKU. */
    void assertReconciled() {
        Map<String, Integer> authored = new HashMap<>();
        seed.stock.forEach(row -> authored.put(row.getSkuId(), row.getStock()));
        Map<String, Integer> ordered = new HashMap<>();
        jdbc.query("SELECT sku_id, SUM(quantity) AS sold FROM order_item GROUP BY sku_id",
                (ResultSet row) -> {
                    ordered.put(row.getString("sku_id"), row.getInt("sold"));
                });
        Set<String> wrong = new HashSet<>();
        for (Inventory row : inventory.selectList(Wrappers.lambdaQuery())) {
            int expected = authored.getOrDefault(row.getSkuId(), row.getStock());
            if (row.getStock() + ordered.getOrDefault(row.getSkuId(), 0) != expected || row.getStock() < 0) {
                wrong.add(row.getSkuId());
            }
        }
        assertThat(wrong).isEmpty();
    }

    void setStock(String sku, int stock) {
        jdbc.update("UPDATE inventory SET stock = ? WHERE sku_id = ?", stock, sku);
        seed.stock.replaceAll(row -> row.getSkuId().equals(sku)
                ? new StockRow(sku, stock, row.getLowStockThreshold())
                : row);
    }

    int stockOf(String sku) {
        return inventory.selectById(sku).getStock();
    }

    static List<String> ids(List<ProductView> products) {
        return products.stream().map(ProductView::productId).toList();
    }

    static String uuid() {
        return UUID.randomUUID().toString();
    }

    static void assertCode(Runnable call, ErrorCode code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(BizException.class,
                refused -> assertThat(refused.code()).isEqualTo(code));
    }
}
