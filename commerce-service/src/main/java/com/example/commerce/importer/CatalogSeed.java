package com.example.commerce.importer;

import com.example.commerce.importer.SeedRows.PolicyRow;
import com.example.commerce.importer.SeedRows.ProductRow;
import com.example.commerce.importer.SeedRows.SkuRow;
import com.example.commerce.importer.SeedRows.StockRow;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The authored catalog as table rows. It reads {@code catalog.json}, {@code inventory.json},
 * {@code evidence.json} and {@code policies.json}, plus the retired records in
 * {@code legacy/}, and fills each variant from its family the way
 * {@code demo_common.storefront_fixtures.load_catalog} does.
 *
 * <p>Initial stock: a plain product takes its {@code inventory.json} row; each in-stock
 * variant takes its family's row; a record authored out of stock, and every retired
 * record, starts at zero.
 */
public class CatalogSeed {

    /** What a variant takes from its family unless it states its own. */
    private static final List<String> VARIANT_INHERITS = List.of(
            "title", "price", "currency", "image_url", "short_description", "long_description", "specs");
    private static final Pattern NUMBER = Pattern.compile("-?\\d+(\\.\\d+)?");
    private static final String RETIRED_NOTE = "已下架，仅供历史查看";
    private static final int SEARCH_TEXT_LIMIT = 2000;

    public final List<ProductRow> products = new ArrayList<>();
    public final List<SkuRow> skus = new ArrayList<>();
    public final List<StockRow> stock = new ArrayList<>();
    public final List<PolicyRow> policies = new ArrayList<>();

    private final ObjectMapper json;
    private final Map<String, JsonNode> evidence = new LinkedHashMap<>();
    private final Map<String, Integer> authoredStock = new LinkedHashMap<>();
    private int defaultThreshold = 8;
    private int displayOrder = 0;

    public CatalogSeed(Path dataDir, ObjectMapper json) throws IOException {
        this.json = json;
        Path legacy = dataDir.resolve("legacy");
        // Current evidence wins over legacy evidence for an id both carry.
        readEvidence(legacy.resolve("evidence.json"));
        readEvidence(dataDir.resolve("evidence.json"));
        JsonNode inventory = read(dataDir.resolve("inventory.json"));
        defaultThreshold = inventory.path("default_threshold").asInt(8);
        for (JsonNode row : inventory.path("inventory")) {
            authoredStock.put(row.path("product_id").asText(), row.path("stock").asInt(0));
        }
        addCatalog(read(dataDir.resolve("catalog.json")), false);
        if (Files.exists(legacy.resolve("catalog.json"))) {
            addCatalog(read(legacy.resolve("catalog.json")), true);
        }
        for (JsonNode policy : read(dataDir.resolve("policies.json")).path("policies")) {
            String id = policy.path("policy_id").asText();
            String title = policy.path("title").asText();
            String category = text(policy, "category");
            String content = policy.path("content").asText();
            policies.add(new PolicyRow(id, title, category, content,
                    limit(String.join(" ", id, title, category == null ? "" : category, content))));
        }
    }

    private void addCatalog(JsonNode catalog, boolean retired) {
        for (JsonNode entry : catalog.path("products")) {
            ObjectNode family = entry.deepCopy();
            family.remove("variants");
            if (retired) {
                family.put("title", family.path("title").asText().replaceFirst("^ACME ", ""));
                ObjectNode attributes = attributesOf(family);
                attributes.put("retired", "true");
                attributes.put("availability_note", RETIRED_NOTE);
            }
            String id = family.path("product_id").asText();
            JsonNode variants = entry.path("variants");
            List<ObjectNode> filled = new ArrayList<>();
            for (JsonNode compact : variants) {
                filled.add(fillVariant(family, compact, retired));
            }
            if (!filled.isEmpty() && !family.hasNonNull("options")) {
                family.set("options", json.valueToTree(optionsOf(filled)));
            }
            products.add(productRow(family, retired));
            if (filled.isEmpty()) {
                skus.add(skuRow(family, id, 0, retired, null));
                stock.add(new StockRow(id, initialStock(family, authoredStock.get(id), retired), defaultThreshold));
            } else {
                int order = 0;
                for (ObjectNode variant : filled) {
                    String variantId = variant.path("product_id").asText();
                    skus.add(skuRow(variant, id, order++, retired, variant.get("option_values")));
                    stock.add(new StockRow(variantId, initialStock(variant, authoredStock.get(id), retired), defaultThreshold));
                }
            }
        }
    }

    private ObjectNode fillVariant(ObjectNode family, JsonNode compact, boolean retired) {
        ObjectNode variant = json.createObjectNode();
        for (String key : VARIANT_INHERITS) {
            if (family.has(key)) {
                variant.set(key, family.get(key).deepCopy());
            }
        }
        compact.fields().forEachRemaining(field -> {
            if (!field.getKey().equals("attributes")) {
                variant.set(field.getKey(), field.getValue().deepCopy());
            }
        });
        ObjectNode attributes = attributesOf(family).deepCopy();
        if (compact.has("attributes")) {
            attributes.setAll((ObjectNode) compact.get("attributes"));
        }
        variant.set("attributes", attributes);
        if (retired) {
            variant.put("title", variant.path("title").asText().replaceFirst("^ACME ", ""));
        }
        return variant;
    }

    private static ObjectNode attributesOf(ObjectNode record) {
        if (!(record.get("attributes") instanceof ObjectNode)) {
            record.putObject("attributes");
        }
        return (ObjectNode) record.get("attributes");
    }

    private static Map<String, List<String>> optionsOf(List<ObjectNode> variants) {
        Map<String, List<String>> options = new LinkedHashMap<>();
        for (ObjectNode variant : variants) {
            variant.path("option_values").fields().forEachRemaining(field -> {
                List<String> values = options.computeIfAbsent(field.getKey(), key -> new ArrayList<>());
                if (!values.contains(field.getValue().asText())) {
                    values.add(field.getValue().asText());
                }
            });
        }
        return options;
    }

    private int initialStock(JsonNode record, Integer authored, boolean retired) {
        if (retired || !record.path("in_stock").asBoolean(true) || authored == null) {
            return 0;
        }
        return authored;
    }

    private ProductRow productRow(ObjectNode product, boolean retired) {
        ObjectNode detail = json.createObjectNode();
        for (String key : List.of("labels", "attributes", "long_description", "specs", "review_highlights")) {
            if (product.hasNonNull(key)) {
                detail.set(key, product.get(key));
            }
        }
        String id = product.path("product_id").asText();
        return new ProductRow(
                id,
                product.path("title").asText(),
                product.path("category").asText(),
                currency(product),
                text(product, "short_description"),
                text(product, "image_url"),
                product.hasNonNull("rating") ? product.get("rating").decimalValue() : null,
                product.hasNonNull("review_count") ? product.get("review_count").asInt() : null,
                product.hasNonNull("options") ? write(product.get("options")) : null,
                write(detail),
                evidence.containsKey(id) ? write(evidence.get(id)) : null,
                searchText(product),
                displayOrder++,
                retired);
    }

    private SkuRow skuRow(JsonNode record, String productId, int order, boolean retired, JsonNode optionValues) {
        String id = record.path("product_id").asText();
        ObjectNode detail = json.createObjectNode();
        for (String key : List.of("short_description", "long_description", "specs")) {
            if (record.hasNonNull(key)) {
                detail.set(key, record.get(key));
            }
        }
        JsonNode attributes = record.path("attributes");
        boolean variant = !id.equals(productId);
        return new SkuRow(
                id,
                productId,
                record.path("title").asText(),
                record.path("price").decimalValue(),
                currency(record),
                text(record, "image_url"),
                optionValues == null ? null : write(optionValues),
                write(attributes.isMissingNode() ? json.createObjectNode() : attributes),
                write(detail),
                integer(attributes, "weight_g"),
                decimal(attributes, "capacity_l"),
                integer(attributes, "people"),
                decimal(attributes, "comfort_temperature_c"),
                decimal(attributes, "r_value"),
                integer(attributes, "waterproof_mm"),
                variant && evidence.containsKey(id) ? write(evidence.get(id)) : null,
                order,
                retired);
    }

    /** Title, category, description, authored search terms, attributes and option values. */
    private static String searchText(JsonNode product) {
        Set<String> pieces = new LinkedHashSet<>();
        pieces.add(product.path("title").asText());
        pieces.add(product.path("category").asText());
        pieces.add(product.path("short_description").asText());
        product.path("search_terms").forEach(term -> pieces.add(term.asText()));
        product.path("attributes").fields().forEachRemaining(field ->
                pieces.add(field.getKey() + " " + field.getValue().asText()));
        product.path("options").fields().forEachRemaining(field -> {
            pieces.add(field.getKey());
            field.getValue().forEach(value -> pieces.add(value.asText()));
        });
        pieces.remove("");
        return limit(String.join(" ", pieces));
    }

    /** A record without a currency is priced in USD, as the agent's Product model defaults. */
    private static String currency(JsonNode record) {
        return record.hasNonNull("currency") ? record.get("currency").asText() : "USD";
    }

    private static String limit(String text) {
        return text.length() <= SEARCH_TEXT_LIMIT ? text : text.substring(0, SEARCH_TEXT_LIMIT);
    }

    private static String text(JsonNode node, String key) {
        return node.hasNonNull(key) ? node.get(key).asText() : null;
    }

    private static BigDecimal decimal(JsonNode attributes, String key) {
        String value = attributes.path(key).asText("").strip();
        return NUMBER.matcher(value).matches() ? new BigDecimal(value) : null;
    }

    private static Integer integer(JsonNode attributes, String key) {
        BigDecimal value = decimal(attributes, key);
        return value == null || value.stripTrailingZeros().scale() > 0 ? null : value.intValueExact();
    }

    private void readEvidence(Path path) throws IOException {
        if (Files.exists(path)) {
            read(path).fields().forEachRemaining(field -> evidence.put(field.getKey(), field.getValue()));
        }
    }

    private JsonNode read(Path path) throws IOException {
        return json.readTree(Files.readString(path));
    }

    private String write(JsonNode node) {
        try {
            return json.writeValueAsString(node);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException(error);
        }
    }
}
