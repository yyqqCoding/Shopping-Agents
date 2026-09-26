package com.example.commerce.store;

import com.example.commerce.common.CommerceProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The store's delivery terms, read from {@code policies.json}. The web app's
 * {@code lib/storePolicy.ts} reads the same file, so the page and the quotes agree.
 */
public record StoreTerms(
        String currency,
        BigDecimal freeShippingOver,
        BigDecimal standardFee,
        BigDecimal expressFee,
        String standardEta,
        String expressEta) {

    /** The delivery promise an in-stock product carries in its attributes. */
    public String deliveryLabel() {
        return "标准配送约 " + standardEta;
    }

    @Configuration
    static class Loader {

        @Bean
        StoreTerms storeTerms(CommerceProperties properties, ObjectMapper mapper) throws IOException {
            JsonNode terms = mapper.readTree(Files.readString(Path.of(properties.dataDir(), "policies.json")))
                    .path("terms");
            return mapper.treeToValue(terms, StoreTerms.class);
        }
    }
}
