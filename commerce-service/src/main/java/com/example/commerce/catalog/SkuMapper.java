package com.example.commerce.catalog;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.Collection;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface SkuMapper extends BaseMapper<Sku> {

    default List<Sku> ofProducts(Collection<String> productIds) {
        if (productIds.isEmpty()) {
            return List.of();
        }
        return selectList(Wrappers.<Sku>lambdaQuery()
                .in(Sku::getProductId, productIds)
                .orderByAsc(Sku::getProductId, Sku::getDisplayOrder, Sku::getId));
    }
}
