package com.example.commerce.catalog;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ProductMapper extends BaseMapper<Product> {

    /** One page of product ids and sort keys; the SQL is in {@code mapper/ProductMapper.xml}. */
    List<SearchRow> search(SearchQuery query);
}
