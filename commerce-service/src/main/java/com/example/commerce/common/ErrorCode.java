package com.example.commerce.common;

import org.springframework.http.HttpStatus;

/** The {@code code} every error body carries; the agent API maps each one. */
public enum ErrorCode {
    VALIDATION(HttpStatus.BAD_REQUEST),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED),
    NOT_FOUND(HttpStatus.NOT_FOUND),
    /** A cart write for a SKU that is retired, out of stock, or short of the quantity. */
    UNAVAILABLE(HttpStatus.CONFLICT),
    /** A submitted order whose SKU no longer has the stock; the whole order rolled back. */
    OUT_OF_STOCK(HttpStatus.CONFLICT),
    /** The lines on the checkout card differ from the cart. */
    CART_CHANGED(HttpStatus.CONFLICT),
    CART_EMPTY(HttpStatus.CONFLICT),
    INTERNAL(HttpStatus.INTERNAL_SERVER_ERROR);

    private final HttpStatus status;

    ErrorCode(HttpStatus status) {
        this.status = status;
    }

    public HttpStatus status() {
        return status;
    }
}
