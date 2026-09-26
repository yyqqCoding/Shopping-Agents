package com.example.commerce.catalog;

import java.util.List;

/** One page of search results; {@code nextCursor} is null when {@code hasMore} is false. */
public record SearchPage(List<ProductView> products, boolean hasMore, SearchCursor nextCursor) {}
