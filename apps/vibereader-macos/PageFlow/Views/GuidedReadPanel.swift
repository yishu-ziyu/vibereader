//
//  GuidedReadPanel.swift
//  VibeReader
//
//  Left-side 精读向导 (guided-read) panel: asks for a reading goal, walks a
//  route of questions that auto-jump to their cited passages, and clips each
//  answered citation into an exportable 证据夹.
//

import SwiftUI
import AppKit

struct GuidedReadPanel: View {
    @Bindable var guidedReadManager: GuidedReadManager
    var pdfManager: PDFManager
    let onClose: () -> Void

    @State private var copiedFeedback = false
    @FocusState private var goalFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            phaseContent
        }
        .frame(width: 340)
        .pageFlowLiquidGlassPanel(.sidebar)
        .onAppear {
            goalFocused = guidedReadManager.phase == .goal
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("精读向导 · 原型")
                .font(.headline)
                .pageFlowGlassControlLabel()
            Spacer()
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(DesignTokens.sidebarSecondaryText)
                    .frame(width: DesignTokens.tabCloseButtonSize, height: DesignTokens.tabCloseButtonSize)
                    .pageFlowGlassControlLabel()
            }
            .buttonStyle(.plain)
            .contentShape(Rectangle())
        }
        .padding(.leading, DesignTokens.spacingMD)
        .padding(.trailing, DesignTokens.spacingSM)
        .padding(.top, DesignTokens.spacingSM)
    }

    @ViewBuilder
    private var phaseContent: some View {
        switch guidedReadManager.phase {
        case .goal:
            goalContent
        case .route:
            routeContent
        case .done:
            doneContent
        }
    }

    // MARK: - Goal Phase

    private var goalContent: some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacingSM) {
            Text("你读这份材料是为了什么？")
                .font(.callout)
                .foregroundStyle(DesignTokens.sidebarPrimaryText)
            Text("例如「我要给团队讲清这篇论文的核心方法」或「备考，需要掌握概念」")
                .font(.caption2)
                .foregroundStyle(DesignTokens.sidebarTertiaryText)

            TextField("写下你的阅读目的…", text: $guidedReadManager.goal, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.callout)
                .foregroundStyle(DesignTokens.sidebarPrimaryText)
                .lineLimit(1...4)
                .focused($goalFocused)
                .onSubmit(generate)
                .padding(.horizontal, DesignTokens.spacingSM)
                .padding(.vertical, DesignTokens.spacingXS)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.white.opacity(0.7))
                )

            // Quick presets: one tap fills the goal field.
            HStack(spacing: DesignTokens.spacingXS) {
                presetChip("搞懂核心结论")
                presetChip("备考，掌握概念")
            }

            Button(action: generate) {
                HStack(spacing: DesignTokens.spacingXS) {
                    if guidedReadManager.isLoading {
                        ProgressView()
                            .controlSize(.small)
                    }
                    Text(guidedReadManager.isLoading ? "正在生成路线…" : "生成阅读路线")
                        .font(.callout)
                        .fontWeight(.medium)
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, DesignTokens.spacingSM)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(canGenerate ? Color(nsColor: .controlAccentColor) : DesignTokens.sidebarTertiaryText.opacity(0.4))
                )
            }
            .buttonStyle(.plain)
            .disabled(!canGenerate)

            if let error = guidedReadManager.error {
                errorBanner(error)
            }
        }
        .padding(DesignTokens.spacingSM)
    }

    private var canGenerate: Bool {
        guidedReadManager.canGenerate
    }

    private func generate() {
        guidedReadManager.generateRoute()
    }

    private func presetChip(_ text: String) -> some View {
        Button {
            guidedReadManager.goal = text
        } label: {
            Text(text)
                .font(.caption2)
                .foregroundStyle(DesignTokens.sidebarSecondaryText)
                .lineLimit(1)
                .padding(.horizontal, DesignTokens.spacingSM)
                .padding(.vertical, DesignTokens.spacingXS)
                .background(Capsule().fill(Color.white.opacity(0.5)))
        }
        .buttonStyle(.plain)
    }

    // MARK: - Route Phase

    private var answeredCount: Int {
        guidedReadManager.stops.filter { $0.state == .answered }.count
    }

    private var routeContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            progressHeader
            if let error = guidedReadManager.error {
                errorBanner(error)
            }
            stopsList
            evidenceTray
        }
    }

    private var progressHeader: some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacingXS) {
            HStack {
                Text("阅读路线")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(DesignTokens.sidebarPrimaryText)
                Text("第 \(min(guidedReadManager.currentIndex + 1, guidedReadManager.stops.count)) / \(guidedReadManager.stops.count) 站")
                    .font(.caption2)
                    .foregroundStyle(DesignTokens.sidebarTertiaryText)
                Spacer()
                Button {
                    guidedReadManager.reset()
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(DesignTokens.sidebarSecondaryText)
                        .pageFlowGlassControlLabel()
                }
                .buttonStyle(.plain)
                .help("重新开始")
            }
            ProgressView(value: Double(answeredCount), total: Double(max(guidedReadManager.stops.count, 1)))
                .tint(Color(nsColor: .controlAccentColor))
            if !guidedReadManager.goal.isEmpty {
                Text("目的：\(guidedReadManager.goal)")
                    .font(.caption2)
                    .foregroundStyle(DesignTokens.sidebarTertiaryText)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, DesignTokens.spacingSM)
        .padding(.vertical, DesignTokens.spacingXS)
    }

    private var stopsList: some View {
        ScrollView {
            LazyVStack(spacing: DesignTokens.spacingSM) {
                ForEach(Array(guidedReadManager.stops.enumerated()), id: \.element.id) { index, stop in
                    stopRow(stop, at: index)
                }
            }
            .padding(.horizontal, DesignTokens.spacingSM)
            .padding(.vertical, DesignTokens.spacingXS)
        }
        .frame(maxHeight: .infinity)
    }

    @ViewBuilder
    private func stopRow(_ stop: GuidedReadStop, at index: Int) -> some View {
        switch stop.state {
        case .pending:
            pendingStopRow(stop, at: index)
        case .active:
            activeStopCard(stop, at: index)
        case .answered:
            answeredStopRow(stop, at: index)
        }
    }

    private func pendingStopRow(_ stop: GuidedReadStop, at index: Int) -> some View {
        HStack(alignment: .top, spacing: DesignTokens.spacingSM) {
            Text("\(index + 1)")
                .font(.caption2)
                .foregroundStyle(DesignTokens.sidebarTertiaryText)
                .frame(width: 16, height: 16)
                .background(Circle().fill(Color.black.opacity(0.05)))
            Text(stop.question)
                .font(.caption)
                .foregroundStyle(DesignTokens.sidebarTertiaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 2)
    }

    private func answeredStopRow(_ stop: GuidedReadStop, at index: Int) -> some View {
        HStack(alignment: .top, spacing: DesignTokens.spacingSM) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 12))
                .foregroundStyle(Color(nsColor: .controlAccentColor))
                .frame(width: 16, height: 16)
            Text(stop.question)
                .font(.caption)
                .foregroundStyle(DesignTokens.sidebarTertiaryText)
                .strikethrough(true, color: DesignTokens.sidebarTertiaryText)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let citation = stop.citation, citation.page > 0 {
                Text("第\(citation.page)页")
                    .font(.caption2)
                    .foregroundStyle(DesignTokens.sidebarSecondaryText)
            }
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .onTapGesture {
            guidedReadManager.revealStop(at: index)
        }
    }

    private func activeStopCard(_ stop: GuidedReadStop, at index: Int) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacingXS) {
            HStack(alignment: .top, spacing: DesignTokens.spacingXS) {
                Text("\(index + 1)")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                    .frame(width: 16, height: 16)
                    .background(Circle().fill(Color(nsColor: .controlAccentColor)))
                Text(stop.question)
                    .font(.callout)
                    .fontWeight(.medium)
                    .foregroundStyle(DesignTokens.sidebarPrimaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if stop.isResolving {
                HStack(spacing: DesignTokens.spacingXS) {
                    ProgressView()
                        .controlSize(.small)
                    Text("正在定位原文…")
                        .font(.caption2)
                        .foregroundStyle(DesignTokens.sidebarTertiaryText)
                }
            }

            if let loadError = stop.loadError {
                HStack(spacing: DesignTokens.spacingXS) {
                    Label(loadError, systemImage: "exclamationmark.triangle")
                        .font(.caption2)
                        .foregroundStyle(Color.red.opacity(0.8))
                        .lineLimit(2)
                    Spacer()
                    Button("重试") {
                        guidedReadManager.retryStop(at: index)
                    }
                    .font(.caption2)
                    .buttonStyle(.plain)
                    .foregroundStyle(Color(nsColor: .controlAccentColor))
                }
            }

            if !stop.answer.isEmpty {
                Text(stop.answer)
                    .font(.caption)
                    .foregroundStyle(DesignTokens.sidebarPrimaryText)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(DesignTokens.spacingXS)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(Color.white.opacity(0.7))
                    )
            }

            citationLine(stop)

            Button {
                guidedReadManager.markCurrentAnswered()
            } label: {
                Text("读完了，答出来了 ✓")
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(.white)
                    .padding(.horizontal, DesignTokens.spacingMD)
                    .padding(.vertical, DesignTokens.spacingXS)
                    .background(
                        Capsule().fill(Color(nsColor: .controlAccentColor))
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(DesignTokens.spacingSM)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.white.opacity(0.55))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .strokeBorder(Color(nsColor: .controlAccentColor).opacity(0.35), lineWidth: 1)
                )
        )
    }

    @ViewBuilder
    private func citationLine(_ stop: GuidedReadStop) -> some View {
        if stop.noCitation {
            Label("未找到出处", systemImage: "questionmark.circle")
                .font(.caption2)
                .foregroundStyle(DesignTokens.sidebarTertiaryText)
        } else if let citation = stop.citation {
            HStack(spacing: DesignTokens.spacingXS) {
                Image(systemName: "doc.text.magnifyingglass")
                    .font(.system(size: 9))
                    .foregroundStyle(DesignTokens.sidebarSecondaryText)
                Text("\(citation.source.isEmpty ? "原文" : citation.source) · 第\(citation.page)页")
                    .font(.caption2)
                    .foregroundStyle(DesignTokens.sidebarSecondaryText)
                    .lineLimit(1)
                if stop.locateFailed {
                    Text("（已到该页，未精确定位原句）")
                        .font(.caption2)
                        .foregroundStyle(DesignTokens.sidebarTertiaryText)
                }
                Spacer()
                Button("跳回原文") {
                    if let index = guidedReadManager.stops.firstIndex(where: { $0.id == stop.id }) {
                        guidedReadManager.revealStop(at: index)
                    }
                }
                .font(.caption2)
                .buttonStyle(.plain)
                .foregroundStyle(Color(nsColor: .controlAccentColor))
            }
        }
    }

    // MARK: - Evidence Tray (证据夹)

    private var evidenceTray: some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacingXS) {
            HStack {
                Text("证据夹")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(DesignTokens.sidebarPrimaryText)
                Text("\(guidedReadManager.evidence.count)")
                    .font(.caption2)
                    .foregroundStyle(DesignTokens.sidebarTertiaryText)
                Spacer()
            }
            if guidedReadManager.evidence.isEmpty {
                Text("标记「答出来了」的引文会存到这里")
                    .font(.caption2)
                    .foregroundStyle(DesignTokens.sidebarTertiaryText)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: DesignTokens.spacingXS) {
                        ForEach(guidedReadManager.evidence) { item in
                            evidenceRow(item)
                        }
                    }
                }
                .frame(maxHeight: 120)
            }
        }
        .padding(.horizontal, DesignTokens.spacingSM)
        .padding(.vertical, DesignTokens.spacingXS)
        .background(
            Rectangle()
                .fill(Color.black.opacity(0.04))
        )
    }

    private func evidenceRow(_ item: GuidedReadEvidence) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(item.quote)
                .font(.caption2)
                .foregroundStyle(DesignTokens.sidebarPrimaryText)
                .lineLimit(3)
                .textSelection(.enabled)
            HStack {
                Text("— \(item.source) · 第\(item.page)页")
                    .font(.caption2)
                    .foregroundStyle(DesignTokens.sidebarTertiaryText)
                Spacer()
                Button("回到原文") {
                    guidedReadManager.revealEvidence(item)
                }
                .font(.caption2)
                .buttonStyle(.plain)
                .foregroundStyle(Color(nsColor: .controlAccentColor))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(DesignTokens.spacingXS)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.white.opacity(0.7))
        )
    }

    // MARK: - Done Phase

    private var doneContent: some View {
        VStack(alignment: .leading, spacing: DesignTokens.spacingSM) {
            HStack(spacing: DesignTokens.spacingXS) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(Color(nsColor: .controlAccentColor))
                Text("\(guidedReadManager.stops.count) 个问题都答出来了")
                    .font(.callout)
                    .fontWeight(.medium)
                    .foregroundStyle(DesignTokens.sidebarPrimaryText)
            }

            Text("证据夹共收集 \(guidedReadManager.evidence.count) 条引文")
                .font(.caption2)
                .foregroundStyle(DesignTokens.sidebarTertiaryText)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: DesignTokens.spacingXS) {
                    ForEach(guidedReadManager.evidence) { item in
                        evidenceRow(item)
                    }
                }
            }
            .frame(maxHeight: 220)

            if copiedFeedback {
                Text("已复制到剪贴板")
                    .font(.caption2)
                    .foregroundStyle(Color(nsColor: .controlAccentColor))
            }

            HStack(spacing: DesignTokens.spacingSM) {
                Button(action: exportEvidence) {
                    Text("导出证据为 Markdown")
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundStyle(.white)
                        .padding(.horizontal, DesignTokens.spacingMD)
                        .padding(.vertical, DesignTokens.spacingXS)
                        .background(
                            Capsule().fill(
                                guidedReadManager.evidence.isEmpty
                                    ? DesignTokens.sidebarTertiaryText.opacity(0.4)
                                    : Color(nsColor: .controlAccentColor)
                            )
                        )
                }
                .buttonStyle(.plain)
                .disabled(guidedReadManager.evidence.isEmpty)

                Button("重新开始") {
                    guidedReadManager.reset()
                }
                .font(.caption)
                .buttonStyle(.plain)
                .foregroundStyle(DesignTokens.sidebarSecondaryText)
            }
        }
        .padding(DesignTokens.spacingSM)
    }

    private func exportEvidence() {
        let markdown = guidedReadManager.evidenceMarkdown()
        guard !markdown.isEmpty else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(markdown, forType: .string)
        copiedFeedback = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            copiedFeedback = false
        }
    }

    // MARK: - Shared

    private func errorBanner(_ text: String) -> some View {
        HStack(spacing: DesignTokens.spacingXS) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 10))
                .foregroundStyle(DesignTokens.sidebarSecondaryText)
            Text(text)
                .font(.caption2)
                .foregroundStyle(DesignTokens.sidebarSecondaryText)
                .lineLimit(3)
            Spacer()
        }
        .padding(.horizontal, DesignTokens.spacingSM)
        .padding(.vertical, DesignTokens.spacingXS)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.white.opacity(0.5))
        )
        .padding(.horizontal, DesignTokens.spacingSM)
        .padding(.top, DesignTokens.spacingXS)
    }
}
