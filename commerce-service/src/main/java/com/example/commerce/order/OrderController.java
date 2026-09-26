package com.example.commerce.order;

import com.example.commerce.common.Ids;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/orders")
public class OrderController {

    private final OrderService orders;

    public OrderController(OrderService orders) {
        this.orders = orders;
    }

    /**
     * Submits the cart. A repeat of the same Idempotency-Key returns the first order. Two
     * concurrent requests with one key both pass the lookup; the second insert then breaks
     * uk_user_request, its transaction has already rolled back, and the first order is
     * read here, outside any transaction.
     */
    @PostMapping
    public OrderView submit(
            @RequestHeader("X-User-Id") String userId,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody SubmitRequest body) {
        String user = Ids.uuid(userId);
        String requestId = Ids.uuid(idempotencyKey);
        SubmitRequest request = new SubmitRequest(Ids.uuid(body.conversationId()), body.lines());
        try {
            return orders.submit(user, requestId, request);
        } catch (DuplicateKeyException duplicate) {
            Order first = orders.byRequest(user, requestId);
            if (first == null) {
                throw duplicate;
            }
            return orders.view(first);
        }
    }

    @GetMapping
    public List<OrderView> list(
            @RequestHeader("X-User-Id") String userId,
            @RequestParam(defaultValue = "5") @Min(1) @Max(20) int limit) {
        return orders.list(Ids.uuid(userId), limit);
    }

    @GetMapping("/{orderNo}")
    public OrderView get(@RequestHeader("X-User-Id") String userId, @PathVariable String orderNo) {
        return orders.get(Ids.uuid(userId), orderNo);
    }
}
