package com.example.commerce.order;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

/** A submitted order. {@code orderNo} is the id customers and the agent see. */
@Data
@TableName("orders")
public class Order {

    public static final String PLACED = "PLACED";

    @TableId(type = IdType.AUTO)
    private Long id;

    private String orderNo;
    private String userId;
    private String conversationId;
    private String requestId;
    private String status;
    private Integer itemCount;
    private BigDecimal totalAmount;
    private String currency;
    /** UTC. */
    private LocalDateTime createdAt;
}
