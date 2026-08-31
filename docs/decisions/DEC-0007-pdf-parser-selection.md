# DEC-0007: PDF 解析技术方案选型（基于 PDF 本体的最优质路径）

## 状态
已决策（基于 L1 实测证据）。待执行：启用本地 MinerU pipeline。

## 背景
用户报告拖入 PDF 后解析极烂。实证定位：用户那篇 "iBot 大赛..." PDF 为**图片型
（无文本层）**——PyMuPDF `get_text` 仅抽到 87 字赞赏区文字，正文 0。根因在 PDF
本体，非代码逻辑。用户硬性约束：解析必须基于 PDF 本体（后端对原始字节操作）。

## 候选方案与实测证据（全部来自本机真实运行，非记忆）
| 方案 | 实测结果 | 证据 |
|------|---------|------|
| PyMuPDF `get_text` | ❌ 87字/正文0 | 直跑落盘PDF |
| tesseract chi_sim | ❌ 两页空 | 对页面截图OCR |
| MinerU cloud API | ❌ 认证失败 | `mineru.net/api/v4` 返回 A0202 |
| MinerU 本地 pipeline | ⚠️ 缺 torchvision | 日志 ModuleNotFoundError |
| MinerU hybrid/vlm-http-client | ❌ 无 OpenAI 兼容 VLM | MiniMax/Step 是 Anthropic 协议；本地 proxy 未启用(KEY为空) |
| **MinerU 本地 pipeline（补依赖）** | ⏳ 理论可行 | mineru 3.4.0 已装，仅需 torchvision+模型权重 |

## 决策
选用 **MinerU 本地 pipeline backend**（`-m ocr -b pipeline`）作为 PDF 解析主方案。
- 理由：开源 PDF 解析 SOTA（视觉+OCR+公式+表格），支持图片型 PDF；本地离线，
  不依赖外部 API/凭证；在你环境已装 mineru 3.4.0，只需补齐 torchvision 与模型权重。
- 解析器自动降级：PyMuPDF 抽到文本过短（阈值待定，建议 <50字/页）时，自动切换到
  MinerU OCR 路径；MinerU 失败则保留 PyMuPDF 结果并告警。
- 前端 pdfjs 显示逻辑不动（显示与入库解析解耦）。

## 为什么不选其他
- cloud：token 认证失败，不可用。
- http-client：当前无 OpenAI 兼容 VLM 端点（MiniMax/Step 为 Anthropic 协议，proxy 未配）。
- tesseract/PyMuPDF：已证对此类 PDF 无效。

## 执行风险
- R1 模型权重下载体积大（GB 级），需网络与时间。
- R2 torchvision 与现有 venv(python3.13) 兼容性，需实测。
- R3 本地 pipeline 推理需 Apple Silicon GPU/MPS 或足够 CPU，速度待验证。

## 反模式（不做什么）
- 不靠前端 pdfjs 抽文本当正文入库（已证烂）。
- 不依赖 cloud MinerU（凭证不通）。
- 不引入 tesseract 替换（已证无效）。
