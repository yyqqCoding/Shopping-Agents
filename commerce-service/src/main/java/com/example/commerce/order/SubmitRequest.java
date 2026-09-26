package com.example.commerce.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** A submission: the conversation whose cart is ordered and the lines its checkout card showed. */
public record SubmitRequest(
        @NotBlank String conversationId,
        @NotEmpty @Size(max = 100) List<@Valid Line> lines) {

    public record Line(@NotBlank String skuId, @Min(1) @Max(24) int quantity) {}
}
