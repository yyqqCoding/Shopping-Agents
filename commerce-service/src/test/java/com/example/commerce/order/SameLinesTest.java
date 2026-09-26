package com.example.commerce.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.commerce.cart.CartItem;
import java.util.List;
import org.junit.jupiter.api.Test;

class SameLinesTest {

    static CartItem line(String sku, int quantity) {
        CartItem item = new CartItem();
        item.setSkuId(sku);
        item.setQuantity(quantity);
        return item;
    }

    @Test
    void sameSkusAndQuantitiesInAnyOrderMatch() {
        assertThat(OrderService.sameLines(
                List.of(line("A", 1), line("B", 2)),
                List.of(new SubmitRequest.Line("B", 2), new SubmitRequest.Line("A", 1)))).isTrue();
    }

    @Test
    void aChangedQuantityOrAnAddedLineDoesNot() {
        List<CartItem> cart = List.of(line("A", 1), line("B", 2));
        assertThat(OrderService.sameLines(cart, List.of(new SubmitRequest.Line("A", 1), new SubmitRequest.Line("B", 3))))
                .isFalse();
        assertThat(OrderService.sameLines(cart, List.of(new SubmitRequest.Line("A", 1)))).isFalse();
    }

    @Test
    void aRepeatedSkuOnTheCardDoesNot() {
        assertThat(OrderService.sameLines(
                List.of(line("A", 2)),
                List.of(new SubmitRequest.Line("A", 1), new SubmitRequest.Line("A", 1)))).isFalse();
    }
}
