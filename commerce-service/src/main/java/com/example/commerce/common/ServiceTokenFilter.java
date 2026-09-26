package com.example.commerce.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.slf4j.MDC;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Every {@code /internal} route requires the agent API's bearer token. The conversation id
 * the API sends goes into the log context, so the SQL one conversation ran can be found
 * by that id.
 */
@Component
@ConditionalOnWebApplication
public class ServiceTokenFilter extends OncePerRequestFilter {

    private static final String UNAUTHORIZED_BODY =
            "{\"title\":\"UNAUTHORIZED\",\"status\":401,\"detail\":\"服务令牌无效\",\"code\":\"UNAUTHORIZED\"}";

    private final byte[] expected;

    public ServiceTokenFilter(CommerceProperties properties) {
        String token = properties.serviceToken();
        if (token == null || token.isBlank()) {
            throw new IllegalStateException("COMMERCE_SERVICE_TOKEN must be set");
        }
        this.expected = ("Bearer " + token.strip()).getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/internal/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        byte[] given = header == null ? new byte[0] : header.getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, given)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(UNAUTHORIZED_BODY);
            return;
        }
        String conversation = request.getHeader("X-Conversation-Id");
        if (conversation != null && conversation.matches("[0-9a-fA-F-]{1,36}")) {
            MDC.put("conversation", conversation);
        }
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove("conversation");
        }
    }
}
