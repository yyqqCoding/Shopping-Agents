package com.example.commerce.order;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import java.math.BigDecimal;
import java.util.Map;
import lombok.Data;

/** An order line: the SKU with its title and unit price as they were at submission. */
@Data
@TableName(value = "order_item", autoResultMap = true)
public class OrderItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long orderId;
    private String skuId;
    private String productId;
    private String title;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, String> optionValues;

    private BigDecimal price;
    private Integer quantity;
}
