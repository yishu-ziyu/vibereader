# VibeReader Design System

> Extracted from Vibero visual analysis + Esther Design System brand DNA.
> Tool-page (App scene) functional interface — high information density, visually restrained, interaction-first.

---

## 1. Page Type

**App型 / 功能型页面** — PDF 阅读器 + AI 辅助工作区。
不是 Landing Page，不是营销展示。视觉服务于功能，装饰最小化。

---

## 2. Audience & Tone

| 维度 | 定义 |
|------|------|
| **受众** | 科研人员、学生、知识工作者 — 需要长时间专注阅读 |
| **气质** | Warm-tech（温暖科技）— 不像冷冰冰的 SaaS，也不像幼儿风 |
| **核心感受** | 专注、品质、可信、有设计师眼光 |
| **禁忌** | 看起来像 AI 生成的通用模板、glassmorphism、neon、bounce 动效 |

---

## 3. Layout

### 容器体系
| 层级 | 宽度/行为 |
|------|----------|
| 全局背景 | 100vw, 100vh, 无 max-width |
| 内容区 | 自适应分栏（PDF 左 / AI 右），min-width 各 360px |
| 卡片内 | padding: `clamp(12px, 1.5vw, 20px)` |
| Section gap | 功能区间距紧凑，无大留白 |

### 导航
- Sticky top bar (48px)，始终可见
- 无侧边栏（桌面端），移动端底栏 Tab

---

## 4. Color

### 品牌固定三色（Esther DNA）
| 色名 | 色值 | 用途 | 比例 |
|------|------|------|------|
| **蓝** | `#2B7FD8` | 主交互色、激活态、链接、重点 | 60% |
| **黄/金** | `#F4D758` | 强调、高亮、徽章、选中态 | 30% |
| **红** | `#E84A5F` | 点缀、危险操作、标签 | 10% |

### 功能色板（Vibero 式分层）
| Token | 浅色模式 | 暗夜模式 | 用途 |
|-------|---------|---------|------|
| `--bg-base` | `#fefcf6` | `#0d1117` | 页面底层背景 |
| `--bg-elevated` | `#ffffff` | `#161b22` | 卡片、面板浮层 |
| `--bg-sunken` | `#faf6eb` | `#151821` | 侧边栏、次级面板 |
| `--text-primary` | `#1a1a2e` | `#ffffffe5` | 主文字 |
| `--text-secondary` | `#4a4a5a` | `#ffffff8c` | 次级文字 |
| `--text-tertiary` | `#888` | `#ffffff4d` | 辅助/禁用 |
| `--border-subtle` | `rgba(26,26,26,0.06)` | `rgba(255,255,255,0.1)` | 分割线、边框 |
| `--border-focus` | `#2B7FD8` | `#4072e5` | Focus 态边框 |

### Glow 体系（借鉴 Vibero，暖化适配）
| Token | 值 |
|-------|-----|
| `--glow-blue` | `0 0 20px rgba(43,127,216,0.25)` |
| `--glow-yellow` | `0 0 16px rgba(244,215,88,0.3)` |
| `--glow-card` | `0 2px 12px rgba(0,0,0,0.04)` |
| `--glow-card-hover` | `0 8px 24px rgba(0,0,0,0.08)` |

---

## 5. Typography

| 层级 | 字体 | 字号 | 字重 | 用途 |
|------|------|------|------|------|
| 品牌标题 | `Fraunces` (italic) + `Noto Serif SC` | `clamp(1.5rem, 3vw, 2rem)` | 700 | 面板标题、Section 标题 |
| UI 标题 | `Inter` / system-ui | `14–16px` | 600 | 卡片标题、Tab 文字 |
| 正文 | `Inter` / `-apple-system` | `14px` | 400 | 内容、描述 |
| 辅助 | `Inter` | `12px` | 400 | 元信息、时间戳 |
| 代码 | `Fira Code`, `SFMono-Regular` | `13px` | 400 | 代码块 |

---

## 6. Components

### 6.1 Button

**Primary CTA（Vibero pill + Esther blue）**
```css
.btn-primary {
  background: #2B7FD8;
  color: #fff;
  border-radius: 9999px;
  border: 1px solid rgba(43,127,216,0.5);
  padding: 10px 28px;
  font-weight: 500;
  box-shadow: 0 0 20px rgba(43,127,216,0.25);
  transition: all 0.2s ease;
}
.btn-primary:hover {
  background: #1e6bc2;
  box-shadow: 0 0 28px rgba(43,127,216,0.4);
  transform: translateY(-1px);
}
```

**Secondary（Ghost）**
```css
.btn-ghost {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 9999px;
  padding: 8px 20px;
}
```

**Icon Button**
```css
.btn-icon {
  width: 36px; height: 36px;
  border-radius: 9999px;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.15s;
}
.btn-icon:hover {
  background: rgba(43,127,216,0.08);
  color: #2B7FD8;
}
```

### 6.2 Card / Panel

**标准卡片（Esther white + Vibero shadow layering）**
```css
.card {
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid rgba(26,26,26,0.06);
  box-shadow: 0 2px 12px rgba(0,0,0,0.04);
  padding: 16px;
  transition: transform 0.2s, box-shadow 0.2s;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.08);
}
```

**高亮卡片（Pro tier glow）**
```css
.card-highlight {
  border: 1px solid rgba(43,127,216,0.3);
  box-shadow: 0 0 0 1px rgba(43,127,216,0.1), 0 4px 16px rgba(43,127,216,0.08);
}
```

### 6.3 Tab Bar

```css
.tab-bar {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid rgba(26,26,26,0.06);
  background: var(--bg-elevated);
}
.tab {
  padding: 10px 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
  color: var(--text-tertiary);
}
.tab.active {
  border-bottom-color: #2B7FD8;
  color: #2B7FD8;
  font-weight: 600;
}
```

### 6.4 Input / Sender

```css
.input {
  border: 1.5px solid rgba(26,26,26,0.1);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.input:focus {
  outline: none;
  border-color: #2B7FD8;
  box-shadow: 0 0 0 3px rgba(43,127,216,0.1);
}
```

### 6.5 Insight / Tag Card

**彩色左边框卡片（Attention Navigator）**
```css
.insight-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px 16px;
  border-left: 3px solid var(--insight-color);
  box-shadow: 0 1px 4px rgba(0,0,0,0.03);
  transition: all 0.15s;
}
.insight-card:hover {
  background: rgba(43,127,216,0.03);
  transform: translateX(2px);
}
```

| Insight 类型 | 左边框色 |
|-------------|---------|
| 创新点 | `#52c41a` (绿) |
| 方法亮点 | `#2B7FD8` (品牌蓝) |
| 关键对比 | `#A855F7` (紫) |
| 实验反常 | `#F59E0B` (橙) |

### 6.6 Tag / Pill

```css
.pill-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background: rgba(43,127,216,0.08);
  color: #2B7FD8;
}
```

### 6.7 Selection / Highlight

```css
::selection {
  background: #F4D758;
  color: #1a1a1a;
}
```

---

## 7. Texture

| 质感 | 规则 |
|------|------|
| **阴影** | 不使用 heavy shadow。卡片用 `0 2px 12px rgba(0,0,0,0.04)`，hover 加深。 |
| **圆角** | 卡片 12px，按钮 Pill（9999px），输入框 10px，小标签 6px。 |
| **边框** | 极细 `rgba(26,26,26,0.06)`，不用实色边框。高亮卡片用 glow 边框替代。 |
| **半透明** | 仅用于 hover 态背景（`rgba(43,127,216,0.06)`）和 disabled 态。 |
| **纹理** | 无噪点、无网格背景（功能页不需要）。 |

---

## 8. Motion

| 场景 | 规则 |
|------|------|
| **Hover** | `transform: translateY(-2px)` + shadow 加深，0.2s ease。 |
| **Focus** | Blue glow ring `0 0 0 3px rgba(43,127,216,0.1)`，无 outline。 |
| **Active/Press** | `scale(0.98)`，0.1s。 |
| **页面切换** | 无 scroll reveal，功能页即时加载。 |
| **Pulse** | 仅用于段落锚定高亮（黄色 pulse 1s × 3 次）。 |
| **尊重** | `prefers-reduced-motion` — 所有 transform/animation 在媒体查询内可被禁用。 |

---

## 9. Responsive

| 断点 | 行为 |
|------|------|
| **> 980px** | 左右分栏，PDF 左 / AI 右，可拖拽调整宽度。 |
| **≤ 980px** | 上下堆叠，PDF 上 / AI 下。 |
| **≤ 600px** | 字号微缩，Tab 改为底部固定导航，输入框简化。 |

---

## 10. Forbidden List

| 类型 | 禁止项 |
|------|--------|
| 配色 | 纯黑 `#000`、纯白 `#fff`（作为大面积背景）、neon、蓝紫渐变、AI 冷灰蓝调 |
| 字体 | Inter/Roboto 作为品牌字体（仅允许作为 UI 辅助字体） |
| 布局 | 所有 section 居中、千篇一律卡片网格、cards 嵌套 cards |
| 动效 | bounce/elastic、animate width/height、无限循环动画、scroll reveal |
| 装饰 | glassmorphism、渐变文字、AI 光效、无意义装饰图 |
| 整体 | 看起来像 AI 生成的通用模板、generic Landing Page 模板感 |

---

*Design direction: Esther's warm brand DNA + Vibero's refined component craft.*
