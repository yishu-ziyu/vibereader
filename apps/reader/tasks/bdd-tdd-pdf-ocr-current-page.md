# PDF 当前页 OCR BDD

日期：2026-06-02

## 行为规则

### B1：扫描 PDF 仍应进入阅读器

Given 用户上传的 PDF 没有可选文字层
When PDF.js 能正常渲染页面 canvas
Then 阅读器应显示该 PDF 页面、翻页和缩放控件
And 不应只显示“无法提取 PDF text”的空状态

业务规则：看得见的 PDF 就应该能先读，文字层缺失只是需要 OCR 的状态。

### B2：OCR 必须由用户显式触发

Given 当前页没有可选文字层
When 用户看到该页
Then 系统显示“识别当前页”入口
And 不自动开始 OCR

业务规则：OCR 是重计算，且可能涉及隐私和等待时间，必须由用户主动启动。

### B3：OCR 结果必须成为可追溯 source span

Given 用户点击“识别当前页”
When OCR 成功返回 words / bbox / confidence
Then 系统在当前页生成虚拟 text layer
And 每个 span 包含 `documentId`、`page`、`bbox`、`source=ocr`、`engine`、`confidence`
And 用户后续划词、生成 Lens Card、回到原文仍走同一套 source span 结构

业务规则：OCR 文本不是一坨普通文本，而是带页码和区域锚点的阅读来源。

### B4：已有文字层时要给出明确状态

Given 当前页已经有 PDF 原生文字层
When 用户打开该页
Then 系统显示“当前页可划词”状态
And 不显示“识别当前页”入口

业务规则：用户需要知道这页不需要 OCR，而是可以直接划词进入 Lens Card / Summary 等后续动作。

## 边界

- 第一版只做当前页 OCR，不做全文 OCR。
- Web 端用浏览器 OCR；桌面端 LiteParse/Rust 是后续增强。
- OCR 失败要明确提示，不假装已经理解扫描页。
- 本切片不自动调用 LLM，不自动生成 Lens Card。
