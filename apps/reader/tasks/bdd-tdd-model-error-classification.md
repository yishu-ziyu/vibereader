# BDD/TDD：模型请求错误归因

## 背景

PRD 要求模型配置错误、坏 key、代理/CORS 失败、provider 不可用都要给出可理解提示。前端已有配置缺项校验和浏览器 fetch 错误分类，但 Tauri native HTTP 路径会把非 2xx 响应包装成普通 Error。如果 App 只按错误文本分类，401/403/503 这类状态会退化成 UNKNOWN。

本切片只补请求失败后的错误归因，不改模型配置表单。

## 行为 1：Tauri 401 归因为坏 API Key

Given 桌面端通过 Tauri native HTTP 调用模型服务
And provider 返回 HTTP 401
When `chatStream` 把错误传给 UI
Then 最后一条 chunk 应包含 `errorCode: UNAUTHORIZED`
And 用户看到的是“API Key 无效”类提示，而不是“未知错误”
And 后端返回的原始 key 文本不能进入用户提示

业务规则：坏 key 是用户可操作问题，必须直说要检查 Key。

## 行为 2：Tauri 503 归因为 provider 不可用

Given provider 返回 HTTP 503
When `chatStream` 把错误传给 UI
Then 最后一条 chunk 应包含 `errorCode: PROVIDER_UNAVAILABLE`
And 用户看到的是模型服务暂不可用或服务繁忙类提示
And 提示用户稍后重试或切换模型

业务规则：provider 不可用不是本地配置缺项，不能误导用户去补 base URL 或 API Key。

## 行为 3：浏览器 CORS / Failed to fetch 仍归因为 CORS

Given Web 端浏览器 fetch 被跨域或代理问题阻断
When fetch 抛出 `TypeError: Failed to fetch`
Then UI 应显示 CORS / 代理配置类提示
And 不应泄露请求 header 或 API Key

业务规则：Web 端和桌面端失败路径不同，但都要给可执行下一步。
