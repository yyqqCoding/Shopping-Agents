> 学习对象：Anthropic `commerce-agents` / `shopping-agent`  
> 基于：2026-09-04 阅读的 `main` 分支  
> 学习模式：源码定位 → 核心对象 → 调用链 → 具体例子 → 为什么这样设计 → 可迁移经验  
> 仓库：https://github.com/anthropics/commerce-agents


# 第 8 章：Memory——结构化长期记忆系统

这个项目的 Memory 不是：

```text
把以前所有聊天重新塞进 Prompt
```

而是：

```text
Conversation
↓
Memory Extraction
↓
Structured MemoryFact
↓
Validation / Filter
↓
MemoryStore
↓
Tier-1 automatic context
+
Tier-2 recall
```

核心源码：
https://github.com/anthropics/commerce-agents/blob/main/commerce-common/commerce_common/memory.py

---

# 1. 四种 Context 再区分

```text
Conversation History
= 当前聊天记录

Session Context
= 当前用户环境

Session State
= 当前执行状态 / Provenance

Long-term Memory
= 跨 Session durable facts
```

Memory 不等于 `messages[]`。

---

# 2. MemoryFact

结构：

```text
key
value
category
updated_at
source_session_id
```

Category：

```text
preference
constraint
context
```

例如：

```text
key: outdoor_preference
value: Prefers lightweight outdoor gear
category: preference
```

---

# 3. 为什么结构化 Fact 比保存整段聊天好？

整段聊天：

```text
Token 大
噪声多
旧事实难更新
隐私边界难管理
```

Fact：

```text
有 key
可 upsert
可分类
可过滤
可 Recall
可过期
```

更适合长期用户状态。

---

# 4. Category

```text
constraint
= Picks 必须尊重的规则

preference
= 默认倾向，可被今天请求覆盖

context
= 背景事实
```

例如：

```text
跑鞋预算不超过 150
→ constraint

喜欢深色
→ preference

家庭有 4 条手机线
→ context
```

---

# 5. MemoryStore

单独定义 Protocol：

```text
get_facts
upsert_facts
search_facts
delete_fact
clear
purge_generation
```

可以落到：

```text
InMemory
JSON
PostgreSQL
Redis
Vector DB
Memory Service
```

Memory 没放在 StorefrontBackend，因为它是：

```text
Agent Infrastructure
```

而不是商城业务系统。

---

# 6. Fail Fast

`check_memory_store()` 会在 Store 进入 Deployment 时检查协议方法。

这样：

```text
不完整 MemoryStore
→ 启动时失败
```

而不是聊完一轮做 Extraction 时才突然失败。

---

# 7. Memory Write Filter

默认阻止类似：

```text
长数字标识
IBAN
Email
```

目的：

```text
Memory 应保存偏好/长期规则
不是账号/卡号/联系方式
```

Deployment 还能增加自己的 Regex 或 Check。

---

# 8. `validate_fact()`

每个 Candidate 会：

```text
sanitize key/value
key normalize
长度限制
category 映射
updated_at
source_session
write filter
```

因此不是：

```text
Claude 说存什么就原样存什么
```

---

# 9. 两条 Memory 写路径

## A. 用户明确要求记

```text
“记住，以后跑鞋不要超过 150”
```

主 Agent：

```text
save_memory
```

当前 Turn 直接写。

## B. Post-turn Auto Extraction

Messages API：

```text
stream_turn 完成
↓
update_memory()
↓
另一次 LLM 调用
↓
抽取 durable facts
```

---

# 10. 为什么单独 Memory Extractor？

Main Agent：

```text
完成当前购物任务
```

Memory Extractor：

```text
判断哪些内容以后还会有用
```

如果主 Agent 同时负责：

```text
Tool Routing
当前回答
Memory 去重
更新旧 key
敏感过滤
```

职责过重。

---

# 11. Extraction 标准

核心：

```text
未来仍然会是真的
并且
下次仍然有用
```

只能记录用户明确说过的，不能添加推断。

例如：

```text
“我通常喜欢轻量装备”
→ durable

“这次帐篷预算 250”
→ 更可能只是当前任务
```

---

# 12. Memory 要独立可读

坏：

```text
has kids
```

更好：

```text
household_lines:
four lines, two for teenagers' phones
```

长期 Fact 应脱离原对话几个月后仍可理解。

---

# 13. 保存 Need，不保存 Product

正确：

```text
lodging_needs:
work trips need a kitchen and walkable location
```

错误：

```text
liked_hotel:
Hotel A $199
```

长期 Memory 要保存：

```text
Stable Need
```

而不是会过期的 Recommendation。

---

# 14. Tier-1

`select_tier_one_facts()`：

```text
所有 Constraint
+
最近更新的其他 Fact
```

直到 Config cap。

这些每 Turn 自动进入 Dynamic Context。

---

# 15. 为什么 Constraint 优先？

Constraint 漏掉：

```text
可能直接推荐违反用户要求的选项
```

Preference 漏掉：

```text
只是个性化稍差
```

所以优先级不同。

---

# 16. Tier-2 Recall

剩下 Fact 仍在 Store。

Claude 需要：

```text
recall_memories(topic)
```

才查。

例如：

```text
shoe size
wife gift
camping
work travel
```

---

# 17. 为什么不一定要 Vector DB？

参考实现甚至提供简单 Keyword Match。

说明 Memory 设计真正难点不是：

```text
“选 Pinecone 还是 Milvus”
```

而是：

```text
Fact 抽取
Fact Schema
Tiering
Write Policy
Recall Semantics
```

数据量上来后再替换 Search Strategy 即可。

---

# 18. Current Request > Memory

Memory：

```text
喜欢黑色
```

今天：

```text
我要白色
```

今天请求直接覆盖默认偏好。

记忆是 Default，不是宿命。

---

# 19. Correction

用户：

```text
“我鞋码不是 42，是 43”
```

应：

```text
复用 shoe_size key
→ 新 value 覆盖旧 value
```

而不是新增多个相互矛盾 Fact。

---

# 20. Forget 的权限边界

Agent Memory Tool 能管理的 Fact 和 Backend Profile 不一定一样。

例如 Profile 权威字段需要：

```text
App Settings
```

Agent 不应该假装：

```text
“我已经删除了你的所有资料”
```

如果它实际没有权限。

---

# 21. `source_session_id`

每条 Fact 可以记录来源 Session Tag。

意义：

```text
可追踪这条 Fact 是在哪个过去 Session 写入
```

如果某个 Session 被 Prompt Injection 污染，也能追踪它可能写入的 Memory。

这是 Memory Provenance。

---

# 22. Purge Generation

这是一个很高级的并发设计。

场景：

```text
Memory Extraction 模型正在跑
↓
用户此时执行 clear memory
↓
Extraction 稍后返回
```

如果直接 Upsert：

```text
刚清空的 Memory 又被旧 Extraction 写回来
```

所以：

```text
Extraction 前记 generation
Extraction 后再检查
```

如果中间发生 Purge：

```text
丢弃这批候选 Fact
```

---

# 23. Retention

Config：

```text
memory_retention_days
```

过旧事实：

```text
不再自动注入
也不 Recall
```

长期记忆可以有明确生命周期，而不是默认永久保存。

---

# 24. 完整读写链路

### Read

```text
MemoryStore
↓
tier_one
↓
_prefetch
↓
Dynamic Context
↓
Claude
```

不够：

```text
Claude
↓
recall_memories(topic)
↓
MemoryStore.search_facts
↓
Tool Result
```

### Write

```text
User explicit remember
↓
save_memory
↓
validate_fact
↓
MemoryStore.upsert
```

或：

```text
Turn Complete
↓
update_memory
↓
Extraction Model
↓
validate_fact
↓
upsert
```

---

## 本章检查点

1. Memory 为什么不是 Chat History？
2. 为什么 Fact 要有 key/category？
3. Tier-1 与 Recall 分别解决什么？
4. Constraint 为什么优先？
5. 为什么 Memory 不一定需要 Vector DB？
6. `source_session_id` 有什么意义？
7. Purge Generation 解决什么竞态？
8. 为什么自动 Extraction 最好在主 Turn 后做？
