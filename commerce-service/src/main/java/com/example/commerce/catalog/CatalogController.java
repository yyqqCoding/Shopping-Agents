package com.example.commerce.catalog;

import com.example.commerce.common.BizException;
import com.example.commerce.common.ErrorCode;
import com.example.commerce.common.Ids;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/catalog")
public class CatalogController {

    private final CatalogService catalog;

    public CatalogController(CatalogService catalog) {
        this.catalog = catalog;
    }

    /** The agent's {@code search_products}: at most eight products and a keyset cursor. */
    @PostMapping("/search")
    public SearchPage search(@Valid @RequestBody SearchRequest request) {
        return catalog.search(new SearchQuery(request));
    }

    /** The public equipment pages. */
    @GetMapping("/products")
    public ListingPage list(
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "24") @Min(1) @Max(100) int limit,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int offset) {
        return catalog.list(category == null || category.isBlank() ? null : category, limit, offset);
    }

    @GetMapping("/products/{id}")
    public ProductView details(@PathVariable String id) {
        if (!Ids.isCatalogId(id)) {
            throw new BizException(ErrorCode.NOT_FOUND, "未找到这件商品");
        }
        return catalog.details(id).orElseThrow(() -> new BizException(ErrorCode.NOT_FOUND, "未找到这件商品"));
    }
}
