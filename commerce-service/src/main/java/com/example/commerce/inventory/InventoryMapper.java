package com.example.commerce.inventory;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface InventoryMapper extends BaseMapper<Inventory> {

    /**
     * The check and the decrement in one statement: InnoDB locks the row, concurrent
     * decrements of the same SKU queue on that lock, and 0 rows means the stock is short.
     */
    @Update("UPDATE inventory SET stock = stock - #{qty} WHERE sku_id = #{skuId} AND stock >= #{qty}")
    int deduct(@Param("skuId") String skuId, @Param("qty") int qty);

    /** Current stock by SKU id; a SKU without a row reads as absent. */
    default Map<String, Inventory> bySku(Collection<String> skuIds) {
        Map<String, Inventory> result = new HashMap<>();
        if (skuIds.isEmpty()) {
            return result;
        }
        for (Inventory row : selectList(Wrappers.<Inventory>lambdaQuery().in(Inventory::getSkuId, skuIds))) {
            result.put(row.getSkuId(), row);
        }
        return result;
    }
}
