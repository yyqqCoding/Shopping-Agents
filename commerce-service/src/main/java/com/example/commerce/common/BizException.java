package com.example.commerce.common;

/**
 * A business refusal. It is unchecked so that {@code @Transactional} rolls back, and its
 * detail is the sentence the customer or the model reads.
 */
public class BizException extends RuntimeException {

    private final ErrorCode code;

    public BizException(ErrorCode code, String detail) {
        super(detail);
        this.code = code;
    }

    public ErrorCode code() {
        return code;
    }
}
