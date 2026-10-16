//
//  UniRAGClient.swift
//  VibeReader
//
//  HTTP client for the local UniRAG service (127.0.0.1:8766).
//

import Foundation

enum UniRAGClientError: LocalizedError {
    case notReachable
    case badResponse(Int)
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .notReachable:
            return "知识库服务未运行（无法连接 127.0.0.1:8766）"
        case .badResponse(let code):
            return "知识库服务返回异常（HTTP \(code)）"
        case .serverError(let message):
            return message
        }
    }
}

/// Thin async wrapper over the UniRAG REST API. Stateless — all session
/// continuity is carried by the caller via `session_id`.
struct UniRAGClient: Sendable {
    var baseURL = URL(string: "http://127.0.0.1:8766")!

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 600
        return URLSession(configuration: config)
    }()

    // MARK: - Health

    func health() async -> Bool {
        guard let url = URL(string: "/api/health", relativeTo: baseURL) else { return false }
        do {
            let (data, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return false }
            let health = try JSONDecoder().decode(UniRAGHealth.self, from: data)
            return health.status == "ok"
        } catch {
            return false
        }
    }

    // MARK: - Query

    func query(
        question: String,
        sessionId: String?,
        includeMemory: Bool = false
    ) async throws -> UniRAGQueryResponse {
        let body = UniRAGQueryRequest(
            question: question,
            sessionId: sessionId,
            includeMemory: includeMemory
        )
        return try await post("/api/query", body: body)
    }

    // MARK: - Suggest Questions (精读向导)

    /// Asks the service to turn a document excerpt + reading goal into a list of
    /// guiding questions. `apiKey` may be nil — the backend then resolves the
    /// provider key from its own environment.
    func suggestQuestions(
        text: String,
        apiKey: String? = nil,
        provider: String = "minimax"
    ) async throws -> UniRAGSuggestQuestionsResponse {
        try await post(
            "/api/suggest-questions",
            body: UniRAGSuggestQuestionsRequest(text: text, apiKey: apiKey, provider: provider)
        )
    }

    // MARK: - Ingest (job-based)

    func startIngest(fileData: Data, filename: String) async throws -> UniRAGIngestJobStart {
        guard let url = URL(string: "/api/ingest/jobs", relativeTo: baseURL) else {
            throw UniRAGClientError.notReachable
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        let boundary = "vibereader-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = multipartBody(fileData: fileData, filename: filename, boundary: boundary)

        return try await perform(request)
    }

    func ingestJobStatus(jobId: String) async throws -> UniRAGIngestJobStatus {
        try await get("/api/ingest/jobs/\(jobId)")
    }

    // MARK: - Documents

    func listDocuments() async throws -> UniRAGDocumentList {
        try await get("/api/documents")
    }

    /// Removes a document and all its index artifacts (vectors, BM25,
    /// sidecar, uploaded file) from the knowledge base.
    func deleteDocument(sourceId: String) async throws {
        let encoded = sourceId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? sourceId
        guard let url = URL(string: "/api/documents/\(encoded)", relativeTo: baseURL) else {
            throw UniRAGClientError.notReachable
        }
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        let _: UniRAGDocumentDeleteResult = try await perform(request)
    }

    // MARK: - Memory

    /// Persists a memory entry (saved_artifact contract). Synchronous on the
    /// server side — a "completed" status means it's stored.
    func saveMemory(_ payload: UniRAGMemoryPayload) async throws -> UniRAGMemoryJobStart {
        try await post("/api/memory/jobs", body: UniRAGMemoryRequest(memory: payload))
    }

    // MARK: - Internals

    private func get<T: Decodable>(_ path: String) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw UniRAGClientError.notReachable
        }
        let (data, response) = try await session.data(from: url)
        return try decode(data, response: response)
    }

    private func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw UniRAGClientError.notReachable
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return try await perform(request)
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        return try decode(data, response: response)
    }

    private func decode<T: Decodable>(_ data: Data, response: URLResponse) throws -> T {
        guard let http = response as? HTTPURLResponse else {
            throw UniRAGClientError.notReachable
        }
        guard (200..<300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? ""
            throw UniRAGClientError.serverError(
                detail.isEmpty ? "知识库服务返回错误（HTTP \(http.statusCode)）" : detail
            )
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func multipartBody(fileData: Data, filename: String, boundary: String) -> Data {
        var body = Data()
        let lineBreak = "\r\n"
        body.append("--\(boundary)\(lineBreak)")
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\(lineBreak)")
        body.append("Content-Type: application/pdf\(lineBreak)\(lineBreak)")
        body.append(fileData)
        body.append("\(lineBreak)--\(boundary)--\(lineBreak)")
        return body
    }
}

private extension Data {
    mutating func append(_ string: String) {
        append(Data(string.utf8))
    }
}
