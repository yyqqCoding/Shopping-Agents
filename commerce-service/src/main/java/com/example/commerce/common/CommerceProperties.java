package com.example.commerce.common;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * {@code serviceToken} is the shared secret the agent API sends as a bearer token;
 * {@code dataDir} holds the authored JSON the importer and the store terms read.
 */
@ConfigurationProperties(prefix = "commerce")
public record CommerceProperties(String serviceToken, String dataDir) {}
