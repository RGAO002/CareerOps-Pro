# CareerOps Pro — 产品战略笔记

> 这个文件记录产品方向、设计决策和功能规划的讨论结果。
> 做具体功能前先读相关章节。

---

## 一、核心定位

**不要正面对抗 Teal / CareerSwift。**

他们已经有完整功能矩阵，纯靠功能对标是输家策略。

**我们的路径：** 专注北美中国留学生 / 国际学生，做他们专属的深度优化。

### 目标用户画像

- CS / DS / Quant / Business 方向应届生或近期毕业生
- 主要在 NYC、SF、西雅图找工作
- 简历存在"中式英文"问题（语法正确但表达不地道）
- 对 H1B / OPT 身份问题高度焦虑
- 投递量需求比本土学生高 2–3 倍（需要投 150–300 份才能拿到同等面试机会）

---

## 二、技术差异化：多智能体架构

不是一个 AI 分析简历，而是三个角色互相验证：

- **Recruiter Agent**：ATS 关键词、技能匹配、能过初筛吗
- **Hiring Manager Agent**：量化成果、实际能力信号、能做这份工作吗
- **Career Coach Agent**：职业叙事连贯性、个人品牌、故事讲清楚了吗

当三个 Agent 意见一致时，用户更信任建议。
当有分歧时，用户能看到更立体的视角（这是真正的差异化）。

**技术选型：**
- LangChain：单个 LLM 调用封装
- LangGraph：多 Agent 状态机和编排
- LangSmith：可观测性，调试每个 Agent 的推理链

---

## 三、中国留学生专属功能路线图

### 3.1 中式英文检测（最高优先级）

检测语法正确但美国 HR 不会这样说的表达：

```
❌ "Responsible for the development of system"
✅ "Built and shipped X system"

❌ "Have strong ability to work under pressure"
✅ 删掉，用实际经历证明

❌ "Familiar with Python"
✅ "Python (3 years, production use)"
```

**实现路径：**
- v1：规则引擎 + GPT-4o 检测
- v2：用积累的简历数据微调专属模型
- 数据飞轮：用户简历 → 标注 → 训练，越用越准

这个功能 Teal / CareerSwift **永远不会做**，因为他们的用户群不需要它。

### 3.2 H1B Sponsorship 数据集成

数据来源：USCIS 每年公开的 LCA 数据（合法、免费）

在职位卡片上直接标注：
- "这家公司去年 H1B 申请 234 份，通过率 94%"
- "历史上从未 sponsor H1B — 谨慎申请"

用户可以按"H1B 友好"过滤职位。

### 3.3 双语面试准备

- 用中文解释美国面试文化背景（Tell me about yourself 不是真的要你介绍自己）
- 针对中国口音和表达习惯的语气建议
- STAR 格式中英文对照练习

### 3.4 文化翻译层

帮用户理解美国职场隐含规则：
- 简历不写年龄、婚姻状况、照片（中国惯例，美国违法）
- Salary negotiation 文化（可以 counter offer）
- References 怎么准备

---

## 四、简历数据战略

第一屏收简历是数据积累的开始，不只是"帮用户分析"。

### 短期（0–1000 用户）
- 积累数据，人工标注中式英文样本

### 中期（1000–5000 用户）
- 推出匿名 Benchmark 功能：
  "你的简历在我们见过的 NYU CS 应届生里排前 23%"
- 开始做内容营销（技能趋势报告）

### 长期（规模化后）
- 中式英文检测专属模型
- 反向招聘 / 人才池 B2B
  - 用户 opt-in 后，H1B 友好公司可以联系匹配候选人

**注意：**
- 用于聚合分析的数据必须匿名化
- 模型训练需要用户明确授权（注册时加勾选框）
- 给用户删除数据的权利（GDPR / CCPA）

---

## 五、Mock Interview 系统

### 语音引擎选型

| 方案 | 成本/45min | 特点 |
|------|-----------|------|
| OpenAI Realtime API | ~$13 | 最自然，最贵 |
| **Hume EVI** | ~$4 | 专为情绪感知设计，值得深入研究 |
| Gemini Live | ~$6 | 同架构，便宜一半 |
| Deepgram + GPT-4o-mini + Cartesia | ~$2 | Pipeline，延迟 ~600ms，MVP 首选 |

**MVP 推荐：Pipeline 方案**（Deepgram + GPT-4o-mini + Cartesia Sonic）
**中期目标：Hume EVI**，因为"AI 感知到你紧张然后放慢节奏"是真正的差异化

**为什么 Mercor 负担得起：** 他们是 B2B 工具，企业付费 $15–50/次筛选，API 成本不是瓶颈。我们做 C 端工具，成本必须从设计阶段就是约束。

### 三种面试模式

**① 语音行为面试** ✅ 直接可做
- OpenAI Realtime 或 Hume EVI
- 关键：Persona 工程（"你是 Google Senior SWE，风格直接但不 aggressive"）

**② Live Coding** ✅ 最强差异化，大多数竞品没有
- Monaco Editor（VS Code 同款编辑器）
- Judge0 API 运行代码（免费，60+ 语言）
- AI 实时观察代码快照，语音追问
- Coding 阶段强制切文字模式，降低 API 成本

**③ System Design** ✅
- v1：纯语音描述
- v2：集成 tldraw 白板 + Vision API 看图

### 虚拟面试官形象

**短期：** 不做，先跑通语音体验
**中期：Ready Player Me + Three.js**（推荐，理由：）
- 免费，完全可控
- 风格化角色避开恐怖谷
- 可以做成 CareerOps 专属角色，成为品牌记忆点
- Web Audio API 驱动口型，Mixamo 提供免费动画库

不推荐：
- Simli（偏生硬）
- Tavus（太贵，$0.30/min）
- HeyGen Streaming（如果需要快速 demo 可用）

---

## 六、主动推送 / Nudge 系统

将产品从"被动工具"变成"主动助理"。

### 触发场景

**来自简历库的洞察：**
- "你保存的 143 个职位里，82% 提到 Python，但你的简历没有 → 要加吗？"
- "最近 3 周新增职位里，System Design 提及频率上升了 40%"

**来自求职进度：**
- "你有 12 个职位保存超过 30 天了，还没投"
- "Amazon SDE 的申请截止日期快到了"

**来自外部数据变化：**
- "Stripe 刚开了 3 个 NYC SWE 岗位，匹配度 91%"
- "你关注的 Google 今年 H1B 通过率从 89% 升到 94%"

### 实现原则
- 每天最多推 3 条，宁可少推
- 每类提醒不超过每周一次
- 优先考虑微信渠道（中国留学生看微信频率远高于 email）
- One-click action：email 里的按钮直接带 token，不用登录就能完成决定

---

## 七、Job Search & 自动海投

### 立场：不做全自动，做"1-click 辅助投递"

**全自动海投的问题：**
- ATS（Workday / Greenhouse / Lever）有 bot 检测，静默丢弃
- LinkedIn 封号
- 法律上是 ToS 违约
- 用户投了什么都不知道，面试了也答不上

**1-click 辅助投递（我们要做的）：**
```
用户保存职位
    ↓
AI 自动准备：裁剪简历 + 写 Cover Letter + 填好表单字段
    ↓
用户看预览："这是你的申请，确认发送？"
    ↓
用户点 [Submit] → 真正提交
```

### 职位数据来源

| 来源 | 内容 | 方式 |
|------|------|------|
| SerpAPI (Google Jobs) | 全网职位聚合 | $50/月，合法 |
| USCIS LCA 数据库 | H1B sponsorship 历史 | 免费，官方公开 |
| 公司 Career Page 直抓 | FAANG 等大厂职位 | 合法，无中间商 |
| LinkedIn | ❌ ToS 不允许 | — |

### 对中国留学生的特别设计

投递队列默认过滤：
- ✅ H1B 通过率 > 80% 的公司
- ✅ 过去 2 年有中国留学生入职记录（从面经推断）
- ❌ 过滤掉从未 sponsor 过的公司

**核心痛点：Workday 反复填写相同信息**
用户 profile 存好后，检测到 Workday 表单自动填写所有字段，用户只需确认。
光这一个功能就值得付费。

---

## 八、一亩三分地整合策略

一亩三分地：有数据没产品；CareerOps：有产品没数据。天然互补。

### 不做：直接爬取
- 大部分内容需要登录 + 积分
- 有 Cloudflare 防护
- ToS 违约风险

### 做：用户主动粘贴面经
短期最可行：让用户把一亩三分地的面经帖子粘贴进来，AI 提取结构化信息，帮用户针对性准备。合法，积累自己的数据集。

### 面经数据的产品价值
```
用户输入：Google / SWE L4 / 2025
输出：
- 高频题目 Top 10（按最近面经统计）
- 面试轮次结构
- 题目类型分布（算法 60% / System Design 30% / BQ 10%）
- 最近 3 个月通过率
```

### 中期：联系合作
切入点：帮他们把非结构化面经变成结构化产品，共同分成。

---

## 九、Insights 页（行业情报）

**不做通用科技新闻**（LinkedIn 已经做了）。

**做：和用户求职路径直接挂钩的情报：**

```
📌 Signals for you  （基于偏好：NYC SWE · H1B）

⚠ Google 本周暂停 H1B 新申请       → 你保存的 3 个职位受影响
✓ Stripe NYC 刚开放 2025 春季校招   → 匹配度 91%
📋 USCIS 宣布 2026 H1B 抽签规则变更 → 摘要 ↓
📉 Meta 工程部门本季度 HC 缩减 15%  → 可能影响面试时间线
```

每一条都能触发一个行动。

**数据源：** USCIS RSS + NewsAPI（关键词过滤）+ 公司 IR 页面

**放置位置：** Insights 页（侧边栏已有入口），不放在主 Dashboard

---

## 十、Dashboard 设计哲学

**是行动计划，不是数据仪表板。**

**反模式（不做）：**
- ❌ 大号分数作为主视觉（制造焦虑）
- ❌ 纯数据图表（冷冰冰）
- ❌ 把"问题"列成缺陷清单（打击用户）

**我们做的：**
- ✅ 首屏鼓励性语言："Looking good."
- ✅ 三个 Agent 的发现 → "你的 AI 团队发现了..."
- ✅ 推荐行动按优先级排列，标注哪个 Agent 建议
- ✅ 细节分析默认折叠

**降低焦虑 > 展示功能**，对中国留学生用户尤为重要。

---

## 十一、已完成的功能

- [x] Next.js 基础设施 + 设计系统（暖色 terracotta + Apple 精度）
- [x] Landing Page（暖色左侧 + 深色右侧 FluidCanvas WebGL）
- [x] ProductSimulation 动画（phase 状态机）
- [x] Dashboard v1（mock data，5 个区块）
- [x] AI Chat Panel（右侧抽屉，FluidCanvas 背景，mock 对话）
- [x] Preferences Drawer（用户偏好，localStorage 持久化，注入 system prompt）

## 十二、待做功能（优先级排序）

1. **中式英文检测 v1**（规则 + LLM 混合）
2. **后端 API 端点**（替换 Streamlit 直接调用）
3. **Dashboard 接真实数据**
4. **LangGraph 多 Agent 编排**
5. **AI Chat Panel 接真实 API**（后端 /chat endpoint）
6. **H1B 数据集成**
7. **SerpAPI 职位搜索**
8. **Mock Interview v1**（Pipeline 语音 + Live Coding）
9. **Insights 页**
10. **主动推送 / Nudge 系统**
11. **1-click 辅助投递**
12. **Ready Player Me 虚拟面试官**（中期）
