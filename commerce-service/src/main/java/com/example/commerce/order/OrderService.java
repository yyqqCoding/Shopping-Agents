package com.example.commerce.order;

import com.baomidou.mybatisplus.core.toolkit.IdWorker;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.commerce.cart.CartItem;
import com.example.commerce.cart.CartItemMapper;
import com.example.commerce.catalog.Product;
import com.example.commerce.catalog.ProductMapper;
import com.example.commerce.catalog.Sku;
import com.example.commerce.catalog.SkuMapper;
import com.example.commerce.common.BizException;
import com.example.commerce.common.ErrorCode;
import com.example.commerce.inventory.InventoryMapper;
import com.example.commerce.store.StoreTerms;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {

    private final OrderMapper orders;
    private final OrderItemMapper orderItems;
    private final CartItemMapper cartItems;
    private final SkuMapper skus;
    private final ProductMapper products;
    private final InventoryMapper inventory;
    private final StoreTerms terms;

    public OrderService(
            OrderMapper orders,
            OrderItemMapper orderItems,
            CartItemMapper cartItems,
            SkuMapper skus,
            ProductMapper products,
            InventoryMapper inventory,
            StoreTerms terms) {
        this.orders = orders;
        this.orderItems = orderItems;
        this.cartItems = cartItems;
        this.skus = skus;
        this.products = products;
        this.inventory = inventory;
        this.terms = terms;
    }

    /**
     * Orders the conversation's cart and takes its stock, all or nothing. Any
     * {@link BizException} rolls the whole transaction back: no order, no stock taken,
     * the cart as it was. Called from the controller so the transaction proxy applies.
     */
    @Transactional(rollbackFor = Exception.class)
    public OrderView submit(String userId, String requestId, SubmitRequest request) {
        String conversationId = request.conversationId();
        // Lock first, then look for an earlier order with this key: a retry that waited
        // on the lock reads the order its first attempt committed. (The first plain read
        // opens the transaction's snapshot, so it must come after the lock is held.)
        List<CartItem> lines = cartItems.lockCart(conversationId, userId);
        Order existing = byRequest(userId, requestId);
        if (existing != null) {
            return view(existing);
        }
        if (lines.isEmpty()) {
            throw new BizException(ErrorCode.CART_EMPTY, "购物车已提交或为空");
        }
        if (!sameLines(lines, request.lines())) {
            throw new BizException(ErrorCode.CART_CHANGED, "购物车已变化，请让助手重新整理结算");
        }
        Map<String, Sku> skuById = byId(skus.selectBatchIds(lines.stream().map(CartItem::getSkuId).toList()), Sku::getId);
        Map<String, Product> productById = byId(
                products.selectBatchIds(skuById.values().stream().map(Sku::getProductId).distinct().toList()),
                Product::getId);
        for (CartItem line : lines) {
            Sku sku = skuById.get(line.getSkuId());
            Product product = sku == null ? null : productById.get(sku.getProductId());
            if (sku == null || product == null || Boolean.TRUE.equals(sku.getRetired())
                    || Boolean.TRUE.equals(product.getRetired())) {
                throw new BizException(ErrorCode.OUT_OF_STOCK, line.getSkuId() + " 已下架，请让助手从购物车移除");
            }
        }

        Order order = new Order();
        order.setOrderNo("SO" + IdWorker.getIdStr());
        order.setUserId(userId);
        order.setConversationId(conversationId);
        order.setRequestId(requestId);
        order.setStatus(Order.PLACED);
        order.setItemCount(lines.stream().mapToInt(CartItem::getQuantity).sum());
        order.setTotalAmount(lines.stream()
                .map(line -> skuById.get(line.getSkuId()).getPrice().multiply(BigDecimal.valueOf(line.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        order.setCurrency(skuById.get(lines.get(0).getSkuId()).getCurrency());
        order.setCreatedAt(LocalDateTime.now(ZoneOffset.UTC).withNano(0));
        orders.insert(order);

        // lockCart returned the lines by sku_id, so every submission locks stock rows in
        // the same order and two orders naming the same SKUs cannot deadlock.
        for (CartItem line : lines) {
            if (inventory.deduct(line.getSkuId(), line.getQuantity()) == 0) {
                throw new BizException(ErrorCode.OUT_OF_STOCK, line.getSkuId() + " 库存不足，请让助手调整购物车");
            }
        }
        for (CartItem line : lines) {
            Sku sku = skuById.get(line.getSkuId());
            OrderItem item = new OrderItem();
            item.setOrderId(order.getId());
            item.setSkuId(sku.getId());
            item.setProductId(sku.getProductId());
            item.setTitle(sku.getTitle());
            item.setOptionValues(sku.getOptionValues());
            item.setPrice(sku.getPrice());
            item.setQuantity(line.getQuantity());
            orderItems.insert(item);
        }
        cartItems.delete(Wrappers.<CartItem>lambdaQuery()
                .eq(CartItem::getConversationId, conversationId)
                .eq(CartItem::getUserId, userId));
        return view(order);
    }

    public Order byRequest(String userId, String requestId) {
        return orders.selectOne(Wrappers.<Order>lambdaQuery()
                .eq(Order::getUserId, userId)
                .eq(Order::getRequestId, requestId));
    }

    /** The user's orders, newest first (idx_user_created). */
    public List<OrderView> list(String userId, int limit) {
        return orders.selectList(Wrappers.<Order>lambdaQuery()
                        .eq(Order::getUserId, userId)
                        .orderByDesc(Order::getCreatedAt, Order::getId)
                        .last("LIMIT " + limit))
                .stream()
                .map(this::view)
                .toList();
    }

    public OrderView get(String userId, String orderNo) {
        Order order = orders.selectOne(Wrappers.<Order>lambdaQuery()
                .eq(Order::getOrderNo, orderNo)
                .eq(Order::getUserId, userId));
        if (order == null) {
            throw new BizException(ErrorCode.NOT_FOUND, "未找到这张订单");
        }
        return view(order);
    }

    public OrderView view(Order order) {
        List<OrderView.Item> items = orderItems.selectList(Wrappers.<OrderItem>lambdaQuery()
                        .eq(OrderItem::getOrderId, order.getId())
                        .orderByAsc(OrderItem::getId))
                .stream()
                .map(item -> new OrderView.Item(
                        item.getSkuId(),
                        item.getTitle(),
                        item.getQuantity(),
                        item.getPrice(),
                        item.getOptionValues(),
                        item.getSkuId().equals(item.getProductId()) ? null : item.getProductId()))
                .toList();
        return new OrderView(
                order.getOrderNo(),
                "processing",
                order.getCreatedAt().atOffset(ZoneOffset.UTC),
                items,
                order.getTotalAmount(),
                order.getCurrency(),
                "预计 " + terms.standardEta() + "送达（模拟配送）");
    }

    /** The card's lines and the locked cart name the same SKUs with the same quantities. */
    static boolean sameLines(List<CartItem> cart, List<SubmitRequest.Line> shown) {
        Map<String, Integer> expected = new HashMap<>();
        for (SubmitRequest.Line line : shown) {
            if (expected.put(line.skuId(), line.quantity()) != null) {
                return false;
            }
        }
        Map<String, Integer> actual = cart.stream()
                .collect(Collectors.toMap(CartItem::getSkuId, CartItem::getQuantity));
        return Objects.equals(expected, actual);
    }

    private static <T> Map<String, T> byId(List<T> rows, Function<T, String> id) {
        return rows.stream().collect(Collectors.toMap(id, row -> row));
    }
}
