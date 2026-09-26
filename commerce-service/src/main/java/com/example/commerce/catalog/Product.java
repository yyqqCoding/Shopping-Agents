package com.example.commerce.catalog;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import lombok.Data;

/** A plain product or a family; a family has {@code options} and its SKUs are its variants. */
@Data
@TableName(value = "product", autoResultMap = true)
public class Product {

    @TableId(type = IdType.INPUT)
    private String id;

    private String title;
    private String category;
    private String currency;
    private String shortDescription;
    private String imageUrl;
    private BigDecimal rating;
    private Integer reviewCount;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, List<String>> options;

    /** labels, attributes, long_description, specs, review_highlights. */
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> detail;

    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> evidence;

    private String searchText;
    private Integer displayOrder;
    private Boolean retired;

    public boolean isFamily() {
        return options != null && !options.isEmpty();
    }
}
