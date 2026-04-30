# CareerOps Pro — Post-v2 Feature Roadmap

记录 Resume Editor v2 之后想做的高级功能。**不在 v2 范围内**，但 v2 架构需要为这些功能留好接口。

> 来源：用户在 2026-04-26 brainstorming 中提出的产品方向，定位是"显得专业的 CareerOps 风格"。

---

## 1. 真正的所见即所得 PDF 编辑器
**说明**：页面就是最终 PDF，分页 / 字体 / 间距 / 导出完全一致。
**状态**：✅ **v2 本身就是这个功能**，是其他高级功能的底座。

## 2. Smart Fit — 一键压缩 / 展开到目标页数
**说明**：
- "一键压到 1 页" / "保持 2 页但更松弛"
- 自动调整 bullet 长度、section 间距、字体密度
- 改完告诉用户改了什么（diff）

**对 v2 架构的依赖**：
- 必须能精确知道当前页数 → v2 的真分页提供
- 必须能批量调整 bullet 文本 → 每个 bullet 是稳定 React 组件 ✓
- 需要"调整→重排版→再测量页数"的循环 → v2 的 pagination 算法可以反复跑

## 3. JD 匹配热力图
**说明**：
- 用户贴 job description
- 简历右侧显示哪些 bullet 覆盖了哪些要求
- 哪些关键词缺失
- 哪些经历最应该前置

**对 v2 架构的依赖**：
- 每个 bullet 上方 / 旁边要叠加 highlight overlay → v2 的 absolute overlay 机制 ✓
- bullet 必须有稳定 ID → v2 用 stable React keys ✓

## 4. Recruiter 30 秒扫描模拟
**说明**：模拟 HR / 招聘经理 30 秒看简历后的印象 —— 定位是否清楚、最大亮点是什么、疑虑、可能问的面试题。
**对 v2 架构的依赖**：独立功能，AI 调用，不影响编辑器。

## 5. Bullet 质量诊断
**说明**：每条 bullet 显示问题标签（太泛 / 缺 metric / 缺动作 / 结果不清 / 和目标岗位无关）+ 针对性改写。
**对 v2 架构的依赖**：每个 bullet 旁边出现诊断标签 → v2 的 absolute overlay ✓

## 6. 角色版本管理
**说明**：
- 同一份 master resume 生成 SWE / PM / Data / Founder / Research 等版本
- 支持 diff（这个版本相比 master 改了哪些 bullet）

**对 v2 架构的依赖**：
- 当前 v1 已有 variant 机制
- v2 不需要额外做什么，未来加 diff UI 即可

## 7. Evidence Vault / Master Profile
**说明**：用户维护事实库（项目 / 经历 / 数据 / 奖项 / 技能），AI 改写只能引用事实库，避免胡编。
**对 v2 架构的依赖**：独立的数据存储，对编辑器影响小。但 AI 工具调用要 wire 到 vault。

## 8. ATS + 人类阅读双评分
**说明**：
- ATS 评分（关键词、结构）
- 人类阅读评分（narrative / seniority / impact / clarity）
- 两个分数分开展示

**对 v2 架构的依赖**：独立功能，不影响编辑器。

## 9. 面试风险预测
**说明**：根据简历找潜在追问点（gap / 跳槽 / 项目真实性 / 技术深度 / impact 归因）+ 防守回答。
**对 v2 架构的依赖**：独立功能，对编辑器影响小。

## 10. Export Pack
**说明**：一键导出 PDF / ATS plain text / LinkedIn summary / cover letter / recruiter DM / 文件名规范。
**对 v2 架构的依赖**：
- v2 必须能从 ResumeDocumentCanvas 输出 plain text → renderer 要支持 export mode 之外的 "text-only" mode
- 多种 export format 路由到不同 renderer，编辑器统一来源 ✓

---

## v2 设计含义

为支持上述功能，v2 必须确保：

1. **每个 block（section / entry / bullet）有稳定 React 组件 + 稳定 ID** —— 给热力图、诊断标签、AI 改写定位提供锚点
2. **支持 absolute overlay** —— 给 highlight、diagnostic badge、JD 匹配标记留位置
3. **Pagination 算法可重复运行** —— 给 Smart Fit 的"试调整→看页数"循环用
4. **Renderer 支持多种 mode**：edit / export / text-only / ats-plain
5. **从 schema 直接序列化各种格式**：HTML / PDF / Markdown / plain text

这些都是 v2 应该做的"基础设施投资"，不算扩张范围。
