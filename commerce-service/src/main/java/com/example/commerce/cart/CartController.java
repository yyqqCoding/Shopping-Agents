package com.example.commerce.cart;

import com.example.commerce.common.Ids;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/carts/{conversationId}")
public class CartController {

    private final CartService carts;

    public CartController(CartService carts) {
        this.carts = carts;
    }

    public record AddLine(@NotBlank String skuId, int quantity) {}

    public record SetQuantity(int quantity) {}

    @GetMapping
    public CartView get(@RequestHeader("X-User-Id") String userId, @PathVariable String conversationId) {
        return carts.get(Ids.uuid(userId), Ids.uuid(conversationId));
    }

    @PostMapping("/items")
    public CartView add(
            @RequestHeader("X-User-Id") String userId,
            @PathVariable String conversationId,
            @Valid @RequestBody AddLine body) {
        return carts.add(Ids.uuid(userId), Ids.uuid(conversationId), body.skuId(), body.quantity());
    }

    @PutMapping("/items/{skuId}")
    public CartView set(
            @RequestHeader("X-User-Id") String userId,
            @PathVariable String conversationId,
            @PathVariable String skuId,
            @RequestBody SetQuantity body) {
        return carts.set(Ids.uuid(userId), Ids.uuid(conversationId), skuId, body.quantity());
    }

    @DeleteMapping("/items/{skuId}")
    public CartView remove(
            @RequestHeader("X-User-Id") String userId,
            @PathVariable String conversationId,
            @PathVariable String skuId) {
        return carts.remove(Ids.uuid(userId), Ids.uuid(conversationId), skuId);
    }
}
