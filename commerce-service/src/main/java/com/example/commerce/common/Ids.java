package com.example.commerce.common;

import java.util.regex.Pattern;

/** Checks for the ids that arrive in headers and paths. */
public final class Ids {

    private static final Pattern UUID =
            Pattern.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final Pattern CATALOG_ID = Pattern.compile("[A-Za-z0-9_-]{1,40}");

    private Ids() {}

    /** The user, conversation and request ids are UUIDs, stored lower-case. */
    public static String uuid(String value) {
        if (value == null || !UUID.matcher(value).matches()) {
            throw new BizException(ErrorCode.VALIDATION, "请求参数无效");
        }
        return value.toLowerCase();
    }

    public static boolean isCatalogId(String value) {
        return value != null && CATALOG_ID.matcher(value).matches();
    }
}
