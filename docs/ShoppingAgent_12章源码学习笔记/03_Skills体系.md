> 学习对象：Anthropic `commerce-agents` / `shopping-agent`  
> 基于：2026-09-04 阅读的 `main` 分支  
> 学习模式：源码定位 → 核心对象 → 调用链 → 具体例子 → 为什么这样设计 → 可迁移经验  
> 仓库：https://github.com/anthropics/commerce-agents


# 第 3 章：Skills——按需加载的任务 SOP

核心思想：

> **Skill 不是 Tool，也不是 Sub-Agent，而是按需加载的 Task SOP。**

源码：
- https://github.com/anthropics/commerce-agents/blob/main/commerce-common/commerce_common/skills.py
- https://github.com/anthropics/commerce-agents/tree/main/shopping-agent/skills

---

# 1. 五个 Skills

```text
search-discovery
purchase-research
planning-goals
customer-care
memory-personalization
```

仍然只有一个主 Shopping Agent。

---

# 2. 完整链路

```text
SKILL.md
↓
parse_skill_md()
↓
Skill(name, description, body)
↓
SkillRegistry
↓
index_block()
↓
Static Prompt
↓
Claude 判断匹配哪个 Flow
↓
load_skill(name)
↓
BaseToolExecutor
↓
get_instructions(name)
↓
Skill Body 作为 Tool Result
↓
Claude 按 SOP 继续
```

---

# 3. SKILL.md 格式

```markdown
---
name: planning-goals
description: ...
---

# Planning toward a goal
...
```

解析后：

```python
Skill(
  name,
  description,
  body
)
```

职责：

```text
name        = 唯一 ID
description = 什么时候用
body        = 用了以后怎么做
```

---

# 4. Description 就是 Semantic Router

没有硬编码：

```python
if intent == "planning":
```

而是把 Description 暴露给 Claude，让模型根据语义选择。

好的 Skill Description 必须写：

```text
什么时候用
什么时候不用
和相邻 Skill 的边界
```

而不是：

```text
“Helps users shop.”
```

---

# 5. SkillRegistry 很轻

关键：

```python
index_block()
get_instructions(name)
```

`index_block()` 只渲染：

```text
- `name` — description
```

并按 name 排序，从而保持 Static Prompt bytes 稳定，利于 Cache。

---

# 6. 为什么不把 Skill Body 全部放 Prompt？

假设未来有 30 个 Skill：

```text
全部常驻 Prompt
→ Token 爆炸
```

所以：

```text
Skill Index = 常驻目录
Skill Body  = 按需读文件
```

可以类比：

```text
Context = RAM
SKILL.md = Disk
load_skill = read()
```

这是一种 Context Virtualization / Progressive Disclosure。

---

# 7. load_skill 也是 Tool

`load_skill` 的 `skill_name` 使用 enum 限制为已安装 Skill。

因此模型不能加载不存在或任意路径内容。

当 Claude 调：

```text
load_skill(planning-goals)
```

Executor：

```text
SkillRegistry.get_instructions()
```

返回完整 Body。

注意：它不会改 System Prompt，只是形成一个普通 Tool Result，进入当前 Conversation。

---

# 8. 为什么 Skill 不是 Sub-Agent？

Skill：

```text
同一个 Claude
同一个 Messages
同一个 Runtime
只是加载一份新 SOP
```

Sub-Agent：

```text
新上下文
新执行任务
独立 Runtime/Loop
结果再返主 Agent
```

所以：

```text
Skill = Instruction Extension
Sub-Agent = Independent Execution Unit
```

---

# 9. Skill / Tool / Gate

记住：

```text
Skill = 这种任务怎么做
Tool  = 系统能做什么
Gate  = 某动作绝对不能如何越界
```

例如：

```text
规划整套露营装备 → Skill
search_products  → Tool
购物数量上限     → Gate
```

---

# 10. search-discovery

适合：

```text
用户已有大致需求
需要从多个 Constraint 形成 shortlist
```

例如：

```text
“1000 以内、宽脚、日常慢跑”
```

流程：

```text
提取约束
↓
改写为 Catalog vocabulary
↓
Search by default
↓
3~6 Options
↓
推荐一个
↓
必要时 Details / Comparison
```

特别强调：不要把用户刚说的条件再复述一遍，让 Search Result 体现理解。

### Search First

预算/颜色等缺失不一定先问。只有缺一个信息导致 Search 无法执行时才先问。

### Distinct item → Distinct search

```text
帐篷 + 睡袋 + 灯
```

同一 Round 三个 Search，而不是一个大 Query 或三轮串行。

---

# 11. purchase-research

适合：

```text
“我还不知道怎么选这一类东西”
```

边界：

```text
不知道怎么选
→ purchase-research

知道需求，帮我找
→ search-discovery
```

### Intake 一次

如果用途、人数、硬预算都没给，可以一次问 2~3 个短问题。

但任何回复都结束 Intake：

```text
回答了
“随便你先推荐”
用户反问
```

都不能继续问十轮。

剩下缺失项作为明确 Assumption 进入研究。

### 多源 Grounding

可以并行：

```text
search_policies → Store Buying Guide
search_products → 当前 Catalog
web_search      → Category 通用知识
```

边界：

```text
Web = Criteria / terminology / trade-off
Catalog = Specific product truth
```

---

# 12. planning-goals

适合：

```text
多个购买项一起完成一个 Goal
```

比如：

```text
两个人第一次露营
六人办公室设备
旅行行程
```

核心：

```text
先定 Plan Structure
再挂 Products
```

### 五个 framing facts

```text
goal / who / where / when / budget
```

缺失项使用 round-number assumption，让用户容易纠正。

### 3~8 Steps

按用户真正工作的维度拆：

```text
day / person / room / phase
```

不是按 Catalog taxonomy。

### 每 Step 独立 Search，同一 Round

默认：

```text
1 pick / step
```

只有真正 trade-off 才给第二项。

### Local Plan Editing

用户：

```text
“第二项换便宜一点，其他不变”
```

只改第二 Step，其他计划和之前用户编辑全部保留。

---

# 13. customer-care

适合 Post-purchase：

```text
订单状态
晚到
退货
退款
损坏
取消
Store Terms
```

事实顺序：

```text
Order Record
↓
Policy
↓
Next Step
```

不能编业务权益：

```text
“给你 20 美元补偿”
```

除非 Policy 明确提供。

这个 Flow 本身主要是 Read。取消、退款、改地址、资金移动等真正写操作交给 App Support Flow。

---

# 14. memory-personalization

适合：

```text
记住
回忆
纠正
应用旧偏好
询问“你记得什么”
```

两层来源：

```text
Tier-1/Profile
→ 已在 Context，不必再查

Older/Specific facts
→ recall_memories(topic)
```

### Recall 不是为了显得个性化

只有旧事实真的会改变 Picks 才 Recall。

### Current Request > Memory

Memory 喜欢黑色，但今天用户要白色：直接白色，不必尴尬提醒冲突。

### Preference 作用在 Picks，不要总写在 Prose

知道用户偏轻量：

```text
优先展示轻量商品
```

比每次说“我记得你喜欢轻量”更自然。

### 保存 Need，不保存 Recommendation

正确：

```text
lodging_needs:
work trips need kitchen + walkable location
```

错误：

```text
liked_hotel:
Hotel A $199
```

Memory 应保存 Durable Semantics。

---

# 15. 五个 Skill 的完整用户旅程

```text
不知道怎么买
→ purchase-research

已经知道需求，帮我找
→ search-discovery

需要完成整体目标
→ planning-goals

买完出现问题
→ customer-care

跨会话个性化
→ memory-personalization
```

---

# 16. Skill Body 应该写 Procedure，不写百科

应该写：

```text
什么时候问
先调用哪些 Read
怎么 Retry
怎么比较
怎么展示
什么时候结束
```

不应该只是：

```text
某商品类别的知识百科
```

---

# 17. 哪些东西绝不能只写 Skill？

例如：

```text
数量上限
权限
Provenance
支付边界
```

都是 Hard Invariant，必须写 Code Gate/Backend。

经验：

```text
Heuristic / Procedure → Skill
Invariant / Security  → Code
```

---

# 18. 一个 planning 请求走一遍

用户：

```text
“两个人第一次露营，预算 600，配全套”
```

Round 1 Claude：

```text
load_skill(planning-goals)
search tent
search sleeping
search cooking
search lighting
```

Executor 同时返回：

```text
Planning SOP
+ Search Results
```

Round 2 Claude 按 Skill：

```text
3~8 Steps
预算分配
每 Step pick
```

最后：

```text
present_plan
```

全程仍然是一个主 Agent。

---

## 本章检查点

1. Skill 为什么不是 Sub-Agent？
2. `description` 与 `body` 分别负责什么？
3. 为什么 Index 常驻而 Body 延迟加载？
4. Skill 什么时候比固定 Workflow 更合适？
5. 哪些规则必须放 Gate？
6. `purchase-research` 与 `search-discovery` 怎么区分？
7. `planning-goals` 为什么先定 Step 后挂 Product？
