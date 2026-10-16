//
//  GuidedReadManager.swift
//  VibeReader
//
//  Per-tab state for the 精读向导 (guided-read) panel: turns a reading goal into
//  a route of questions, drives each stop's citation jump + AI hint, and clips
//  answered citations into an evidence list the user can export.
//

import Foundation
import Observation
import OSLog
import PDFKit

/// One stop on the guided-read route: a question to answer, the AI hint +
/// citation that locate it in the document, and where the reader stands.
struct GuidedReadStop: Identifiable, Equatable {
    enum State: Equatable {
        case pending
        case active
        case answered
    }

    let id = UUID()
    let question: String
    var state: State = .pending

    /// One-sentence plain-language hint returned by `query` (its `answer`).
    var answer = ""
    /// First citation from `query`; the jump target for `revealCitation`.
    var citation: UniRAGCitation?
    /// True while this stop's `query` is in flight.
    var isResolving = false
    /// The query came back with no usable citation — show 未找到出处, don't jump.
    var noCitation = false
    /// The citation pointed at a page but the passage wasn't located in the text.
    var locateFailed = false
    /// Per-stop failure when `query` throws; the stop can still be marked answered.
    var loadError: String?
}

/// One clipped passage in the 证据夹 — the citation's original sentence plus
/// where it lives. Exported as `{quote} — {source} · 第X页`.
struct GuidedReadEvidence: Identifiable, Equatable {
    let id = UUID()
    let quote: String
    let source: String
    let page: Int       // 1-based
    let question: String
}

/// Drives the left-side 精读向导 panel for one tab. Owned by `TabSession` so it
/// travels with the tab between windows and tears down on close. Holds the tab's
/// `pdfManager` (same lifetime — injected at init, never swapped) so each stop's
/// activation can reveal its citation without the view threading it through.
@Observable
@MainActor
final class GuidedReadManager {
    // MARK: - Observable state

    /// The reader's goal ("你读这份材料是为了什么？"), bound to the input field.
    var goal = ""

    private(set) var stops: [GuidedReadStop] = []
    private(set) var currentIndex = 0
    private(set) var evidence: [GuidedReadEvidence] = []
    private(set) var phase: Phase = .goal
    /// True while `suggest-questions` is generating the route.
    private(set) var isLoading = false
    /// Route-level error (suggest failure / service offline). The route falls
    /// back to generic questions so the flow still completes.
    private(set) var error: String?

    enum Phase: Equatable {
        case goal      // asking for the reading goal
        case route     // walking the question route
        case done      // every stop answered
    }

    // MARK: - Private

    @ObservationIgnored private let logger = Logger(subsystem: "com.pageflow", category: "GuidedRead")
    @ObservationIgnored private let pdfManager: PDFManager
    @ObservationIgnored private let client = UniRAGClient()
    /// Bumped on every new route / reset so in-flight query results for a stale
    /// route are dropped instead of written into the new stops.
    @ObservationIgnored private var routeToken = UUID()
    @ObservationIgnored private var suggestTask: Task<Void, Never>?
    @ObservationIgnored private var resolveTask: Task<Void, Never>?
    /// Identity of the document the route was built for, deduped like
    /// `UniRAGChatManager.currentDocumentKey` (path-based).
    @ObservationIgnored private var currentDocumentKey: String?

    /// Questions used when `suggest-questions` fails or returns nothing, so the
    /// guided flow still works end-to-end without the LLM call.
    static let fallbackQuestions = [
        "这份材料的核心问题是什么？",
        "作者用了哪些关键论据或方法来支撑结论？",
        "读完之后我能把它用在什么地方？",
    ]

    init(pdfManager: PDFManager) {
        self.pdfManager = pdfManager
    }

    // MARK: - Lifecycle

    /// Called when the tab's document changes. A different document invalidates
    /// the route; reloading the same path is a no-op.
    func documentChanged(fileURL: URL?) {
        let key = fileURL?.path
        guard key != currentDocumentKey else { return }
        currentDocumentKey = key
        reset()
    }

    /// Back to the goal phase; cancels in-flight work and drops stale results.
    func reset() {
        routeToken = UUID()
        suggestTask?.cancel()
        resolveTask?.cancel()
        suggestTask = nil
        resolveTask = nil
        stops = []
        evidence = []
        currentIndex = 0
        isLoading = false
        error = nil
        phase = .goal
    }

    /// Ordered teardown when the tab is closed.
    func cleanup() {
        reset()
        currentDocumentKey = nil
    }

    // MARK: - Route generation

    var canGenerate: Bool {
        !goal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isLoading
    }

    /// Generates the question route from the reader's goal + the document text,
    /// then activates the first stop (which reveals its citation).
    func generateRoute() {
        let trimmed = goal.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isLoading else { return }

        isLoading = true
        error = nil
        routeToken = UUID()
        let token = routeToken
        let text = buildSuggestText(goal: trimmed)

        suggestTask = Task {
            do {
                let response = try await client.suggestQuestions(
                    text: text,
                    apiKey: UniRAGKeychain.get(UniRAGKeychain.llmAccount)
                )
                guard token == routeToken else { return }
                let questions = response.questions
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                logger.info("suggest-questions returned \(questions.count) questions")
                startRoute(questions: questions.isEmpty ? Self.fallbackQuestions : questions)
            } catch let suggestError {
                guard token == routeToken else { return }
                // Service offline / LLM failure — keep the flow walkable on the
                // generic questions and say why it isn't tailored.
                logger.warning("suggest-questions failed: \(suggestError.localizedDescription); using fallback")
                error = "未能生成定制路线（\(suggestError.localizedDescription)），已改用通用问题"
                startRoute(questions: Self.fallbackQuestions)
            }
            isLoading = false
        }
    }

    /// Assembled `text` for suggest-questions: the goal plus a document excerpt,
    /// truncated before the backend's own 3000-char cap.
    private func buildSuggestText(goal: String) -> String {
        let documentText = pdfManager.document?.string ?? ""
        let combined = "用户的阅读目的：\(goal)\n\n文档内容：\n" + documentText
        return String(combined.prefix(2800))
    }

    private func startRoute(questions: [String]) {
        stops = questions.prefix(4).map { GuidedReadStop(question: $0) }
        evidence = []
        currentIndex = 0
        phase = .route
        activateStop(at: 0)
    }

    // MARK: - Stop activation

    /// Activates the stop at `index`: marks it active, asks the knowledge base,
    /// then reveals the first citation in the PDF (same jump as the chat panel's
    /// `jumpToCitation`: UniRAG pages are 1-based, PDFManager is 0-based).
    private func activateStop(at index: Int) {
        guard phase == .route, stops.indices.contains(index) else { return }
        currentIndex = index
        stops[index].state = .active
        stops[index].isResolving = true

        let token = routeToken
        let question = stops[index].question
        resolveTask = Task {
            do {
                let response = try await client.query(question: question, sessionId: nil)
                guard token == routeToken,
                      stops.indices.contains(index),
                      stops[index].state == .active else { return }
                stops[index].answer = response.answer
                if let citation = response.citations.first,
                   citation.page > 0, citation.page <= pdfManager.pageCount {
                    stops[index].citation = citation
                    let found = pdfManager.revealCitation(citation.text, onPage: citation.page - 1)
                    stops[index].locateFailed = !found
                    logger.info("stop \(index) citation page=\(citation.page) reveal=\(found)")
                } else {
                    stops[index].noCitation = true
                    logger.info("stop \(index) has no usable citation")
                }
            } catch {
                guard token == routeToken,
                      stops.indices.contains(index),
                      stops[index].state == .active else { return }
                logger.warning("stop \(index) query failed: \(error.localizedDescription)")
                stops[index].loadError = error.localizedDescription
            }
            if token == routeToken, stops.indices.contains(index) {
                stops[index].isResolving = false
            }
        }
    }

    /// Re-reveals a stop's citation in the PDF (tap a stop to jump back to it).
    func revealStop(at index: Int) {
        guard stops.indices.contains(index),
              let citation = stops[index].citation,
              citation.page > 0, citation.page <= pdfManager.pageCount else { return }
        let found = pdfManager.revealCitation(citation.text, onPage: citation.page - 1)
        stops[index].locateFailed = !found
    }

    /// Re-runs the active stop's query after a failure (the 重试 button).
    func retryStop(at index: Int) {
        guard phase == .route,
              stops.indices.contains(index),
              stops[index].state == .active,
              !stops[index].isResolving else { return }
        stops[index].loadError = nil
        activateStop(at: index)
    }

    // MARK: - Answering

    /// Marks the current stop answered: clips its citation into the 证据夹 (when
    /// there is one), then advances to the next pending stop or finishes.
    func markCurrentAnswered() {
        guard phase == .route, stops.indices.contains(currentIndex) else { return }
        let stop = stops[currentIndex]
        if let citation = stop.citation, citation.page > 0 {
            evidence.append(GuidedReadEvidence(
                quote: citation.text,
                source: citation.source.isEmpty ? documentName : citation.source,
                page: citation.page,
                question: stop.question
            ))
        }
        stops[currentIndex].state = .answered
        stops[currentIndex].isResolving = false

        if let next = stops.indices.first(where: { stops[$0].state == .pending }) {
            activateStop(at: next)
        } else {
            phase = .done
        }
    }

    // MARK: - Evidence

    private var documentName: String {
        pdfManager.documentURL?.lastPathComponent ?? "当前文档"
    }

    /// Re-jumps to the passage an evidence clip came from (the 回到原文 link —
    /// same `revealCitation` mechanism as a stop reveal).
    func revealEvidence(_ item: GuidedReadEvidence) {
        guard item.page > 0, item.page <= pdfManager.pageCount else { return }
        _ = pdfManager.revealCitation(item.quote, onPage: item.page - 1)
    }

    /// The 证据夹 rendered as Markdown lines: `{quote} — {source} · 第X页`.
    func evidenceMarkdown() -> String {
        evidence.map { item in
            "\(item.quote) — \(item.source) · 第\(item.page)页"
        }.joined(separator: "\n")
    }
}
