package com.example.commerce.importer;

import com.example.commerce.importer.SeedRows.PolicyRow;
import com.example.commerce.importer.SeedRows.ProductRow;
import com.example.commerce.importer.SeedRows.SkuRow;
import com.example.commerce.importer.SeedRows.StockRow;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;

/** Idempotent writes for the importer: product content is replaced, stock is not. */
@Mapper
public interface ImportMapper {

    @Insert("INSERT INTO product (id, title, category, currency, short_description, image_url, rating, "
            + "review_count, options, detail, evidence, search_text, display_order, retired) VALUES ("
            + "#{id}, #{title}, #{category}, #{currency}, #{shortDescription}, #{imageUrl}, #{rating}, "
            + "#{reviewCount}, #{optionsJson}, #{detailJson}, #{evidenceJson}, #{searchText}, #{displayOrder}, "
            + "#{retired}) AS new ON DUPLICATE KEY UPDATE title = new.title, category = new.category, "
            + "currency = new.currency, short_description = new.short_description, image_url = new.image_url, "
            + "rating = new.rating, review_count = new.review_count, options = new.options, detail = new.detail, "
            + "evidence = new.evidence, search_text = new.search_text, display_order = new.display_order, "
            + "retired = new.retired")
    void upsertProduct(ProductRow row);

    @Insert("INSERT INTO sku (id, product_id, title, price, currency, image_url, option_values, attributes, "
            + "detail, weight_g, capacity_l, people, comfort_temperature_c, r_value, waterproof_mm, evidence, "
            + "display_order, retired) VALUES (#{id}, #{productId}, #{title}, #{price}, #{currency}, #{imageUrl}, "
            + "#{optionValuesJson}, #{attributesJson}, #{detailJson}, #{weightG}, #{capacityL}, #{people}, "
            + "#{comfortTemperatureC}, #{rValue}, #{waterproofMm}, #{evidenceJson}, #{displayOrder}, #{retired}) "
            + "AS new ON DUPLICATE KEY UPDATE product_id = new.product_id, title = new.title, price = new.price, "
            + "currency = new.currency, image_url = new.image_url, option_values = new.option_values, "
            + "attributes = new.attributes, detail = new.detail, weight_g = new.weight_g, "
            + "capacity_l = new.capacity_l, people = new.people, "
            + "comfort_temperature_c = new.comfort_temperature_c, r_value = new.r_value, "
            + "waterproof_mm = new.waterproof_mm, evidence = new.evidence, display_order = new.display_order, "
            + "retired = new.retired")
    void upsertSku(SkuRow row);

    /** A SKU new to the table gets its initial stock; an existing row keeps what it has. */
    @Insert("INSERT INTO inventory (sku_id, stock, low_stock_threshold) "
            + "VALUES (#{skuId}, #{stock}, #{lowStockThreshold}) AS new "
            + "ON DUPLICATE KEY UPDATE low_stock_threshold = new.low_stock_threshold")
    void insertStock(StockRow row);

    /** {@code --reset-inventory}: back to the authored stock. */
    @Insert("INSERT INTO inventory (sku_id, stock, low_stock_threshold) "
            + "VALUES (#{skuId}, #{stock}, #{lowStockThreshold}) AS new "
            + "ON DUPLICATE KEY UPDATE stock = new.stock, low_stock_threshold = new.low_stock_threshold")
    void resetStock(StockRow row);

    @Insert("INSERT INTO policy (id, title, category, content, search_text) "
            + "VALUES (#{id}, #{title}, #{category}, #{content}, #{searchText}) AS new "
            + "ON DUPLICATE KEY UPDATE title = new.title, category = new.category, content = new.content, "
            + "search_text = new.search_text")
    void upsertPolicy(PolicyRow row);

    @Delete("DELETE FROM order_item")
    int deleteOrderItems();

    @Delete("DELETE FROM orders")
    int deleteOrders();
}
