# Resume Editor v2 — Design Spec

**Goal**: 重写 Resume Editor，使**编辑器视图、`/print` 浏览器视图、导出的 PDF 在像素级一致**。砍掉所有"两套 renderer"的设计：编辑器自己就是最终 PDF renderer，导出只是把这个 renderer 用 Chromium 打成 PDF。

**Architecture**: 单一 React 组件 `ResumeDocumentCanvas` 同时服务编辑和导出两个 mode。模板感知（template-aware）的 layout engine 计算每个 atom 的页内坐标。全局 absolute-positioned `AtomLayer` + 独立 `InteractionLayer`（仅编辑模式）。Per-field TipTap 实例处理可编辑文本，store 立即 commit + IME-aware 重排版。

**Tech Stack**: TipTap (per-field, full StarterKit + custom extensions) · Zustand (`subscribeWithSelector` middleware) · React 19 + Next.js 16 (App Router) · Playwright + headless Chromium for PDF · Vitest + happy-dom (unit/integration) · Playwright (visual e2e).

**Effort**: 10-13 工程日 + 1-2 天 buffer。Hard cutover：v2 完工后 v1 文件保留 1 周作 fallback，再独立 commit 删除。

---

## 0. 范围 + 决策记录

### 0.1 IN scope（v2）

1. Page-native 编辑器（编辑器 = 最终 PDF）
2. Notion 风格交互全套：
   - Slash 命令（Add bullet / entry / section heading）
   - Markdown 输入规则（`**` `*` `[]()`）
   - Drag-to-reorder（section / entry / bullet）
   - Hover block menu（⋮⋮ 把手 + + / ×）
   - Floating bubble menu（B / I / Link）
   - 多块选中（Shift+Click / Cmd+Click / 拖选）+ Backspace / Cmd+D / Cmd+C
   - 跨块文本选中（best-effort copy only）
   - 键盘快捷键（详见 § 3.5）
   - 空 block 占位 hint
3. 真实 page 视觉边界 + page X of Y footer + auto-fit warning（>2 页提示）
4. v2 schema 重设计 + 一次性迁移脚本
5. 模板感知架构（v2 ship `minimal-single-column` 一个）
6. PDF 走 Playwright + Chromium，CSS @page 单一 source

### 0.2 OUT of scope（推 v2.1+）

- Two-column / sidebar 模板（架构留接口）
- 跨 atom 文本删除 / 剪切 / 粘贴覆盖
- 视觉行检测的 ↑↓ 跨多行
- Slash 的 Add divider（不开 schema）
- 模板切换 UX（只有一个模板）
- AI 工具 v2 adapter（v1 入口在 v2 启动前 inventory，默认隐藏）
- Nested bullet
- 拖拽跨 zoom level 精确定位
- 实时协作

### 0.3 关键决策记录

| 决策 | 选项 | 选定 | 理由 |
|------|------|------|------|
| 范围 | A 对等 / B + drag / C Notion 全套 | **C** | 一次到位 |
| 模板感知 | A 完全 / B 预留 / C 不管 | **A** | 未来加侧边栏不动编辑器 |
| 迁移 | A 硬切换 / B 共存 / C 共存默认 v2 | **A** | 单用户、无外部用户、回退靠 git |
| TipTap 角色 | A 全 TipTap / B 混合 / C 全 contentEditable | **A** | IME 安全为先 |
| Schema | A 加字段 / B 重设计 / C 兼容+重设计 | **B** | 单用户、借机理顺 |
| 渲染层 | A flex per page / B-page absolute / B-global | **B-global** | 真 DOM 稳定，不需要 capture/restore |

---

## 1. 高层架构

### 1.1 组件树

```
ResumeJSON (v2 schema)
        │
        ├──→ /resume/[id]              (Client Component, 挂 ResumeStore)
        │     └─→ ResumeDocumentCanvas mode="edit"
        │
        └──→ /resume/[id]/print        (Server Component fetch → Client Canvas)
              └─→ ResumeDocumentCanvas mode="export"

ResumeDocumentCanvas
  ├── normalizeTemplate(config) → NormalizedTemplate (px-only)
  ├── projectAtoms(resume) → LayoutAtom[]
  ├── useLayoutEngine() → { layout, ready }
  └── render:
      ├── PrintFlowPlaceholders (撑文档流，Chromium 分页用)
      ├── PageBackgroundLayer    (z=0, 白底 page card)
      ├── AtomContentLayer       (z=1, 唯一正文 DOM)
      │   └── AtomRenderer × N (absolute positioned)
      │       └── 内含 TipTap fields
      └── InteractionLayer       (z=2, edit-only)
          ├── DragHandles
          ├── Selection outlines
          ├── Hover affordances
          ├── Drop indicator
          ├── Drag ghost
          ├── BubbleMenu
          └── SlashMenu
```

### 1.2 数据流（编辑场景）

```
用户按一个键
  │
  ▼ (immediate)
TipTap local state 更新 + DOM 立即反映
  │
  │ TipTap.onUpdate
  ▼ (immediate, no debounce)
checkComposition: composing? → defer until compositionend
  │
  ▼
store.updateBullet(id, content, { origin: { type: 'tiptap', editorId } })
  │
  ├─→ 不进 structural undo stack（TipTap.history 自管 inline undo）
  │
  ├─→ store.subscribe → debounced backend save (1500ms)
  │
  └─→ ResizeObserver(BulletRenderer) fires (高度变了)
        │
        ▼
      LayoutEngine.requestRepaginate()
        │
        ▼ (如果 isComposing → queue, else proceed)
      只 re-measure 受影响的 atoms
        │
        ▼
      paginate() 纯函数 → 新 layout
        │
        ▼
      React re-render（仅改 atom style.top/left，DOM 元素不重建）
        │
        ▼
      data-paginated="false" → fonts.ready → 2× rAF → "true"
```

### 1.3 关键约束（hard constraints）

1. **唯一 renderer**：edit/export 走同一个 `ResumeDocumentCanvas`
2. **mode 不改正文 DOM**：mode 仅切 `editable` 和 `InteractionLayer` 可见性，不改正文 box model
3. **测量层 == 可见层 CSS**：任何 CSS 差异都让分页错
4. **store 立即 commit**：debounce 仅用于 backend save，不用于编辑响应
5. **Source-of-truth 单向**：TipTap → store 写；store → TipTap 仅外部源 + 未 focused
6. **Stable atom IDs**：每个 block 有 UUID，从创建那一刻起
7. **Composition 期间 layout 全局暂停**：不是 per-atom 锁
8. **import 路径切换是唯一接管点**：v2 完工后改 page.tsx 的 import，旧文件留原位

### 1.4 三层 concept 分离

```ts
// 分页单位
type LayoutAtom =
  | { kind: 'header'; sourceBlockId: HeaderId }
  | { kind: 'section-heading'; sourceBlockId: SectionId }
  | { kind: 'entry'; sourceBlockId: EntryId };

// 用户交互单位
type SelectableBlock =
  | { kind: 'section'; id: SectionId }
  | { kind: 'entry'; id: EntryId; sectionId: SectionId }
  | { kind: 'bullet'; id: BulletId; entryId: EntryId };

// TipTap 实例单位
type EditableField =
  | { kind: 'header.name' }
  | { kind: 'header.contact'; index: number }
  | { kind: 'section.heading'; id: SectionId }
  | { kind: 'entry.title'; id: EntryId }
  | { kind: 'entry.meta'; id: EntryId }
  | { kind: 'bullet.content'; id: BulletId };
```

---

## 2. 分页算法

### 2.1 LayoutAtom 类型 + keep-with-next

| Atom | 来源 | break-inside | keepWithNext |
|------|------|-------------|--------------|
| HeaderAtom | resume.header | ❌ 永不撕开 | false |
| SectionHeadingAtom | section.heading（独立 atom，与 entries 分开）| ❌ | **true** |
| EntryAtom | section.entries[i]（含 title + meta + bullets） | ❌（v2 MVP）| false |

**SectionHeadingAtom 与 entries 分开**：让 section 的多个 entry 可以分到不同页（heading + 前 N entry 在 page 1，剩余 entry 在 page 2）。

**keepWithNext** 规则：SectionHeadingAtom 必须和它后面紧邻的下一个 atom 一起放（防止页底孤立标题）。

### 2.2 算法（纯函数）

```ts
function paginate(
  atoms: LayoutAtom[],
  measuredHeights: Map<AtomId, number>,
  template: NormalizedTemplate,
): { atomLayouts: Map<AtomId, AtomLayout>; pageCount: number } {
  const contentHeight = template.page.contentHeightPx;
  const gap = template.atom.gapPx;

  const result = new Map<AtomId, AtomLayout>();
  let pageIdx = 0;
  let cursorY = 0;
  let i = 0;

  while (i < atoms.length) {
    // 1. 构建 keep-with-next chain
    const chain: LayoutAtom[] = [atoms[i]];
    let j = i;
    while (atoms[j].keepWithNext && j + 1 < atoms.length) {
      chain.push(atoms[j + 1]);
      j++;
    }
    const chainHeight = chain.reduce(
      (sum, a) => sum + measuredHeights.get(a.id)!, 0
    ) + (chain.length - 1) * gap;

    const wouldUse = currentHeight => currentHeight + chainHeight + (currentHeight > 0 ? gap : 0);

    if (wouldUse(cursorY) <= contentHeight) {
      // 装得下
      const startY = cursorY === 0 ? 0 : cursorY + gap;
      let y = startY;
      for (const atom of chain) {
        result.set(atom.id, {
          pageIndex: pageIdx,
          xWithinPage: 0,
          yWithinPage: y,
          width: template.page.contentWidthPx,
          height: measuredHeights.get(atom.id)!,
        });
        y += measuredHeights.get(atom.id)! + gap;
      }
      cursorY = y - gap;
      i += chain.length;
    } else if (cursorY === 0) {
      // 单 chain 比一页还高（防御性，简历正常不发生）→ 接受溢出
      let y = 0;
      for (const atom of chain) {
        result.set(atom.id, {
          pageIndex: pageIdx,
          xWithinPage: 0,
          yWithinPage: y,
          width: template.page.contentWidthPx,
          height: measuredHeights.get(atom.id)!,
        });
        y += measuredHeights.get(atom.id)! + gap;
      }
      pageIdx++; cursorY = 0;
      i += chain.length;
    } else {
      // 翻页重试（不增 i）
      pageIdx++; cursorY = 0;
    }
  }

  return { atomLayouts: result, pageCount: pageIdx + 1 };
}
```

### 2.3 五阶段管线

```
Phase 1: MEASUREMENT RENDER
  - Render <MeasurementLayer>（visibility: hidden, position: absolute, top: -10000px）
  - 所有 atoms 单列渲染，width = contentWidthPx
  - **必须用和可见 atom 完全相同的 CSS、相同的 AtomRenderer 组件**
  - data-paginated="false"

Phase 2: MEASURE
  - 遍历 MeasurementLayer 内每个 atom，getBoundingClientRect().height
  - 跳过未变化的 atom（复用上一轮高度）
  - 写入 measuredHeights map

Phase 3: COMPUTE
  - 调用 paginate(atoms, measuredHeights, template) 纯函数
  - setLayout(result)

Phase 4: VISIBLE RENDER
  - React 按新 layout 渲染 atom 的 absolute 坐标
  - DOM 元素不重建（key 稳定 + 同一 parent）

Phase 5: READY
  - useEffect: await fonts.ready → 2× requestAnimationFrame
  - document.body.dataset.paginated = "true"
```

每次 repaginate 流程开头先 set "false"，结尾走 markPaginated() 才 set "true"。

### 2.4 重排版触发

ResizeObserver 通过 callback ref registry 绑定每个可见 atom：

```ts
class AtomElementRegistry {
  private observer: ResizeObserver;
  private elements = new Map<AtomId, HTMLElement>();

  register(atomId: AtomId, el: HTMLElement | null) {
    const old = this.elements.get(atomId);
    if (old) this.observer.unobserve(old);
    if (el) {
      this.elements.set(atomId, el);
      this.observer.observe(el);
    } else {
      this.elements.delete(atomId);
    }
  }
}
```

每个 AtomRenderer 用 `ref={el => registry.register(atom.id, el)}` 注册。React 不论 mount/unmount 还是元素移动，registry 都跟得上。

ResizeObserver fire → `layoutEngine.requestRepaginate()` → 检查 compositionLock → 跑或排队。

### 2.5 几何 hard constraints

```ts
// frontend/src/components/resume/v2/tokens/layout-tokens.ts
export const PAGE = {
  WIDTH: '8.5in',
  HEIGHT: '11in',
  MARGIN: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' },
  // 派生（编译时算）
  WIDTH_PX: 816,
  HEIGHT_PX: 1056,
  CONTENT_WIDTH_PX: 643,   // 8.5 - 1.8
  CONTENT_HEIGHT_PX: 912,  // 11 - 1.5
} as const;

export const ATOM = {
  GAP_PX: 12,
} as const;

export const SCREEN_GAP_PX = 16;  // 编辑模式 page 之间的灰色 gap
export const PRINT_GAP_PX = 0;     // PDF 不能有
```

CSS 通过 CSS custom property 共享：

```css
:root {
  --page-content-height-px: 912;
  --atom-gap-px: 12;
}
```

**禁止 atom 容器使用外部 margin**（用 page container 的 gap 代替）：

```css
[data-atom-content] {
  margin: 0 !important;
}
[data-atom-content-inner] {
  display: flex;
  flex-direction: column;
  /* 间距通过 gap 或 padding，不通过 margin */
}
```

测试 guard：unit / integration test 检查所有 atom 的 computed margin === "0px"。

---

## 3. TipTap 整合 + IME + 跨 atom 导航

### 3.1 TipTap 配置矩阵

| 字段 | TipTap 类型 | 扩展（base） | 扩展（edit-only） |
|------|-----------|------------|-----------------|
| header.name | single-line plain | Document, Text, NoNewline | History |
| header.contact_lines[] | single-line + link | Document, Text, Link, NoNewline | History |
| section.heading | single-line plain | Document, Text, NoNewline | History |
| entry.title | single-line plain | Document, Text, NoNewline | History |
| entry.meta | single-line plain | Document, Text, NoNewline | History |
| bullet.content | multi-line + marks | Document, Paragraph, Text, Bold, Italic, Link | History, AtomKeyboardNav, SlashCommand, MarkdownInputRules |

**Why TipTap for single-line（不用 `<input>`）**：
- 中文 IME composition 处理一致
- 全字段统一架构
- 未来加 inline mark 不用换底层

`NoNewline` 是 v2 自定义扩展：单行字段拦截 Enter 触发 `focusNextField()`。

### 3.2 实例数（你那份简历）

≈ 1 (name) + 4 (contact) + 5 (headings) + 10 (titles) + 10 (metas) + 30 (bullets) ≈ **60 个**。

内存：~50KB × 60 = ~3MB，现代浏览器无感。

### 3.3 Source-of-Truth 方向控制（hard constraints）

```ts
// 1. setContent 必须 emitUpdate: false
editor.commands.setContent(newContent, false);

// 2. Store update 携带 origin（含 editorId 防混淆）
type StoreUpdate = {
  bulletId: BulletId;
  content: BulletContent;
  origin: {
    type: 'tiptap' | 'ai-rewrite' | 'undo' | 'drag-reorder' | 'load' | 'remote';
    editorId?: EditorId;        // TipTap 实例唯一 ID
    transactionId: TransactionId; // 全局递增
  };
  version: number;
};

// 3. listener 用 originEditorId 精确判断"是不是自己写的"
useEffect(() => {
  if (!editor) return;
  return useResumeStore.subscribe(
    s => s.bullets[bulletId],
    (newBullet) => {
      if (newBullet.origin.editorId === editor.options.editorId) return;  // 自己的 commit 反弹
      if (editor.view.composing) {
        setPendingUpdate(newBullet.content);  // composition 中排队
        return;
      }
      if (editor.isFocused) {
        setPendingUpdate(newBullet.content);  // focused 排队 + UI toast
        showAtomToast(`Updated externally — refresh to see`);
        return;
      }
      editor.commands.setContent(newBullet.content, false);
    }
  );
}, [editor, bulletId]);

editor.on('blur', () => {
  if (pendingUpdate) {
    editor.commands.setContent(pendingUpdate, false);
    setPendingUpdate(null);
    dismissAtomToast();
  }
});

// 4. Zustand store 配置必须 subscribeWithSelector middleware
const useResumeStore = create(
  subscribeWithSelector((set, get) => ({ ... }))
);
```

### 3.4 IME 处理

走 ProseMirror DOM events（不用 `editor.on()`）：

```ts
const editor = useEditor({
  editorProps: {
    handleDOMEvents: {
      compositionstart: () => {
        layoutEngine.compositionBegin(editor.options.editorId);
        return false;
      },
      compositionend: () => {
        layoutEngine.compositionEnd(editor.options.editorId);
        return false;
      },
    },
  },
});
```

LayoutEngine 全局 compositionLock：

```ts
class LayoutEngine {
  private composingEditors = new Set<EditorId>();
  private pendingRequests = 0;

  compositionBegin(id: EditorId) { this.composingEditors.add(id); }

  compositionEnd(id: EditorId) {
    this.composingEditors.delete(id);
    if (this.composingEditors.size === 0 && this.pendingRequests > 0) {
      this.pendingRequests = 0;
      this.repaginate();
    }
  }

  requestRepaginate() {
    if (this.composingEditors.size > 0) {
      this.pendingRequests++;
      return;
    }
    this.repaginate();
  }
}
```

期间合成中的 atom 可能视觉溢出当前页（接受这个 transient 状态）。compositionend 后立即重排版到位。

### 3.5 键盘导航（MVP 集）

| 按键 | 上下文 | 行为 |
|------|------|------|
| Enter | bullet 内 | `insertBulletAfter`（不再插入换行）|
| Shift+Enter | bullet 内 | `insertHardBreak`（真要换行用这个）|
| Cmd+Enter | bullet 内 | 同 Enter |
| Backspace | bullet 开头 | `mergeWithPreviousBullet` |
| ArrowUp | bullet 文档开头 | `focusPreviousAtomField` |
| ArrowDown | bullet 文档末尾 | `focusNextAtomField` |
| Enter | 单行字段（title/meta/heading/name）| `focusNextAtomField` |
| ArrowUp/Down | 单行字段（任何位置）| `focusPreviousAtomField` / `focusNextAtomField` |
| ArrowLeft 开头 / ArrowRight 末尾 | 单行字段 | `focusPreviousAtomField` / `focusNextAtomField` |

**视觉行检测**（多行 bullet 中间按 ArrowDown 是否真在最后一行）**推迟到 v2.1**。v2 多行 bullet 中间按 ArrowDown 让 ProseMirror 默认处理（不跳 atom）。

### 3.6 Undo / Redo 路由

```ts
window.addEventListener('keydown', (e) => {
  if (!isEditorScopeActive(e.target)) return;

  const isUndo = (e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey;
  const isRedo = (e.metaKey || e.ctrlKey) && (e.shiftKey && e.key === 'z' || e.key === 'y');

  if (isUndo) {
    e.preventDefault();
    const focused = atomFocusManager.currentEditor();
    if (focused && focused.can().undo()) focused.commands.undo();
    else useResumeStore.getState().undo();
  }
  if (isRedo) { /* mirror */ }
});
```

Store undo stack 仅 push 结构性操作（insertBlock / deleteBlock / moveSection / moveEntry / moveBullet / setTemplate）。文本 / mark 编辑全部走 TipTap.history。

### 3.7 自定义扩展清单

| 扩展 | 作用 | 估时 |
|------|------|------|
| NoNewline | 单行字段拦截 Enter → focusNextField | 0.5h |
| AtomKeyboardNav | bullet 内 Enter / Backspace / 方向键边界 | 1d |
| SlashCommand | / 弹菜单 + 插入 atom | 0.5d |
| MarkdownInputRules | bullet 内 `**` `*` `[]()` 自动转 mark | 0.3d |

### 3.8 Bubble menu

仅在 bullet field 启用：

```tsx
<BubbleMenu editor={editor}>
  <button onClick={() => editor.chain().focus().toggleBold().run()}>B</button>
  <button onClick={() => editor.chain().focus().toggleItalic().run()}>I</button>
  <button onClick={() => editor.chain().focus().setLink({ href: prompt('URL') }).run()}>🔗</button>
</BubbleMenu>
```

### 3.9 跨 atom selection 不在 Section 3 范围

每个 TipTap field 内的 selection 是 ProseMirror 标准。跨 field/atom 的 selection 由 Section 4 的 SelectionManager 单独建模。

---

## 4. Drag-to-Reorder + 多块选中

### 4.1 渲染层分离（hard constraint）

```
ResumeDocumentRoot
├── PrintFlowPlaceholders  (z=0, 撑文档流)
├── PageBackgroundLayer    (z=0, 白底 page card)
├── AtomContentLayer       (z=1, 唯一正文 DOM)
│   └── AtomRenderer × N (absolute positioned, 内含 TipTap)
└── InteractionLayer       (z=2, edit-only)
    ├── DragHandles (per SelectableBlock)
    ├── Selection outlines
    ├── Hover affordances
    ├── Drop indicator
    ├── Drag ghost
    ├── BubbleMenu portals
    └── SlashMenu portal
```

InteractionLayer 在 export mode 不渲染。AtomContentLayer 在两个 mode 完全相同。

### 4.2 Domain 操作 API

不再有泛 `moveAtom()`。Store actions 按 SelectableBlock 类型：

```ts
store.moveSection(sectionId, beforeSectionId | null);
store.moveEntry(entryId, targetSectionId, indexInSection);
store.moveBullet(bulletId, targetEntryId, indexInEntry);
store.deleteSection(sectionId);
store.deleteEntry(entryId);
store.deleteBullet(bulletId);
store.duplicateSection(sectionId);
store.duplicateEntry(entryId);
store.duplicateBullet(bulletId);
store.insertSection(role, indexOrBefore);
store.insertEntry(sectionId, indexInSection);
store.insertBullet(entryId, indexInEntry);
```

每个 action 接收可选 `origin` 参数；默认 `{ type: 'tiptap' | 'drag-reorder' | ... }`。

### 4.3 DropTarget 集合（schema-aware）

```ts
type DropTarget =
  | { kind: 'section-slot'; insertBeforeSectionId: SectionId | null }
  | { kind: 'entry-slot'; sectionId: SectionId; insertAtIndex: number }
  | { kind: 'bullet-slot'; entryId: EntryId; insertAtIndex: number };

function getDropTargetsFor(draggedBlock: SelectableBlock): DropTarget[] {
  switch (draggedBlock.kind) {
    case 'section': return allSectionSlots();
    case 'entry':   return allEntrySlots();
    case 'bullet':  return allBulletSlots();
  }
}
```

非法间隙不显示 drop indicator。

### 4.4 Pointer drag 实现

不用 HTML5 DnD（跨页 + absolute layout 行为怪）。用 pointer events：

```ts
function startDrag(e: PointerEvent, blockId: BlockId) {
  handleEl.setPointerCapture(e.pointerId);
  const startX = e.clientX, startY = e.clientY;
  const DRAG_THRESHOLD = 5;
  let dragStarted = false;
  let ghost: HTMLElement | null = null;

  function onMove(ev: PointerEvent) {
    if (!dragStarted) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      dragStarted = true;
      ghost = makeDragGhost(blockId);
      document.body.appendChild(ghost);
      document.body.style.cursor = 'grabbing';
    }
    ghost!.style.left = ev.clientX + 'px';
    ghost!.style.top = ev.clientY + 'px';
    if (ev.clientY < 30) scrollUp();
    if (ev.clientY > window.innerHeight - 30) scrollDown();
    highlightNearestDropTarget(ev.clientX, ev.clientY, validDropTargets);
  }

  function onUp(ev: PointerEvent) {
    cleanup();
    if (!dragStarted) return;
    const target = findNearestDropTarget(ev.clientX, ev.clientY, validDropTargets);
    if (target) commitMove(blockId, target);
  }

  function onCancel() { cleanup(); }

  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'Escape') onCancel();
  }

  function cleanup() {
    handleEl.releasePointerCapture(e.pointerId);
    if (ghost) ghost.remove();
    document.body.style.cursor = '';
    clearDropHighlight();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('keydown', onKey);
}

// CSS
.drag-handle { touch-action: none; }
```

### 4.5 Ghost 安全

```ts
function makeDragGhost(blockId: BlockId): HTMLElement {
  const source = document.querySelector(`[data-block-id="${blockId}"]`)!;
  const ghost = source.cloneNode(true) as HTMLElement;
  // strip 所有 contenteditable / 活元素
  ghost.querySelectorAll('[contenteditable]').forEach(el => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
  });
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  Object.assign(ghost.style, {
    position: 'fixed',
    pointerEvents: 'none',
    opacity: '0.7',
    zIndex: '9999',
    width: source.getBoundingClientRect().width + 'px',
  });
  return ghost;
}
```

### 4.6 Block selection

```ts
class SelectionManager {
  state: 'none' | 'tiptap-text' | 'block-selection';
  blockSelection: Set<BlockId>;

  onAtomClick(blockId, e) {
    if (e.target inside contenteditable) return;
    this.state = 'block-selection';
    if (e.shiftKey) this.extendBlockSelection(blockId);
    else if (e.metaKey) this.toggleBlock(blockId);
    else this.selectSingleBlock(blockId);
  }

  onTipTapFocus() {
    if (this.state === 'block-selection') this.clearBlockSelection();
    this.state = 'tiptap-text';
  }
}
```

视觉：选中 block 加 absolute outline (`outline: 2px solid #3b82f6; outline-offset: 4px;`)，不进正文 box。

### 4.7 快捷键 scope

```ts
document.addEventListener('keydown', (e) => {
  if (!isEditorActive(e.target)) return;
  if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
    if (selectionManager.hasBlockSelection()) {
      e.preventDefault();
      duplicateSelectedBlocks();
    }
    // 否则不拦，让浏览器 bookmark 走
  }
  // 同理 Cmd+A, Backspace 等
});
```

### 4.8 Clipboard fallback

```ts
function copyBlocks(blocks: SelectableBlock[]) {
  const plainText = blocks.map(blockToPlainText).join('\n\n');
  const html = blocks.map(blockToHtml).join('');
  const structured = JSON.stringify({
    schema: 'careerops-resume-v2',
    originResumeId: currentResumeId,
    blocks: blocks.map(toSerializable),
  });
  const item = new ClipboardItem({
    'text/plain': new Blob([plainText], { type: 'text/plain' }),
    'text/html': new Blob([html], { type: 'text/html' }),
    'application/x-resume-atoms': new Blob([structured], { type: 'application/x-resume-atoms' }),
  });
  navigator.clipboard.write([item]);
}
```

### 4.9 Cross-atom text selection（best-effort copy only）

浏览器原生支持跨多个 contenteditable 的 selection 视觉。监听 `copy` 事件，从 selection 读取每个 editor 的 fragment 拼接。

**v2 不实现**：跨 atom 的删除、剪切、粘贴覆盖。（v2.1）

---

## 5. 模板系统

### 5.1 数据 vs 代码分离

```ts
// === 可序列化 ===
type TemplateConfig = {
  id: string;
  layoutStrategyId: 'single-column';  // v2.1 加 'two-column-sidebar'
  page: PageSpec;
  theme: TemplateTheme;
  columnMapping?: { [role in SectionRole]?: ColumnId; default: ColumnId };
};

// === 仅代码（前端 registry） ===
const LAYOUT_STRATEGIES: Record<LayoutStrategyId, LayoutStrategy> = {
  'single-column': SingleColumnLayoutStrategy,
};

const TEMPLATES: Record<string, TemplateConfig> = {
  'minimal-single-column': MINIMAL_SINGLE_COLUMN,
};
```

### 5.2 Section role（schema 字段）

```ts
type SectionRole =
  | 'summary' | 'skills' | 'experience' | 'projects'
  | 'education' | 'awards' | 'publications' | 'custom';

type SectionBlock = {
  id: BlockId;
  role: SectionRole;        // 模板按 role 映射列
  heading: string;          // 显示文本（用户可改）
  entries: EntryBlock[];
};
```

迁移脚本按 heading 文本启发式推断 role；用户可通过 section ⋮⋮ 菜单手动改。

### 5.3 NormalizedTemplate（一次 parse）

```ts
type NormalizedTemplate = {
  id: string;
  layoutStrategy: LayoutStrategy;  // 注入好的代码引用
  page: {
    widthPx: number;
    heightPx: number;
    marginPx: { top: number; right: number; bottom: number; left: number };
    contentWidthPx: number;
    contentHeightPx: number;
  };
  atom: { gapPx: number };
  theme: TemplateTheme;
  columnMapping: ResolvedColumnMapping;
};

function normalizeTemplate(config: TemplateConfig): NormalizedTemplate { ... }
```

### 5.4 LayoutStrategy 接口

```ts
interface LayoutStrategy {
  computeLayout(input: {
    atoms: LayoutAtom[];
    measuredHeights: Map<AtomId, number>;
    template: NormalizedTemplate;
  }): { atomLayouts: Map<AtomId, AtomLayout>; pageCount: number };

  describeColumns(template: NormalizedTemplate): ColumnSpec[];
}
```

### 5.5 Template hard constraint

模板可改：CSS、page geometry、atom positioning、装饰背景。
模板不可改：AtomContentLayer DOM 结构、TipTap field DOM、键盘 / drag / selection 行为、schema。

### 5.6 v2 ship 1 个模板

`minimal-single-column`：当前 v1 视觉风格。

模板切换 UX 不在 v2 AC（只有一个模板）。架构 AC 保留：mock TwoColumnLayoutStrategy 的 unit test 验证算法可插拔。

---

## 6. Edit/Export 模式 + PDF 生成

### 6.1 模式定义

```ts
type CanvasMode = 'edit' | 'export';
```

| | edit | export |
|---|------|--------|
| Store mounted | ✓ | ✗ |
| TipTap editable | true | false |
| InteractionLayer rendered | ✓ | ✗ |
| 正文 DOM | 同 | 同 |

### 6.2 路由架构

```
/resume/[id]                       (Client, 挂 ResumeStore)
  → <EditorPage>
  → <ResumeDocumentCanvas mode="edit" />

/resume/[id]/print                 (Server fetch → Client renderer)
  → page.tsx (Server Component): fetch resume JSON
  → <PrintCanvasClient resume={resume} />
  → <ResumeDocumentCanvas mode="export" />
  → 不挂 store

/api/resume/[id]/pdf               (Backend → Playwright)
  → flush pending save check
  → page.goto('/resume/[id]/print')
  → page.wait_for_selector('body[data-paginated="true"]')
  → page.pdf(margin=0, prefer_css_page_size=True)
```

### 6.3 双坐标系（screen vs print）

```ts
const SCREEN_GAP_PX = 16;
const PRINT_GAP_PX = 0;

function getAtomAbsoluteCoord(atomLayout, mode, template) {
  const gap = mode === 'edit' ? SCREEN_GAP_PX : PRINT_GAP_PX;
  const pageStride = template.page.heightPx + gap;
  return {
    top: atomLayout.pageIndex * pageStride
       + template.page.marginPx.top
       + atomLayout.yWithinPage,
    left: template.page.marginPx.left + atomLayout.xWithinPage,
  };
}
```

### 6.4 PrintFlowPlaceholders（Chromium 分页用）

```tsx
<div data-canvas-root style={{ position: 'relative', width: norm.page.widthPx, height: totalHeight }}>
  {/* 撑文档流，让 Chromium 在每 11in 处分页 */}
  <div className="print-flow" aria-hidden style={{ position: 'relative' }}>
    {Array.from({ length: layout.pageCount }).map((_, i) => (
      <div
        key={i}
        className="print-page-placeholder"
        style={{
          height: norm.page.heightPx,
          marginBottom: i < layout.pageCount - 1 ? gap : 0,
          breakAfter: mode === 'export' ? 'page' : 'auto',
        }}
      />
    ))}
  </div>
  <PageBackgroundLayer pageCount={layout.pageCount} mode={mode} template={norm} />
  <AtomContentLayer atoms={layout.atoms} layouts={layout.atomLayouts} mode={mode} template={norm} />
  {mode === 'edit' && <InteractionLayer />}
</div>
```

### 6.5 CSS @page

```css
/* canvas-print.css */
@page {
  size: 8.5in 11in;
  margin: 0;
}

@media print {
  body { margin: 0; }
  .interaction-layer { display: none !important; }
  .page-card,
  .print-page-placeholder {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
}
```

### 6.6 Playwright 配置

```python
async def generate_pdf(resume_id: str) -> bytes:
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1024, 'height': 1320})
        page = await context.new_page()
        await page.goto(f"http://localhost:3000/resume/{resume_id}/print")
        await page.wait_for_selector('body[data-paginated="true"]', timeout=30_000)
        await page.evaluate("document.fonts.ready")
        pdf = await page.pdf(
            print_background=True,
            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            prefer_css_page_size=True,  # CSS @page 单一来源
        )
        await browser.close()
        return pdf
```

### 6.7 Flush pending save before export

```ts
async function handleExportClick() {
  setExporting(true);
  try {
    await useResumeStore.getState().flushSave();
    window.location.href = `/api/resume/${resumeId}/pdf`;
  } finally {
    setExporting(false);
  }
}
```

### 6.8 data-paginated 由 canvas 自己拥有

```tsx
useEffect(() => {
  if (!ready) {
    document.body.dataset.paginated = "false";
    return;
  }
  let cancelled = false;
  (async () => {
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    if (cancelled) return;
    document.body.dataset.paginated = "true";
  })();
  return () => { cancelled = true; };
}, [ready, layout]);
```

### 6.9 一致性的物理保证

| 因素 | 机制 |
|------|------|
| 同 schema | 同一个 resume JSON |
| 同 layout 算法 | 同一个 LayoutStrategy.computeLayout |
| 同 atom 测量 | 同一个 AtomRenderer（mode 仅切 editable）|
| 同 CSS | 同一份 NormalizedTemplate.theme + 同一份 layout-tokens |
| 同字体 | next/font Inter，edit/export 都加载 |
| 同 page geometry | 同一份 NormalizedTemplate.page |

---

## 7. 文件结构 + 迁移

### 7.1 v2 新建目录（不动 v1）

```
frontend/src/components/resume/
├── EditorCanvas.tsx                   # v1，留原位
├── EditorTopBar.tsx                   # v1
├── PageBreakOverlay.tsx               # v1
├── PreviewPDFModal.tsx                # v1
├── extensions/                        # v1
├── resume-editor.css                  # v1
└── v2/                                # ⬅️ 全部新代码
    ├── ResumeDocumentCanvas.tsx
    ├── EditorPage.tsx
    ├── EditorTopBar.tsx
    ├── layers/
    │   ├── PageBackgroundLayer.tsx
    │   ├── AtomContentLayer.tsx
    │   ├── PrintFlowPlaceholders.tsx
    │   └── InteractionLayer.tsx
    ├── atoms/
    │   ├── AtomRenderer.tsx
    │   ├── HeaderAtom.tsx
    │   ├── SectionHeadingAtom.tsx
    │   └── EntryAtom.tsx
    ├── fields/
    │   ├── PlainTextField.tsx
    │   ├── BulletField.tsx
    │   └── ContactLinesField.tsx
    ├── extensions/
    │   ├── NoNewline.ts
    │   ├── AtomKeyboardNav.ts
    │   ├── SlashCommand.ts
    │   └── MarkdownInputRules.ts
    ├── layout/
    │   ├── LayoutEngine.ts
    │   ├── strategies/
    │   │   ├── index.ts
    │   │   └── SingleColumnLayoutStrategy.ts
    │   ├── atoms-projection.ts
    │   ├── normalize-template.ts
    │   └── AtomElementRegistry.ts
    ├── interaction/
    │   ├── DragController.ts
    │   ├── SelectionManager.ts
    │   ├── AtomFocusManager.ts
    │   ├── DragHandle.tsx
    │   ├── DragGhost.tsx
    │   ├── DropIndicator.tsx
    │   └── BubbleMenu.tsx
    ├── store/
    │   ├── useResumeStore.ts
    │   ├── actions/
    │   │   ├── moveSection.ts
    │   │   ├── moveEntry.ts
    │   │   ├── moveBullet.ts
    │   │   ├── insertBlock.ts
    │   │   ├── deleteBlock.ts
    │   │   ├── updateBullet.ts
    │   │   └── setTemplate.ts
    │   ├── undo-stack.ts
    │   ├── flush-save.ts
    │   └── source-of-truth.ts
    ├── templates/
    │   ├── registry.ts
    │   └── minimal-single-column.ts
    ├── tokens/
    │   ├── layout-tokens.ts
    │   └── canvas.css
    ├── canvas-print.css
    └── types.ts
```

### 7.2 Route 接管（唯一切换点）

```tsx
// frontend/src/app/resume/[id]/page.tsx
// v2 完工后改这一处 import
import { EditorPage } from '@/components/resume/v2/EditorPage';
```

```tsx
// frontend/src/app/resume/[id]/print/page.tsx
import { PrintCanvasClient } from '@/components/resume/v2/PrintCanvasClient';
```

### 7.3 Schema 版本

```ts
type ResumeDoc = {
  schema_version: 2;
  id: string;
  title: string;
  template_id: string;
  header: HeaderBlock;
  sections: SectionBlock[];
  metadata: ResumeMetadata;
};
```

后端按 version 路由：
```python
async def get_resume(resume_id: str):
    raw = read_resume_file(resume_id)
    version = raw.get("schema_version", 1)
    if version == 1:
        return migrate_v1_to_v2(raw)
    return raw
```

**Read-path 自动 normalize** —— 离线迁移脚本是优化，不是必经。

### 7.4 一次性迁移脚本

```python
# backend/services/migration_v1_to_v2.py
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', default=True)
    parser.add_argument('--apply', action='store_true', help='Write to resumes_v2/')
    parser.add_argument('--in-place', action='store_true', help='DANGEROUS: overwrite resumes/')
    args = parser.parse_args()
    if args.in_place and not args.apply:
        sys.exit("--in-place requires --apply")
    out_dir = V1_DIR if args.in_place else V2_OUT_DIR
    out_dir.mkdir(exist_ok=True)
    for v1_path in V1_DIR.glob("*.json"):
        if "_backup" in str(v1_path) or "_v2" in str(v1_path): continue
        try:
            v2_doc, id_map = migrate_one(v1_path)
            if args.dry_run:
                print(f"[DRY-RUN] {v1_path.name}: ok")
                continue
            (V1_BACKUP_DIR / v1_path.name).parent.mkdir(exist_ok=True)
            shutil.copy(v1_path, V1_BACKUP_DIR / v1_path.name)
            (out_dir / v1_path.name).write_text(json.dumps(v2_doc, indent=2, ensure_ascii=False))
            (out_dir / f"{v1_path.stem}.idmap.json").write_text(
                json.dumps({"from_schema_version": 1, "id_map": id_map}, indent=2)
            )
            print(f"[OK] {v1_path.name}")
        except Exception as e:
            print(f"[ERR] {v1_path.name}: {e}")
```

执行：
```bash
python -m backend.services.migration_v1_to_v2 --dry-run
python -m backend.services.migration_v1_to_v2 --apply
# 验证 resumes_v2/ → 切后端读路径（独立 commit）→ v2 完工 1 周后清理 resumes/
```

### 7.5 v1 清理时间线

1. v2 完工 + AC 通过 → merge 到 main，**v1 文件保留**
2. 实际使用 ≥ 1 周
3. 无致命问题 → 独立 commit `chore: remove v1 resume editor`
4. 同时 audit unused deps（最低保证：删 `pagedjs` + `public/paged.polyfill.js`）

### 7.6 实施前 Inventory（task 0）

```bash
ls frontend/src/app/resume/[id]/page.tsx
ls frontend/src/app/resume/[id]/print/page.tsx
ls frontend/src/app/resume/[id]/print/PrintCanvasClient.tsx
find backend/ -name "*.py" | xargs grep -l "resume\|pdf" | head
ls saved_sessions/resumes/

# AI 工具盘点
grep -rn "tool_call\|orchestrator\|ai_rewrite\|rewriteBullet" backend/ frontend/
```

任何 spec 引用的现有路径在 task 0 都要先 verify。AI 工具入口要逐一决策（adapter / 隐藏入口）。

---

## 8. Testing 策略 + AC + 风险

### 8.1 测试金字塔

```
Visual e2e (5%)    — Playwright 真 Chromium，screenshot diff
Integration (15%)  — Vitest happy-dom，TipTap↔store 数据流
Unit (80%)         — Vitest pure，算法 / schema / store actions
```

### 8.2 单元测试矩阵

| 模块 | 测什么 |
|------|-------|
| SingleColumnLayoutStrategy.computeLayout | 给定 atoms + heights → 期望 layout |
| paginate() | keep-with-next、超高 atom、空 atom、尾部空页 |
| normalizeTemplate() | 各种单位 → px 正确 |
| infer_role() | 各种 heading 文本 → role |
| migrate_v1_to_v2 | sample v1 → 期望 v2 |
| Store actions | move/insert/delete → 期望 schema |
| Source-of-truth tracking | 不同 origin → listener 触发与否 |
| Undo stack | structural 进栈 / 文本不进栈 |
| flushSave() | debounce + force flush |
| Atom projection | schema → LayoutAtom[] |

### 8.3 Integration 测试矩阵

| 场景 | 测试点 |
|------|-------|
| TipTap onUpdate → store | 立即 commit、origin 标记 |
| Store 外部 update + focused | pendingExternalUpdate 排队 |
| Store 外部 update + blurred | setContent(content, false) |
| compositionstart → store update | layoutEngine paused |
| compositionend → flush | 重排版触发 |
| Cmd+Z in bullet | TipTap.undo |
| Cmd+Z out of editor | store.undo |
| Drag bullet across entries | moveBullet + repaginate |
| Block selection + Backspace | deleteBlocks + repaginate |

### 8.4 Visual e2e 测试矩阵（Playwright + 真 Chromium）

测试时强制 `?hideInteractionLayer=1` query 隐藏交互层；按 page 截图比较，不比整个 canvas。

| 场景 | tolerance |
|------|-----------|
| edit `?hideInteractionLayer=1` 每页 vs `/print` 每页 | < 0.5% |
| edit 每页 vs PDF 每页 PNG | < 1% (PDF 渲染差异) |
| 中文 IME 流程后无字体异常 | 视觉无 regression |
| 长简历（5 页）repaginate 性能 | ~ |

迁移视觉对比（v1 PDF vs v2 截图）只做参考，不作硬 AC。

### 8.5 Acceptance Criteria

**核心功能 AC（blocking）**

- [ ] 加载 v1 简历（auto-migration）能编辑、保存、导出
- [ ] 创建新 v2 简历能编辑、保存、导出
- [ ] **三处一致**：editor 渲染 ≡ `/print` 浏览器渲染 ≡ PDF（按 page 截图，diff < 1%）
- [ ] 中文输入流畅，IME 不卡 / 不乱跳 / 不丢字
- [ ] Drag 移动 bullet / entry / section 都成功
- [ ] Slash 菜单：Add bullet / Add entry / Add section heading 三项工作（不含 divider）
- [ ] Markdown shortcut（`**` / `*` / `[]()`）转 mark
- [ ] 多块选中 + Backspace + Cmd+D 工作
- [ ] Cmd+Z 边界正确（bullet 内→TipTap；外面→store）
- [ ] Bubble menu + bold/italic/link 工作
- [ ] Hover 出现 ⋮⋮ + + / × 按钮
- [ ] Page X of Y 顶栏显示
- [ ] AI 工具入口已 inventory（adapter 或隐藏）

**架构 AC（blocking）**

- [ ] AtomContentLayer 在 edit/export DOM byte-identical（剥编辑性 attr 后）
- [ ] mock TwoColumnLayoutStrategy unit test 通过（验证算法可插拔）
- [ ] schema_version: 2 字段在所有保存的 v2 resume

**质量 target（不 blocking）**

- Unit coverage ≥ 80%
- repaginate < 50ms on 3-page resume
- 60 TipTap 实例 < 50MB
- 无 console warning

**Deferred to v2.1**（明确不做）

- Two-column / sidebar 模板
- 跨 atom 文本删除 / 剪切 / 粘贴覆盖
- 视觉行检测的 ↑↓ 跨多行
- Slash 的 Add divider
- 模板切换 hover preview UX
- AI 工具 v2 adapter
- Nested bullet
- 跨 zoom level 拖拽精确定位
- 实时协作

### 8.6 已知风险登记

| 风险 | 缓解 | 触发条件 |
|------|-----|---------|
| 跨 atom 文本 selection 在 Safari/Firefox 行为怪 | best-effort copy only；block selection 兜底 | 用户报跨块复制问题 |
| 中文 IME 期间布局抖动 | layoutEngine.compositionLock；e2e 覆盖 | 重排版在 composition 期间触发 |
| 长简历 (>5 页) repaginate lag | 增量测量；ResizeObserver 只对受影响 atom；MVP 接受 | 用户简历超 5 页 |
| Template 切换游标丢失 | 显式 loading overlay | v2 单模板，发生概率低 |
| Drag ghost zoom level 偏移 | 测试 100% / 110% / 125%；visualViewport 修正 | 用户 zoom 浏览器 |
| 迁移脚本对不规则 v1 数据失败 | dry-run + 跳过失败 + 日志 | 旧数据格式异常 |
| AI 工具 v1→v2 schema 不兼容 | task 0 inventory + adapter 或隐藏 | v1 AI 工具未 audit |

### 8.7 Roadmap

详见 `docs/ROADMAP.md`。v2 的 5 项基础设施投资为后续 10 项高级功能（Smart Fit、JD heatmap、Recruiter scan 等）铺路：

1. 每个 block 有稳定 React 组件 + 稳定 ID
2. 支持 absolute overlay
3. Pagination 算法可重复运行
4. Renderer 支持多种 mode
5. 从 schema 直接序列化各种格式

---

## 附录 A：v2 schema 完整定义

```ts
type ResumeDoc = {
  schema_version: 2;
  id: string;
  title: string;
  template_id: string;
  header: HeaderBlock;
  sections: SectionBlock[];
  metadata: ResumeMetadata;
};

type HeaderBlock = {
  id: BlockId;
  name: string;
  contact_lines: ContactItem[];
};

type ContactItem =
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; url: string };

type SectionBlock = {
  id: BlockId;
  role: SectionRole;
  heading: string;
  entries: EntryBlock[];
};

type EntryBlock = {
  id: BlockId;
  title: string;
  meta: string;
  bullets: BulletBlock[];
};

type BulletBlock = {
  id: BlockId;
  content: ProseMirrorInline[];   // TipTap 直接吃
  tags?: string[];                 // roadmap 用
  evidence_refs?: string[];        // roadmap 用
};

type ProseMirrorInline = {
  type: 'text';
  text: string;
  marks?: Array<
    | { type: 'bold' }
    | { type: 'italic' }
    | { type: 'link'; attrs: { href: string } }
  >;
};

type ResumeMetadata = {
  created_at: ISO8601;
  updated_at: ISO8601;
  target_company: string | null;
  target_role: string | null;
  parent_id: string | null;
};

type SectionRole =
  | 'summary' | 'skills' | 'experience' | 'projects'
  | 'education' | 'awards' | 'publications' | 'custom';

type BlockId = string;  // UUID v4
```

---

## 附录 B：模板默认值

```ts
// frontend/src/components/resume/v2/templates/minimal-single-column.ts
export const MINIMAL_SINGLE_COLUMN: TemplateConfig = {
  id: 'minimal-single-column',
  layoutStrategyId: 'single-column',
  page: {
    width: '8.5in',
    height: '11in',
    margin: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' },
  },
  theme: {
    fontFamily: 'var(--font-resume), Inter, sans-serif',
    bodyFontSize: 14,
    bodyLineHeight: 1.5,
    bodyColor: '#374151',
    headingFontSize: 26,
    headingColor: '#111827',
    sectionHeadingFontSize: 11,
    sectionHeadingLetterSpacing: '0.14em',
    sectionHeadingColor: '#6b7280',
    accent: '#2563eb',
  },
  columnMapping: {
    default: 'main',
  },
};
```
