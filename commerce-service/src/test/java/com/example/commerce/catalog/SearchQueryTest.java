package com.example.commerce.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.example.commerce.common.BizException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SearchQueryTest {

    static SearchRequest request(Map<String, String> attributes, String sort, Integer limit, SearchCursor cursor) {
        return new SearchRequest(List.of("头灯"), null, null, null, null, null, attributes, sort, limit, cursor);
    }

    @Test
    void numericFiltersUseWhitelistedColumns() {
        SearchQuery query = new SearchQuery(request(Map.of("max_weight_g", "1000", "min_capacity_l", "30"), null, null, null));
        assertThat(query.getNumericFilters())
                .extracting(SearchQuery.NumericFilter::getColumn, SearchQuery.NumericFilter::getOperator)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple("weight_g", "<="),
                        org.assertj.core.groups.Tuple.tuple("capacity_l", ">="));
        assertThat(query.isImpossible()).isFalse();
    }

    @Test
    void aNonNumericValueMatchesNothing() {
        SearchQuery query = new SearchQuery(request(Map.of("max_weight_g", "轻"), null, null, null));
        assertThat(query.isImpossible()).isTrue();
    }

    @Test
    void attributeKeysAreAliasedAndBoundAsPaths() {
        SearchQuery query = new SearchQuery(request(Map.of("尺码", "L"), null, null, null));
        assertThat(query.getTextFilters()).singleElement().satisfies(filter -> {
            assertThat(filter.getPath()).isEqualTo("$.\"size\"");
            assertThat(filter.getValue()).isEqualTo("l");
        });
    }

    @Test
    void anUnsafeAttributeKeyMatchesNothing() {
        SearchQuery query = new SearchQuery(request(Map.of("size\") OR 1=1 --", "L"), null, null, null));
        assertThat(query.isImpossible()).isTrue();
        assertThat(query.getTextFilters()).isEmpty();
    }

    @Test
    void limitIsClampedAndFetchesOneExtraRow() {
        assertThat(new SearchQuery(request(null, null, 50, null)).getLimit()).isEqualTo(8);
        assertThat(new SearchQuery(request(null, null, 0, null)).getLimit()).isEqualTo(1);
        assertThat(new SearchQuery(request(null, null, null, null)).getFetch()).isEqualTo(7);
    }

    @Test
    void unknownSortIsRejected() {
        assertThatThrownBy(() -> new SearchQuery(request(null, "id; DROP TABLE sku", null, null)))
                .isInstanceOf(BizException.class);
    }

    @Test
    void cursorMustCarryTheKeysOfItsSort() {
        SearchCursor priceOnly = new SearchCursor("OD-1001", new BigDecimal("699"), null, null, null);
        assertThat(new SearchQuery(request(null, "price_asc", null, priceOnly)).getCursor()).isEqualTo(priceOnly);
        assertThatThrownBy(() -> new SearchQuery(request(null, "relevance", null, priceOnly)))
                .isInstanceOf(BizException.class);
    }

    @Test
    void termsLoseWildcardsAndDuplicates() {
        assertThat(SearchQuery.cleanTerms(List.of("Tent", "tent", "%", "a_b", " 帐篷 ")))
                .containsExactly("tent", "ab", "帐篷");
    }
}
