package com.example.commerce.store;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.example.commerce.catalog.SearchQuery;
import com.example.commerce.common.Ids;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

/** Policies, delivery quotes and the health check. */
@RestController
public class StoreController {

    private final PolicyMapper policies;
    private final FulfillmentService fulfillment;
    private final JdbcTemplate jdbc;

    public StoreController(PolicyMapper policies, FulfillmentService fulfillment, JdbcTemplate jdbc) {
        this.policies = policies;
        this.fulfillment = fulfillment;
        this.jdbc = jdbc;
    }

    public record PolicySearch(List<String> terms) {}

    public record QuoteRequest(@NotBlank String conversationId, @Size(max = 20) List<String> productIds) {}

    /** Up to three passages containing any of the keywords, or the first three. */
    @PostMapping("/internal/v1/policies/search")
    public List<Policy> searchPolicies(@RequestBody PolicySearch body) {
        List<String> terms = SearchQuery.cleanTerms(body.terms());
        LambdaQueryWrapper<Policy> where = Wrappers.lambdaQuery();
        if (!terms.isEmpty()) {
            where.and(any -> terms.forEach(term -> any.or().like(Policy::getSearchText, term)));
        }
        return policies.selectList(where.orderByAsc(Policy::getId).last("LIMIT 3"));
    }

    @PostMapping("/internal/v1/fulfillment/quote")
    public List<FulfillmentService.Option> quote(
            @RequestHeader("X-User-Id") String userId, @Valid @RequestBody QuoteRequest body) {
        List<String> ids = body.productIds() == null ? List.of() : body.productIds();
        return fulfillment.quote(Ids.uuid(userId), Ids.uuid(body.conversationId()), ids);
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        jdbc.queryForObject("SELECT 1", Integer.class);
        return Map.of("ok", true);
    }
}
