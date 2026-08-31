# BDD/TDD：Web 端刷新后的文档与阅读产物持久化入口

日期：2026-06-11

## 业务目标

Phase 11 要求 Web 端先闭环。浏览器路径下如果刷新后连文档记录都丢失，用户无法回到同一文档，也就无法验证 artifacts / annotations 是否按文档保留。本切片先补浏览器 runtime 的 document record localStorage fallback，作为 Web 持久化闭环入口；Tauri runtime 继续走 Rust SQLite。

## 行为 1：浏览器刷新后最近文档仍可恢复

Given 用户在浏览器 Web app 打开过一个文档

When 应用保存 document record

And 页面刷新后重新初始化

Then `listPersistentDocuments()` 能从浏览器本地存储恢复该文档记录

And App 左侧 Recent documents 可以显示该记录

业务规则：Web 端不能只依赖 Tauri SQLite；浏览器开发/演示路径也必须有最小可恢复入口。

## 行为 2：多个文档按最近打开排序且不互相覆盖

Given 用户先后打开两个不同文档

When 两个 document records 都写入浏览器本地存储

Then 最近打开的文档排在前面

And 另一个文档仍保留

业务规则：多文档隔离的第一层是 document id 不冲突，不能每次打开都覆盖整份历史。

## 行为 3：浏览器 fallback 不影响 Tauri SQLite 路径

Given 当前运行在 Tauri runtime

When 保存或读取 document records

Then 仍通过现有 Tauri command / Rust SQLite 路径执行

业务规则：Web fallback 只补浏览器路径，不削弱桌面端 Rust-backed local data layer。

## 行为 4：重新打开同一文件复用同一 document id

Given 用户在浏览器 Web app 中打开过一份本地文件

And 该文档已经产生 artifacts 或 annotations

When 页面刷新后用户重新选择同一份文件

Then 新打开的 document id 必须和上一次一致

And 同一 document id 下的 artifacts / annotations 才能自动恢复

业务规则：document id 不能包含 `Date.now()` 这种每次打开都会变化的值；否则 Web 持久化数据虽然存在，但无法匹配回原文档。

## 边界说明

- 本切片只持久化 document metadata，不持久化 PDF binary 或全文内容。
- artifacts / annotations 已有 localStorage fallback，本切片补齐刷新后能发现最近文档的入口和同文件重开匹配能力。
- 最近文档记录是恢复入口，不自动打开缺少正文内容的文档。
- 已用 `e2e/web-persistence.spec.js` 覆盖“刷新后重新打开同一文档，artifacts / annotations 自动显示，其他文档数据保持隐藏”。
