package com.example.commerce.cart;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.commerce.catalog.Product;
import com.example.commerce.catalog.ProductAssembler;
import com.example.commerce.catalog.ProductMapper;
import com.example.commerce.catalog.Sku;
import com.example.commerce.catalog.SkuMapper;
import com.example.commerce.common.BizException;
import com.example.commerce.common.ErrorCode;
import com.example.commerce.inventory.Inventory;
import com.example.commerce.inventory.InventoryMapper;
import com.example.commerce.store.StoreTerms;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * The conversation's cart. Adding checks stock without holding it: stock is taken only
 * when the order is submitted. Every statement matches the conversation and the user.
 */
@Service
public class CartService {

    public static final int MAX_QUANTITY = 24;
    static final String RETIRED_REASON = "已下架，可从购物车移除";

    private final CartItemMapper items;
    private final SkuMapper skus;
    private final ProductMapper products;
    private final InventoryMapper inventory;
    private final StoreTerms terms;

    public CartService(
            CartItemMapper items,
            SkuMapper skus,
            ProductMapper products,
            InventoryMapper inventory,
            StoreTerms terms) {
        this.items = items;
        this.skus = skus;
        this.products = products;
        this.inventory = inventory;
        this.terms = terms;
    }

    public CartView get(String userId, String conversationId) {
        List<CartItem> lines = items.selectList(Wrappers.<CartItem>lambdaQuery()
                .eq(CartItem::getConversationId, conversationId)
                .eq(CartItem::getUserId, userId)
                .orderByAsc(CartItem::getId));
        if (lines.isEmpty()) {
            return new CartView(List.of(), terms.currency());
        }
        Map<String, Sku> skuById = byId(skus.selectBatchIds(lines.stream().map(CartItem::getSkuId).toList()), Sku::getId);
        Map<String, Product> productById = skuById.isEmpty()
                ? Map.of()
                : byId(products.selectBatchIds(skuById.values().stream().map(Sku::getProductId).distinct().toList()),
                        Product::getId);
        Map<String, Inventory> stock = inventory.bySku(skuById.keySet());
        List<CartView.Line> view = lines.stream()
                .filter(line -> skuById.containsKey(line.getSkuId()))
                .map(line -> {
                    Sku sku = skuById.get(line.getSkuId());
                    Product product = productById.get(sku.getProductId());
                    String image = sku.getImageUrl() == null && product != null
                            ? product.getImageUrl()
                            : sku.getImageUrl();
                    return new CartView.Line(
                            sku.getId(),
                            sku.getTitle(),
                            sku.getPrice(),
                            line.getQuantity(),
                            image,
                            sku.getOptionValues(),
                            sku.isVariant() ? sku.getProductId() : null,
                            product == null ? null : product.getCategory(),
                            unavailableReason(sku, product, stock, line.getQuantity()));
                })
                .toList();
        String currency = view.isEmpty() ? terms.currency() : skuById.get(view.get(0).productId()).getCurrency();
        return new CartView(view, currency);
    }

    public CartView add(String userId, String conversationId, String skuId, int quantity) {
        checkQuantity(quantity);
        Sku sku = purchasable(skuId);
        CartItem existing = line(userId, conversationId, skuId);
        int wanted = quantity + (existing == null ? 0 : existing.getQuantity());
        if (wanted > MAX_QUANTITY) {
            throw new BizException(ErrorCode.VALIDATION, "单件商品最多 " + MAX_QUANTITY + " 件");
        }
        requireStock(sku, wanted);
        items.addQuantity(conversationId, userId, skuId, quantity);
        return get(userId, conversationId);
    }

    /** Sets a line's quantity; a SKU the cart does not hold leaves the cart as it is. */
    public CartView set(String userId, String conversationId, String skuId, int quantity) {
        checkQuantity(quantity);
        CartItem existing = line(userId, conversationId, skuId);
        if (existing != null) {
            requireStock(purchasable(skuId), quantity);
            existing.setQuantity(quantity);
            items.updateById(existing);
        }
        return get(userId, conversationId);
    }

    public CartView remove(String userId, String conversationId, String skuId) {
        items.delete(Wrappers.<CartItem>lambdaQuery()
                .eq(CartItem::getConversationId, conversationId)
                .eq(CartItem::getUserId, userId)
                .eq(CartItem::getSkuId, skuId));
        return get(userId, conversationId);
    }

    private CartItem line(String userId, String conversationId, String skuId) {
        return items.selectOne(Wrappers.<CartItem>lambdaQuery()
                .eq(CartItem::getConversationId, conversationId)
                .eq(CartItem::getUserId, userId)
                .eq(CartItem::getSkuId, skuId));
    }

    /** A SKU the cart can take: it exists, it is not retired, and neither is its product. */
    private Sku purchasable(String skuId) {
        Sku sku = skus.selectById(skuId);
        if (sku == null) {
            Product product = products.selectById(skuId);
            if (product != null && product.isFamily()) {
                throw new BizException(ErrorCode.VALIDATION, skuId + " 需要先选择规格");
            }
            throw new BizException(ErrorCode.NOT_FOUND, "未找到这件商品");
        }
        Product product = products.selectById(sku.getProductId());
        if (Boolean.TRUE.equals(sku.getRetired()) || product == null || Boolean.TRUE.equals(product.getRetired())) {
            throw new BizException(ErrorCode.UNAVAILABLE, skuId + " 已下架，只能从购物车移除");
        }
        return sku;
    }

    /** The unavailable message names ids only: the SKU, its stock, and in-stock siblings. */
    private void requireStock(Sku sku, int wanted) {
        Map<String, Inventory> own = inventory.bySku(List.of(sku.getId()));
        int available = ProductAssembler.stockOf(sku, own);
        if (available >= wanted) {
            return;
        }
        StringBuilder detail = new StringBuilder(sku.getId())
                .append(available == 0 ? " 暂时缺货" : " 库存不足，仅剩 " + available + " 件");
        if (sku.isVariant()) {
            List<Sku> siblings = skus.ofProducts(List.of(sku.getProductId()));
            Map<String, Inventory> stock = inventory.bySku(siblings.stream().map(Sku::getId).toList());
            List<String> inStock = siblings.stream()
                    .filter(sibling -> !sibling.getId().equals(sku.getId()))
                    .filter(sibling -> ProductAssembler.stockOf(sibling, stock) >= wanted)
                    .map(Sku::getId)
                    .limit(6)
                    .toList();
            detail.append("；").append(sku.getProductId()).append(" 有货的规格：")
                    .append(inStock.isEmpty() ? "无" : String.join(", ", inStock));
        }
        throw new BizException(ErrorCode.UNAVAILABLE, detail.toString());
    }

    static String unavailableReason(Sku sku, Product product, Map<String, Inventory> stock, int quantity) {
        if (Boolean.TRUE.equals(sku.getRetired()) || product == null || Boolean.TRUE.equals(product.getRetired())) {
            return RETIRED_REASON;
        }
        int available = ProductAssembler.stockOf(sku, stock);
        if (available == 0) {
            return "暂时缺货";
        }
        return available < quantity ? "库存不足，仅剩 " + available + " 件" : null;
    }

    private static void checkQuantity(int quantity) {
        if (quantity < 1 || quantity > MAX_QUANTITY) {
            throw new BizException(ErrorCode.VALIDATION, "数量需在 1 到 " + MAX_QUANTITY + " 之间");
        }
    }

    private static <T> Map<String, T> byId(List<T> rows, Function<T, String> id) {
        return rows.stream().collect(Collectors.toMap(id, row -> row));
    }
}
