package com.example.commerce.store;

import com.example.commerce.cart.CartService;
import com.example.commerce.cart.CartView;
import com.example.commerce.catalog.CatalogService;
import com.example.commerce.catalog.ProductView;
import com.example.commerce.common.BizException;
import com.example.commerce.common.ErrorCode;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Delivery quotes from the store terms. The subtotal is the cart's when the quoted ids
 * are exactly the cart's lines, otherwise one of each quoted product.
 */
@Service
public class FulfillmentService {

    private final CatalogService catalog;
    private final CartService carts;
    private final StoreTerms terms;

    public FulfillmentService(CatalogService catalog, CartService carts, StoreTerms terms) {
        this.catalog = catalog;
        this.carts = carts;
        this.terms = terms;
    }

    /** {@code shopping_agent.types.FulfillmentOption}. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Option(String method, String eta, BigDecimal fee) {}

    public List<Option> quote(String userId, String conversationId, List<String> productIds) {
        Set<String> ids = new LinkedHashSet<>(productIds);
        List<ProductView> quoted = ids.stream()
                .map(catalog::details)
                .flatMap(Optional::stream)
                .toList();
        if (quoted.stream().anyMatch(p -> !p.inStock() || !terms.currency().equals(p.currency()))) {
            throw new BizException(ErrorCode.UNAVAILABLE, "已下架或缺货商品没有配送方案。");
        }
        CartView cart = carts.get(userId, conversationId);
        Set<String> cartIds = cart.items().stream().map(CartView.Line::productId).collect(Collectors.toSet());
        Set<String> quotedIds = quoted.stream().map(ProductView::productId).collect(Collectors.toSet());
        boolean matchesCart = !cart.items().isEmpty()
                && terms.currency().equals(cart.currency())
                && cartIds.equals(quotedIds);
        BigDecimal subtotal = matchesCart
                ? cart.subtotal()
                : quoted.stream().map(ProductView::price).reduce(BigDecimal.ZERO, BigDecimal::add);
        String basis = matchesCart ? "按当前购物车数量" : "按所列商品各 1 件估算";
        BigDecimal standardFee = subtotal.compareTo(terms.freeShippingOver()) > 0 ? BigDecimal.ZERO : terms.standardFee();
        return List.of(
                new Option("delivery", terms.standardEta() + "（模拟标准配送，" + basis + "）", standardFee),
                new Option("delivery", terms.expressEta() + "（模拟加急配送，" + basis + "）", terms.expressFee()));
    }
}
