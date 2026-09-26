package com.example.commerce.cart;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/** One line of a conversation's cart. It holds no price: a cart is priced when read. */
@Data
@TableName("cart_item")
public class CartItem {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String conversationId;
    private String userId;
    private String skuId;
    private Integer quantity;
}
