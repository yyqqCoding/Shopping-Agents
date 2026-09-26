package com.example.commerce.catalog;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.example.commerce.common.CommerceProperties;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CatalogController.class)
@EnableConfigurationProperties(CommerceProperties.class)
@TestPropertySource(properties = "commerce.service-token=test-token")
class CatalogControllerTest {

    @Autowired
    MockMvc mvc;

    @MockBean
    CatalogService catalog;

    static final String AUTH = "Bearer test-token";

    static ProductView product() {
        return new ProductView("OD-1001", "双人帐篷", new BigDecimal("699.00"), "CNY", new BigDecimal("4.50"), 105,
                null, "outdoor-shelter", null, Map.of("low_stock", "4"), true, null, null, null, null,
                null, null, null, null, null);
    }

    @Test
    void internalRoutesRequireTheServiceToken() throws Exception {
        mvc.perform(get("/internal/v1/catalog/products/OD-1001"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mvc.perform(get("/internal/v1/catalog/products/OD-1001").header("Authorization", "Bearer wrong"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(catalog);
    }

    @Test
    void productsLeaveInTheAgentsSnakeCaseShape() throws Exception {
        when(catalog.details("OD-1001")).thenReturn(Optional.of(product()));
        mvc.perform(get("/internal/v1/catalog/products/OD-1001").header("Authorization", AUTH))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.product_id").value("OD-1001"))
                .andExpect(jsonPath("$.review_count").value(105))
                .andExpect(jsonPath("$.in_stock").value(true))
                .andExpect(jsonPath("$.attributes.low_stock").value("4"))
                .andExpect(jsonPath("$.options").doesNotExist());
    }

    @Test
    void anUnknownProductIsNotFound() throws Exception {
        when(catalog.details("OD-9999")).thenReturn(Optional.empty());
        mvc.perform(get("/internal/v1/catalog/products/OD-9999").header("Authorization", AUTH))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void searchReturnsThePageAndCursor() throws Exception {
        SearchCursor next = new SearchCursor("OD-1001", new BigDecimal("699.00"), null, new BigDecimal("2"), 0);
        when(catalog.search(any())).thenReturn(new SearchPage(List.of(product()), true, next));
        mvc.perform(post("/internal/v1/catalog/search")
                        .header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"terms\":[\"帐篷\"],\"category\":\"outdoor-shelter\",\"max_price\":800,"
                                + "\"attributes\":{\"min_people\":\"2\"},\"limit\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.has_more").value(true))
                .andExpect(jsonPath("$.next_cursor.display_order").value(0))
                .andExpect(jsonPath("$.products[0].product_id").value("OD-1001"));
    }

    @Test
    void anUnsupportedSortIsAValidationError() throws Exception {
        mvc.perform(post("/internal/v1/catalog/search")
                        .header("Authorization", AUTH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"terms\":[],\"sort\":\"id\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));
    }
}
