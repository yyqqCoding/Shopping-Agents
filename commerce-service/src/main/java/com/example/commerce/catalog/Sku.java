package com.example.commerce.catalog;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import java.math.BigDecimal;
import java.util.Map;
import lombok.Data;

/**
 * The unit the cart and orders take. A plain product has one SKU with its own id; a
 * family has one SKU per variant. The numeric columns back the search filters.
 */
@Data
@TableName(value = "sku", autoResultMap = true)
public class Sku {

    @TableId(type = IdType.INPUT)
    private String id;

    private String productId;
    private String title;
    private BigDecimal price;
    private String currency;
    private String imageUrl;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, String> optionValues;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, String> attributes;

    /** short_description, long_description, specs. */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> detail;

    private Integer weightG;
    private BigDecimal capacityL;
    private Integer people;
    private BigDecimal comfortTemperatureC;
    private BigDecimal rValue;
    private Integer waterproofMm;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> evidence;

    private Integer displayOrder;
    private Boolean retired;

    public boolean isVariant() {
        return !id.equals(productId);
    }
}
