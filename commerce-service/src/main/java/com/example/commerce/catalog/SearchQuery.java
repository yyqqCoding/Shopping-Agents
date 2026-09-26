package com.example.commerce.catalog;

import com.example.commerce.common.BizException;
import com.example.commerce.common.ErrorCode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.Getter;

/**
 * A search request checked and reduced to the parameters {@code ProductMapper.xml} binds.
 * The model never supplies SQL: column names and operators come from {@link #NUMERIC},
 * the sort from {@link #SORTS}, and every value is a bound parameter.
 */
@Getter
public class SearchQuery {

    public static final int DEFAULT_LIMIT = 6;
    public static final int MAX_LIMIT = 8;
    static final Set<String> SORTS = Set.of("relevance", "price_asc", "price_desc", "rating");

    /** Numeric attribute filter → the SKU column it reads and the comparison. */
    static final Map<String, NumericFilter> NUMERIC = Map.of(
            "max_weight_g", new NumericFilter("weight_g", "<=", null),
            "min_capacity_l", new NumericFilter("capacity_l", ">=", null),
            "min_people", new NumericFilter("people", ">=", null),
            "max_comfort_temperature_c", new NumericFilter("comfort_temperature_c", "<=", null),
            "min_r_value", new NumericFilter("r_value", ">=", null),
            "min_waterproof_mm", new NumericFilter("waterproof_mm", ">=", null));

    private static final Map<String, String> ATTRIBUTE_ALIASES = Map.of(
            "颜色", "color", "尺寸", "size", "尺码", "size", "材质", "material", "容量", "capacity", "色号", "shade");
    private static final Pattern ATTRIBUTE_KEY = Pattern.compile("[\\p{L}\\p{N}_]{1,32}");
    private static final Pattern NUMBER = Pattern.compile("-?\\d+(\\.\\d+)?");
    private static final int MAX_TERMS = 24;

    private final List<String> terms;
    private final String category;
    private final BigDecimal minPrice;
    private final BigDecimal maxPrice;
    private final BigDecimal minRating;
    private final Boolean inStock;
    private final List<NumericFilter> numericFilters = new ArrayList<>();
    private final List<TextFilter> textFilters = new ArrayList<>();
    /** A filter no SKU can satisfy (a non-numeric value for a numeric filter, say). */
    private boolean impossible;
    private final String sort;
    private final int limit;
    private final SearchCursor cursor;

    public SearchQuery(SearchRequest request) {
        this.terms = cleanTerms(request.terms());
        this.category = blankToNull(request.category());
        this.minPrice = request.minPrice();
        this.maxPrice = request.maxPrice();
        this.minRating = request.minRating();
        this.inStock = request.inStock();
        this.sort = request.sort() == null ? "relevance" : request.sort();
        if (!SORTS.contains(sort)) {
            throw new BizException(ErrorCode.VALIDATION, "不支持的排序方式");
        }
        int requested = request.limit() == null ? DEFAULT_LIMIT : request.limit();
        this.limit = Math.max(1, Math.min(MAX_LIMIT, requested));
        this.cursor = request.cursor();
        checkCursor();
        if (request.attributes() != null) {
            request.attributes().forEach(this::addAttribute);
        }
    }

    /** One row more than the page, to learn whether a next page exists. */
    public int getFetch() {
        return limit + 1;
    }

    /** Keywords lower-cased, deduplicated, stripped of LIKE wildcards, at most 24. */
    public static List<String> cleanTerms(List<String> raw) {
        Set<String> seen = new LinkedHashSet<>();
        if (raw != null) {
            for (String term : raw) {
                if (term == null) {
                    continue;
                }
                // LIKE treats % and _ as wildcards; a keyword must match literally.
                String clean = term.strip().toLowerCase(Locale.ROOT).replaceAll("[%_\\\\]", "");
                if (!clean.isEmpty() && clean.length() <= 40) {
                    seen.add(clean);
                }
                if (seen.size() == MAX_TERMS) {
                    break;
                }
            }
        }
        return List.copyOf(seen);
    }

    private void addAttribute(String rawKey, String rawValue) {
        if (rawKey == null || rawValue == null || rawValue.isBlank()) {
            return;
        }
        String key = rawKey.strip();
        NumericFilter numeric = NUMERIC.get(key);
        if (numeric != null) {
            String value = rawValue.strip();
            if (NUMBER.matcher(value).matches()) {
                numericFilters.add(new NumericFilter(numeric.getColumn(), numeric.getOperator(), new BigDecimal(value)));
            } else {
                impossible = true;
            }
            return;
        }
        key = ATTRIBUTE_ALIASES.getOrDefault(key, key);
        String value = rawValue.strip().toLowerCase(Locale.ROOT).replaceAll("[%_\\\\]", "");
        if (!ATTRIBUTE_KEY.matcher(key).matches() || value.isEmpty()) {
            impossible = true;
            return;
        }
        textFilters.add(new TextFilter("$.\"" + key + "\"", value));
    }

    private void checkCursor() {
        if (cursor == null) {
            return;
        }
        boolean complete = cursor.id() != null
                && switch (sort) {
                    case "price_asc", "price_desc" -> cursor.price() != null;
                    case "rating" -> cursor.rating() != null;
                    default -> cursor.relevance() != null && cursor.displayOrder() != null;
                };
        if (!complete) {
            throw new BizException(ErrorCode.VALIDATION, "翻页游标与排序方式不匹配");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    /** A comparison on a whitelisted SKU column. */
    @Getter
    public static class NumericFilter {
        private final String column;
        private final String operator;
        private final BigDecimal value;

        NumericFilter(String column, String operator, BigDecimal value) {
            this.column = column;
            this.operator = operator;
            this.value = value;
        }
    }

    /** A value an option or attribute must hold, at a JSON path bound as a parameter. */
    @Getter
    public static class TextFilter {
        private final String path;
        private final String value;

        TextFilter(String path, String value) {
            this.path = path;
            this.value = value;
        }
    }
}
