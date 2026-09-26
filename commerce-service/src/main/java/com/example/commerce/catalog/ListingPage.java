package com.example.commerce.catalog;

import java.util.List;

/** A page of the public equipment listing, with the category's total. */
public record ListingPage(List<ProductView> products, boolean hasMore, long total) {}
