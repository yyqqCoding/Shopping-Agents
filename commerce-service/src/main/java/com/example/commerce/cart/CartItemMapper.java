package com.example.commerce.cart;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface CartItemMapper extends BaseMapper<CartItem> {

    /** Adds to the line when the conversation already holds the SKU (uk_conversation_sku). */
    @Insert("INSERT INTO cart_item (conversation_id, user_id, sku_id, quantity) "
            + "VALUES (#{cid}, #{uid}, #{skuId}, #{qty}) AS new "
            + "ON DUPLICATE KEY UPDATE quantity = cart_item.quantity + new.quantity")
    int addQuantity(
            @Param("cid") String conversationId,
            @Param("uid") String userId,
            @Param("skuId") String skuId,
            @Param("qty") int quantity);

    /**
     * Locks the conversation's lines until the transaction ends, so two submissions of one
     * cart run one after the other. Ordered by SKU id, the order stock rows are locked in.
     */
    @Select("SELECT * FROM cart_item WHERE conversation_id = #{cid} AND user_id = #{uid} "
            + "ORDER BY sku_id FOR UPDATE")
    List<CartItem> lockCart(@Param("cid") String conversationId, @Param("uid") String userId);
}
