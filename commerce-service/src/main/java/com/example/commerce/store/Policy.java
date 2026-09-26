package com.example.commerce.store;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/** A help or policy passage; it leaves as {@code shopping_agent.types.Policy}. */
@Data
@TableName("policy")
public class Policy {

    @TableId(type = IdType.INPUT)
    @JsonProperty("policy_id")
    private String id;

    private String title;
    private String category;
    private String content;

    @JsonIgnore
    private String searchText;
}
