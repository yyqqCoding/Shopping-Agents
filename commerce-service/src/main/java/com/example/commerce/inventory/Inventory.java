package com.example.commerce.inventory;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("inventory")
public class Inventory {

    @TableId(type = IdType.INPUT)
    private String skuId;

    private Integer stock;
    private Integer lowStockThreshold;
}
