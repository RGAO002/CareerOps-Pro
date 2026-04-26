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
      i += chain.length;
      // ⬇️ 仅当后面还有 atom 时才推进到下一页（防尾部 phantom blank page）
      if (i < atoms.length) {
        pageIdx++; cursorY = 0;
      }
    } else {
      // 翻页重试（不增 i）
      pageIdx++; cursorY = 0;
    }
  }

  // ⬇️ 用 atom 的真实 pageIndex 计算 pageCount，不是循环结束时的 pageIdx
  // 这样防御任何分支留下的 phantom blank page
  let maxPage = 0;
  for (const layout of result.values()) {
    if (layout.pageIndex > maxPage) maxPage = layout.pageIndex;
  }
  return { atomLayouts: result, pageCount: maxPage + 1 };
}
```

### 2.3 五阶段管线

```
Phase 1: MEASUREMENT RENDER
  - Render <MeasurementLayer>（visibility: hidden, position: absolute, top: -10000px）
  - 所有 atoms 单列渲染，width = contentWidthPx
  - **用同一个 AtomRenderer 组件，但 mode="measure"**
  - mode="measure" 是必须的第三种 mode（见 § 2.3.1）
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

### 2.3.1 三种 mode（**hard constraint**）

`AtomRenderer` 有三种 mode，**不是两种**：

```ts
type CanvasMode = 'edit' | 'export' | 'measure';
```

| mode | 用途 | TipTap editable | 副作用 |
|------|------|----------------|--------|
| `edit` | 编辑器主视图 | true | 全开 |
| `export` | `/print` + PDF | false | 关 InteractionLayer，关 history，关 SlashCommand，关 BubbleMenu |
| `measure` | MeasurementLayer 内 | false | **关全部副作用**：no store.subscribe / no atomFocusManager.register / no History / no SlashCommand / no MarkdownInputRules / no BubbleMenu / no onUpdate / no IME hooks |

`measure` mode 必须保持的：
- DOM 结构与 edit/export byte-identical（剥编辑性 attr）
- 所有 CSS class 一致
- TipTap 实例本身存在（这样 ProseMirror chrome `<p>` 包装等 DOM 细节一致），但所有写回 store / 注册 manager / 监听键盘的钩子都关闭

**Hard rule：content 必须通过 props 传递，不通过 store singleton 读**。

理由：export / measure mode 根本不挂 store。如果字段组件直接 `store.getState().bullets[id]`，那 `/print`（无 store）和 MeasurementLayer（不应依赖 store）都会炸。

```tsx
// AtomRenderer 把 BulletBlock 作为 prop 传给 BulletField
function EntryAtomRenderer({ entry, mode, ...positionProps }: Props) {
  return (
    <div data-block-id={entry.id} ...>
      <PlainTextField
        fieldKey={{ kind: 'entry.title', id: entry.id }}
        value={entry.title}
        mode={mode}
      />
      <PlainTextField
        fieldKey={{ kind: 'entry.meta', id: entry.id }}
        value={entry.meta}
        mode={mode}
      />
      {entry.bullets.map(b => (
        <BulletField
          key={b.id}
          bulletId={b.id}
          content={b.content}                  // ⬅️ 从 prop 传，不查 store
          mode={mode}
        />
      ))}
    </div>
  );
}

function BulletField({ bulletId, content, mode }: Props) {
  // initial content 只用 prop，不读 store
  const editor = useEditor({
    extensions: [
      ...BULLET_EXTENSIONS_BASE,
      ...(mode === 'edit' ? BULLET_EXTENSIONS_EDIT_ONLY : []),
    ],
    content,                                    // ⬅️ from prop
    editable: mode === 'edit',
    immediatelyRender: false,
    onUpdate: mode === 'edit'
      ? ({ editor }) => store.getState().updateBullet(bulletId, editor.getJSON(), { ... })
      : undefined,
  });

  // store.subscribe 仅 mode === 'edit'
  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    return store.subscribe(...);  // 处理外部源 setContent (per § 3.3)
  }, [mode, editor, bulletId]);

  // atomFocusManager.register 仅 mode === 'edit'
  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    atomFocusManager.register({ kind: 'bullet.content', id: bulletId }, editor);
    return () => atomFocusManager.unregister({ kind: 'bullet.content', id: bulletId });
  }, [mode, editor, bulletId]);

  return <EditorContent editor={editor} />;
}
```

**Edit mode 的数据流**：
- 初次 mount：从 prop（一开始 prop = store 当前值）
- 后续：用户键入 → TipTap 内部 state 立即变；onUpdate → store update → React selector subscribe → AtomRenderer 重渲染 → 新 prop 进 BulletField，**但 BulletField 不重设 editor.content**（content 只用于 useEditor 初始化）
- 外部源更新走 § 3.3 的 store.subscribe imperative 通道（`editor.commands.setContent(content, false)`）
- **Hard rule**：edit mode 不允许从 prop 反向 setContent（会破坏 IME / undo / cursor）

**Export mode 的数据流**：
- 初次 mount：从 prop
- 没有 onUpdate / store.subscribe / focus register
- /print route 是 stateless 单次渲染，prop 不会变（一次 fetch 后渲染完即结束）
- 不需要 prop sync

**Measure mode 的数据流**（**不一样**）：
- MeasurementLayer 是**长生命周期**组件，内容变化时必须立即反映在测量层（否则 layout 算高度时用的是旧内容）
- **Hard rule**：measure mode 必须监听 `content` prop 变化，**主动 setContent**
- **Hard rule**：必须用 `useLayoutEffect`（不是 `useEffect`），保证 sync 在浏览器 paint 之前发生，让 ResizeObserver 测的是最新高度
- **Hard rule**：**所有字段组件**都要做（PlainTextField / ContactLinesField / BulletField），不止 BulletField

```tsx
// 通用 measure-mode prop sync hook，所有字段复用
function useMeasureModeSync<T>(
  mode: CanvasMode,
  editor: Editor | null,
  propValue: T,
  toDoc: (v: T) => any,
) {
  useLayoutEffect(() => {
    if (mode !== 'measure' || !editor) return;
    // 转 doc shape 后 setContent；emitUpdate=false 防止反弹
    editor.commands.setContent(toDoc(propValue), false);
  }, [mode, editor, propValue, toDoc]);
}

// BulletField
function BulletField({ bulletId, content, mode }: Props) {
  const editor = useEditor({
    extensions: [BulletDocument, Paragraph, Text, Bold, Italic, Link, ...],
    content,
    editable: mode === 'edit',
    // ...
  });

  useMeasureModeSync(mode, editor, content, identity);  // bullet 已经是 doc

  // edit 模式：走 store.subscribe imperative 通道（external sources only）
  useEffect(() => {
    if (mode !== 'edit' || !editor) return;
    return store.subscribe(...);
  }, [mode, editor, bulletId]);
}

// PlainTextField（也要 measure sync！）
function PlainTextField({ fieldKey, value, mode }: Props) {
  const initialDoc = useMemo(() => stringToSingleLineDoc(value), []);
  const editor = useEditor({
    extensions: [SingleLineDocument, Text, NoNewline, ...],
    content: initialDoc,
    editable: mode === 'edit',
    // ...
  });

  useMeasureModeSync(mode, editor, value, stringToSingleLineDoc);  // ⬅️ 不要漏

  // edit 模式：store.subscribe ...
}

// ContactLinesField 同理
function ContactLinesField({ items, mode }: Props) {
  const initialDoc = useMemo(() => contactItemsToDoc(items), []);
  const editor = useEditor({
    extensions: [SingleLineWithMarksDocument, Text, Link, NoNewline, ...],
    content: initialDoc,
    editable: mode === 'edit',
  });

  useMeasureModeSync(mode, editor, items, contactItemsToDoc);  // ⬅️ 同样不要漏

  // edit 模式：store.subscribe ...
}
```

**为什么三种 mode 的 sync 规则不同：**
- edit：用户输入是真相源，prop 反向 setContent 会损坏交互（cursor / IME / undo）
- export：prop 在 /print 渲染期间不变，不需要 sync
- measure：prop 在编辑过程中持续变化，必须每次都重新 setContent 才能测出准确高度

**为什么 useLayoutEffect 不是 useEffect**：
- `useEffect` 在浏览器 paint **之后**异步执行
- ResizeObserver 在 layout 后立即 fire
- 如果用 `useEffect`：浏览器先用旧 content 算 layout → ResizeObserver fire 旧高度 → repaginate 用错的高度 → 再 useEffect 把 content 更新 → 再下一轮 ResizeObserver fire 新高度 → 又一次 repaginate（多余 + 闪烁）
- 用 `useLayoutEffect`：sync 在 paint 前发生 → 浏览器 layout 用新 content → ResizeObserver 直接读新高度 → 一次到位

**测试 guard**（除已有的 3 条）：
4. integration test 改 store 中某 bullet content → MeasurementLayer 内对应 BulletField 的 DOM 必须在下一帧前更新
5. integration test 改 PlainTextField value → MeasurementLayer DOM 同样更新（防漏字段）

**测试 guard**：
1. unit test 渲染同一个 bullet 三次（edit / export / measure），剥掉编辑性 attr 后比较 outerHTML 必须完全相同
2. MeasurementLayer 渲染过程中 `store.getState` 调用次数必须 === 0
3. `/print` 路由 mount 不依赖 ResumeStore

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
//
// 唯一来源：CSS 字符串规格。**禁止**写 hardcoded *_PX 的 rounded int。
// 任何 px 值通过 parseToPx() 在 normalizeTemplate() 时计算成 float。
// 这样 layout 和 CSS 永远从同一个源出，保证 PDF 渲染没有 sub-pixel drift。

export const PAGE_SPEC = {
  WIDTH: '8.5in',
  HEIGHT: '11in',
  MARGIN: { top: '0.75in', right: '0.9in', bottom: '0.75in', left: '0.9in' },
} as const;

export const ATOM_SPEC = {
  GAP: '12px',     // 注意是 string，不是 12 number
} as const;

export const SCREEN_GAP = '16px';  // 编辑模式 page 之间的灰色 gap
export const PRINT_GAP = '0';      // PDF 不能有
```

```ts
// frontend/src/components/resume/v2/layout/normalize-template.ts
// 1in = 96 CSS px（CSS spec）
const PX_PER_INCH = 96;

function parseToPx(spec: string): number {
  if (spec.endsWith('in')) return parseFloat(spec) * PX_PER_INCH;
  if (spec.endsWith('px')) return parseFloat(spec);
  if (spec.endsWith('cm')) return parseFloat(spec) * (PX_PER_INCH / 2.54);
  throw new Error(`Unknown unit: ${spec}`);
}

// 输出 float px（不 round）— 同一份 string spec 两个 consumer：
// JS layout engine 用 parseToPx() 算 float
// CSS 用 calc() 算 float
function normalizeTemplate(config: TemplateConfig): NormalizedTemplate {
  const widthPx = parseToPx(config.page.width);   // float
  const heightPx = parseToPx(config.page.height);
  const margin = mapValues(config.page.margin, parseToPx);
  return {
    page: {
      widthPx,
      heightPx,
      marginPx: margin,
      contentWidthPx: widthPx - margin.left - margin.right,
      contentHeightPx: heightPx - margin.top - margin.bottom,
    },
    atom: { gapPx: parseToPx(ATOM_SPEC.GAP) },
    // ...
  };
}
```

CSS 不要硬编码派生值，统一通过 CSS variable + calc() 从同一份 string spec 派生：

```css
:root {
  --page-width: 8.5in;
  --page-height: 11in;
  --page-margin-top: 0.75in;
  --page-margin-right: 0.9in;
  --page-margin-bottom: 0.75in;
  --page-margin-left: 0.9in;
  --atom-gap: 12px;
  --screen-gap: 16px;
  /* 派生通过 calc，不预算 */
  --page-content-width: calc(var(--page-width) - var(--page-margin-left) - var(--page-margin-right));
  --page-content-height: calc(var(--page-height) - var(--page-margin-top) - var(--page-margin-bottom));
}
```

**Hard rule（implementation-only）**：v2 实现文件中（`frontend/src/components/resume/v2/**/*.{ts,tsx,css}`）**禁止**出现派生 px 整数 literal（如 page width 转 px、content height 转 px 这种从 string spec 应该计算出来的值）。所有派生值必须通过 `parseToPx()`（JS）或 `calc()`（CSS）从 string spec 计算。

> 此规则**不**约束 spec 文档自身（spec 可以在散文 / 注释 / 例子里写具体数字解释）。Lint guard 应只 grep 实施目录，不 grep `docs/`。

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

| 字段 | Schema 存储 | TipTap 类型 | 扩展（base） | 扩展（edit-only） |
|------|----------|-----------|------------|-----------------|
| header.name | `string` | single-line plain | SingleLineDocument, Text, NoNewline | History |
| header.contact_lines[] | `ContactItem[]` | single-line + link | SingleLineWithMarksDocument, Text, Link, NoNewline | History |
| section.heading | `string` | single-line plain | SingleLineDocument, Text, NoNewline | History |
| entry.title | `string` | single-line plain | SingleLineDocument, Text, NoNewline | History |
| entry.meta | `string` | single-line plain | SingleLineDocument, Text, NoNewline | History |
| bullet.content | `ProseMirrorBulletDoc` | single-paragraph + marks | **BulletDocument**, Paragraph, Text, Bold, Italic, Link | History, AtomKeyboardNav, SlashCommand, MarkdownInputRules |

### 3.1.1 Single-line schema（**hard constraint**）

TipTap 默认 Document `content: 'block+'`，不接 plain text。单行字段 schema 是 `string`，所以需要：

**自定义三个 Document schema**（在 ProseMirror schema 层强制，不靠 transaction 后 normalize）：

```ts
import { Document } from '@tiptap/extension-document';

// 单行 plain text（name / heading / title / meta）
export const SingleLineDocument = Document.extend({
  name: 'doc',
  content: 'text*',  // ⬅️ 直接放 text node，不允许 block
});

// 单行 + inline marks（contact_lines 含 link）
export const SingleLineWithMarksDocument = Document.extend({
  name: 'doc',
  content: 'inline*',  // text + marks，仍无 block
});

// Bullet：恰好 1 个 paragraph
export const BulletDocument = Document.extend({
  name: 'doc',
  content: 'paragraph',  // ⬅️ 单数 = exactly 1 paragraph，schema 层禁止多 paragraph
});
```

**为什么要在 schema 层强制单 paragraph**：

如果 bullet 用默认 `Document`（`content: 'block+'`），用户在 bullet 中按 Enter（在 AtomKeyboardNav 截到之前的瞬间）或粘贴多段时，ProseMirror 内部 doc 可能短暂含 2 个 paragraph。如果在那瞬间触发 onUpdate → store commit，持久化的 schema 就违反 1-tuple 约束。

用 `BulletDocument` (`content: 'paragraph'`) 后：
- ProseMirror schema validation 在 transaction 应用前就拒绝多 paragraph 的状态
- Enter 键（即使 AtomKeyboardNav 没拦到）创建第 2 个 paragraph 的 transaction 直接失败
- Paste 走 transformPasted（§ 4.8.1）拍平为单段 + 多余段插入新 BulletBlock
- onUpdate 永远只看到 valid 单 paragraph
- 持久化的 doc 永远满足 ProseMirrorBulletDoc 的 1-tuple 约束

**Defense in depth**：
1. **Schema 层**（BulletDocument `content: 'paragraph'`）—— 第一道
2. **Paste 层**（transformPasted / transformPastedHTML）—— 第二道
3. **store commit 层**（updateBullet action 校验 content.content.length === 1）—— 第三道兜底

**String ↔ TipTap doc adapter**（边界处转换）：

```ts
// frontend/src/components/resume/v2/fields/single-line-adapter.ts

// SingleLineDoc 是 SingleLineDocument-extended 的 doc shape
// content 是 text node 数组（不是 paragraph 数组），与 BulletDoc 不同
type SingleLineDoc = {
  type: 'doc';
  content: ProseMirrorInline[];  // text nodes with optional marks
};

// string → SingleLine TipTap doc JSON（用于 useEditor content prop）
export function stringToSingleLineDoc(s: string): SingleLineDoc {
  if (!s) return { type: 'doc', content: [] };
  return {
    type: 'doc',
    content: [{ type: 'text', text: s }],
  };
}

// TipTap doc → string（用于 onUpdate 写回 store）
export function singleLineDocToString(editor: Editor): string {
  return editor.getText();  // TipTap 内置，跨 marks 拼接 text
}
```

**PlainTextField 实现示意**（详细版本含 measure sync 见 § 3.3）：

```tsx
function PlainTextField({ fieldKey, value, mode }: Props) {
  const initialDoc = useMemo(() => stringToSingleLineDoc(value), []);

  const editor = useEditor({
    extensions: [
      SingleLineDocument,
      Text,
      NoNewline,
      ...(mode === 'edit' ? [History] : []),
    ],
    content: initialDoc,                       // ⬅️ doc-shaped
    editable: mode === 'edit',
    immediatelyRender: false,
    onUpdate: mode === 'edit'
      ? ({ editor }) => {
          const next = singleLineDocToString(editor);
          store.getState().updateField(fieldKey, next, { ... });
        }
      : undefined,
  });

  useMeasureModeSync(mode, editor, value, stringToSingleLineDoc);  // ⬅️ 见 § 3.3

  // store.subscribe / focus register 仅 edit mode（同 BulletField）
  return <EditorContent editor={editor} />;
}
```

**ContactLinesField** 类似但支持 inline link mark；写回时转回 `ContactItem[]`（`text` 段成 `{ type: 'text', value }`，带 `link` mark 的段成 `{ type: 'link', label, url }`）。Adapter 在 `contact-lines-adapter.ts` 单独写。

### 3.1.2 NoNewline 扩展

单行字段拦截 Enter，触发 `focusNextAtomField()`：

```ts
import { Extension } from '@tiptap/core';

export const NoNewline = Extension.create({
  name: 'noNewline',
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        atomFocusManager.focusNext(this.editor.options.fieldKey);
        return true;  // 阻止默认 newline
      },
      'Shift-Enter': () => {
        atomFocusManager.focusNext(this.editor.options.fieldKey);
        return true;
      },
    };
  },
});
```

### 3.1.3 Why TipTap for single-line（不用 `<input>`）

- 中文 IME composition 处理一致
- 全字段统一架构（store.subscribe / focus manager / 测试 guard 同一套）
- 未来加 inline mark（如让 entry.title 支持公司名加粗）只是改 schema，不换底层

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
| Cmd+Enter | bullet 内 | 同 Enter |
| Backspace | bullet 开头 | `mergeWithPreviousBullet` |
| ArrowUp | bullet 文档开头 | `focusPreviousAtomField` |
| ArrowDown | bullet 文档末尾 | `focusNextAtomField` |
| Enter | 单行字段（title/meta/heading/name）| `focusNextAtomField` |
| ArrowUp/Down | 单行字段（任何位置）| `focusPreviousAtomField` / `focusNextAtomField` |
| ArrowLeft 开头 / ArrowRight 末尾 | 单行字段 | `focusPreviousAtomField` / `focusNextAtomField` |

**Shift+Enter 在 v2 不实现**（推 v2.1）：
- bullet 内 Shift+Enter 通常用于 hard break（`<br>` 等价物），需要 HardBreak extension + ProseMirrorParagraph schema 支持 `{type:'hardBreak'}` 子节点
- v2 schema 的 `ProseMirrorParagraph.content` 只允许 `ProseMirrorInline[]`，不含 hardBreak
- 简历 bullet 几乎不需要硬换行（多段经历应该是分开的 bullet）
- v2 实现：bullet 内 Shift+Enter 走 ProseMirror 默认（被 NoNewline 不拦的话会插入新 paragraph，破坏单 paragraph 假设）→ **加扩展显式拦截 Shift+Enter，no-op**
- 单行字段的 Shift+Enter 已在 NoNewline 里拦截 = `focusNextAtomField`

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

### 4.8.1 Bullet paste normalization（hard rule）

V2 bullet schema 强制单 paragraph（`ProseMirrorBulletDoc.content` 是 1-tuple）。但用户从外部（Word / Google Docs / 网页）粘贴时常带多 paragraph、`<br>`、嵌套列表等。必须 normalize：

```ts
// BulletField TipTap 配置
const editor = useEditor({
  extensions: [
    BulletDocument,                         // ⬅️ 不是默认 Document
    Paragraph, Text, Bold, Italic, Link,
    ...(mode === 'edit' ? BULLET_EXTENSIONS_EDIT_ONLY : []),
  ],
  editorProps: {
    transformPastedHTML(html) {
      return normalizeMultiParagraphPaste(html, currentBulletId);
    },
    transformPasted(slice) {
      // ProseMirror Slice 层兜底：把 hardBreak / 多 paragraph 转单段
      return collapseToSingleParagraph(slice);
    },
  },
  // ...
});
```

**Normalize 规则**：
1. **粘贴单 paragraph**（含 inline marks）→ 直接进当前 bullet
2. **粘贴 N 个 paragraph**（N > 1） → 第一个进当前 bullet 末尾；剩余 N-1 个 paragraph 各创建一个新 BulletBlock 插入在当前 bullet 之后
3. **粘贴含 `<br>` 的单 paragraph** → 把 `<br>` 当作 paragraph 分隔，按规则 2 处理
4. **粘贴含嵌套 list / heading / blockquote** → 全部 flatten 成 plain paragraph，再按规则 2

实现：
```ts
function collapseToSingleParagraph(slice: Slice): Slice {
  // 用 ProseMirror Schema 重建：把所有 block 内的 inline 内容串接
  // 多 paragraph 之间用空格（不用 hardBreak，schema 不允许）
  // ...
}

function normalizeMultiParagraphPaste(html: string, currentBulletId: BulletId) {
  const paragraphs = parseHtmlToParagraphArray(html);
  if (paragraphs.length <= 1) return html;
  // 把 paragraphs[1..] 转成 store insertBullet 调用
  for (let i = 1; i < paragraphs.length; i++) {
    store.getState().insertBullet(
      currentEntryId(currentBulletId),
      indexOf(currentBulletId) + i,
      stringToBulletDoc(paragraphs[i].text),
      { type: 'paste' }
    );
  }
  return paragraphHtml(paragraphs[0]);  // 只让 TipTap 看第一段
}
```

**Migration 同样 normalize**：v1→v2 迁移脚本里如果遇到 v1 bullet 含多个 paragraph，按规则 2 拆成多个 v2 BulletBlock。

**测试 guard**：
1. unit test 多种粘贴 case（plain text / HTML / Word HTML / multi-paragraph / `<br>`）→ 期望 store 状态
2. unit test bullet schema 校验：所有 BulletBlock.content.content.length === 1
3. integration test：粘贴多段 → 多个 bullets 出现 + repaginate 触发

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
type CanvasMode = 'edit' | 'export' | 'measure';
```

| | edit | export | measure |
|---|------|--------|---------|
| Store mounted | ✓ | ✗ | ✗ |
| TipTap editable | true | false | false |
| InteractionLayer rendered | ✓ | ✗ | ✗ |
| Store subscribe / focus register / IME hooks / onUpdate | ✓ | ✗ | ✗ |
| Edit-only extensions（History/Slash/Markdown/Nav）| ✓ | ✗ | ✗ |
| 正文 DOM | 同 | 同 | 同 |
| 用途 | 编辑视图 | /print + PDF | MeasurementLayer 内 |

详细行为见 § 2.3.1。

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

EditorTopBar Export 按钮 (client)
  → await store.flushSave()             # 见 § 6.7
  → window.location.href = /api/resume/[id]/pdf

/api/resume/[id]/pdf               (Backend → Playwright)
  → read last-saved resume JSON         # 客户端已在导航前 flush
  → page.goto('/resume/[id]/print')
  → page.wait_for_selector('body[data-paginated="true"]')
  → page.pdf(margin=0, prefer_css_page_size=True)
```

### 6.3 双坐标系（screen vs print）

Gap 值从 string spec parse（不直接写 number）：

```ts
// frontend/src/components/resume/v2/layout/coords.ts
import { parseToPx } from './normalize-template';
import { SCREEN_GAP, PRINT_GAP } from '../tokens/layout-tokens';

const SCREEN_GAP_PX = parseToPx(SCREEN_GAP);  // 16
const PRINT_GAP_PX = parseToPx(PRINT_GAP);    // 0

function getAtomAbsoluteCoord(
  atomLayout: AtomLayout,
  mode: CanvasMode,
  template: NormalizedTemplate,
) {
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

### 6.7 Flush pending save before export（client-side protocol）

**关键事实**：dirty state + debounce 计时器都活在浏览器 store 里，**后端无法感知**客户端是否还有未保存。所以 flush **必须在客户端**完成、并**等到 ACK** 才能跳转 PDF endpoint。

```ts
// store 维护 saveAck（每次 backend save 成功后 resolve）
type FlushState = {
  pending: boolean;             // debounce 是否在排队
  inflightPromise: Promise<void> | null;  // 当前 in-flight POST
  lastSavedVersion: number;     // 后端 ACK 的 schema version
};

flushSave: async () => {
  const s = get();
  // 1. 取消 debounce 计时器，立即触发一次 save
  if (s.flush.pending) cancelDebounce();
  // 2. 等当前 in-flight 完成
  if (s.flush.inflightPromise) await s.flush.inflightPromise;
  // 3. 如果在 await 期间又 dirty，递归再 flush
  if (hasDirtyState()) {
    forceSaveNow();
    await get().flush.inflightPromise;
  }
  // 4. 验证 lastSavedVersion === currentDocVersion
  if (get().flush.lastSavedVersion !== get().resumeDocVersion) {
    throw new Error('Save did not converge — refusing to export stale state');
  }
}
```

```ts
// 编辑器顶栏 Export 按钮
async function handleExportClick() {
  setExporting(true);
  try {
    await useResumeStore.getState().flushSave();
    // 至此后端已经持久化最新 resume；安全跳 PDF endpoint
    window.location.href = `/api/resume/${resumeId}/pdf`;
  } catch (e) {
    showToast(`Couldn't save before export: ${e.message}. Try again in a moment.`);
  } finally {
    setExporting(false);
  }
}
```

**Backend `/api/resume/:id/pdf` 不做 flush 检查** —— backend 没法访问客户端 store。它只读最近一次 saved 的 resume 然后调 Playwright。如果客户端逻辑上漏了 flush（bug），backend 拿到的就是旧 resume，导出旧版本（降级行为，至少不炸）。

**Alternative（未来 v2.1+）**：PDF endpoint 改成 POST，body 带 resume snapshot 而不是 resume_id。这样客户端可以把当前 in-memory state 直接发过去，不依赖后端读文件。v2 不做这个，因为现有 GET endpoint 简单且 flush 协议已经够。

### 6.8 data-paginated 由 canvas 自己拥有

**Hard rule**：每次 effect run 开头**无条件** set "false"。否则 layout 变化但 ready 仍为 true 时，旧的 "true" 会持续到 fonts/RAF 等待结束，Playwright 可能在等待窗口里抓到旧 layout。

```tsx
useEffect(() => {
  // ⬅️ 无条件先设 false（不管 ready 状态）
  document.body.dataset.paginated = "false";

  if (!ready) return;

  let cancelled = false;
  (async () => {
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    if (cancelled) return;
    document.body.dataset.paginated = "true";
  })();
  return () => { cancelled = true; };
}, [ready, layout]);  // layout 变化也触发（即使 ready 一直是 true）
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
# api/services/migration_v1_to_v2.py
# (作为 module 调用：python -m api.services.migration_v1_to_v2)
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
python -m api.services.migration_v1_to_v2 --dry-run
python -m api.services.migration_v1_to_v2 --apply
# 验证 resumes_v2/ → 切后端读路径（独立 commit）→ v2 完工 1 周后清理 resumes/
```

### 7.5 v1 清理时间线

1. v2 完工 + AC 通过 → merge 到 main，**v1 文件保留**
2. 实际使用 ≥ 1 周
3. 无致命问题 → 独立 commit `chore: remove v1 resume editor`
4. 同时 audit unused deps（最低保证：删 `pagedjs` + `public/paged.polyfill.js`）

### 7.6 实施前 Inventory（task 0）

**项目实际目录结构（已验证 2026-04-26）**：

```
CareerOps-Pro/
├── api/                        # FastAPI 入口
│   ├── main.py
│   ├── routes/                 # ⬅️ resume.py 在这里
│   │   ├── resume.py
│   │   ├── humanize.py
│   │   ├── review.py
│   │   └── walkthrough.py
│   ├── services/               # ⬅️ AI orchestrator + tools 在这里
│   │   ├── ai_orchestrator.py
│   │   ├── ai_tools.py
│   │   ├── resume_store.py     # 现有 resume CRUD
│   │   └── snapshot_store.py
│   ├── models/
│   └── converters/
├── services/                   # 顶级 services（不在 api/ 下）
│   ├── resume_editor.py
│   ├── resume_parser.py
│   ├── resume_analyzer.py
│   └── ...
├── utils/
│   ├── chrome_pdf.py           # ⬅️ Playwright PDF 入口
│   ├── pdf_utils.py
│   └── session_manager.py
├── saved_sessions/
│   └── resumes/                # ⬅️ 当前 resume JSON 文件
└── frontend/src/
    ├── app/resume/[id]/
    │   ├── page.tsx            # ⬅️ 编辑器路由入口
    │   └── print/
    │       ├── page.tsx
    │       └── PrintCanvasClient.tsx
    └── components/resume/      # ⬅️ v1 编辑器代码
```

**Task 0 verify 命令**：

```bash
# 必须存在
ls /Users/fred/Desktop/CareerOps-Pro/api/routes/resume.py
ls /Users/fred/Desktop/CareerOps-Pro/api/services/resume_store.py
ls /Users/fred/Desktop/CareerOps-Pro/api/services/ai_orchestrator.py
ls /Users/fred/Desktop/CareerOps-Pro/api/services/ai_tools.py
ls /Users/fred/Desktop/CareerOps-Pro/utils/chrome_pdf.py
ls /Users/fred/Desktop/CareerOps-Pro/frontend/src/app/resume/[id]/page.tsx
ls /Users/fred/Desktop/CareerOps-Pro/frontend/src/app/resume/[id]/print/page.tsx
ls /Users/fred/Desktop/CareerOps-Pro/saved_sessions/resumes/

# AI 工具盘点（决策 adapter vs 隐藏入口）
grep -rn "tool_call\|tool_calls\|ai_orchestrator\|rewrite_bullet\|aiRewrite\|rewriteBullet" \
  api/ services/ frontend/src/
```

如果任何路径与上面不符，task 0 要先修正 spec / plan，不能盲目按 spec 写代码。

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
| paste normalization (single → multi paragraph) | 多种 HTML / plain text 输入 → 期望 store 多 bullet 结果 |
| BulletBlock schema 校验 | 所有 content.content.length === 1 |
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
  content: ProseMirrorBulletDoc;   // 严格单 paragraph (见下)
  tags?: string[];                 // roadmap 用
  evidence_refs?: string[];        // roadmap 用
};

// v2 bullet 是**严格单 paragraph**：
// - Shift+Enter 推 v2.1（不实现 hard break）
// - bullet 之间用真正的多个 BulletBlock 表达，不在一个 bullet 内多段
// - 多段 paste 必须 normalize（见下方）
type ProseMirrorBulletDoc = {
  type: 'doc';
  content: [ProseMirrorParagraph];  // ⬅️ tuple 强制 exactly 1 个
};

type ProseMirrorParagraph = {
  type: 'paragraph';
  content?: ProseMirrorInline[];   // 仅 text + marks，无 hardBreak
};

// SingleLineDoc 用于单行字段（PlainTextField / ContactLinesField）
// 与 BulletDoc 不同：content 是 text/inline node 数组，无 paragraph wrapper
type SingleLineDoc = {
  type: 'doc';
  content: ProseMirrorInline[];
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
