//
//  UniRAGModels.swift
//  VibeReader
//
//  Codable models matching the UniRAG HTTP API (reader-unirag-memory-v1 contract).
//

import Foundation

// MARK: - Query

struct UniRAGQueryRequest: Codable {
    let question: String
    var sessionId: String?
    var topK: Int = 5
    var style: String = "academic"
    var includeMemory: Bool = false

    enum CodingKeys: String, CodingKey {
        case question
        case sessionId = "session_id"
        case topK = "top_k"
        case style
        case includeMemory = "include_memory"
    }
}

struct UniRAGQueryResponse: Codable {
    let answer: String
    let citations: [UniRAGCitation]
    let sessionId: String?

    enum CodingKeys: String, CodingKey {
        case answer
        case citations
        case sessionId = "session_id"
    }
}

struct UniRAGCitation: Codable, Identifiable, Equatable {
    let chunkId: String
    let source: String
    let section: String
    let page: Int
    let text: String
    let span: [Int]?
    let sourceType: String?

    var id: String { chunkId }

    /// 1-based page number; 0 means unknown.
    var displayPage: Int { page }

    enum CodingKeys: String, CodingKey {
        case chunkId = "chunk_id"
        case source
        case section
        case page
        case text
        case span
        case sourceType = "source_type"
    }
}

// MARK: - Suggest Questions (精读向导)

/// `POST /api/suggest-questions`. `api_key` is optional: the backend falls back
/// to the provider key from the sidecar environment (`UNI_RAG_LLM_API_KEY`,
/// injected from the Keychain at launch). Sending it explicitly only matters
/// for a UniRAG that wasn't launched by the app.
struct UniRAGSuggestQuestionsRequest: Encodable {
    let text: String
    var apiKey: String?
    var provider: String = "minimax"

    enum CodingKeys: String, CodingKey {
        case text
        case apiKey = "api_key"
        case provider
    }
}

struct UniRAGSuggestQuestionsResponse: Decodable {
    let questions: [String]
}

// MARK: - Ingest

struct UniRAGIngestJobStart: Codable {
    let jobId: String
    let statusUrl: String

    enum CodingKeys: String, CodingKey {
        case jobId = "job_id"
        case statusUrl = "status_url"
    }
}

struct UniRAGIngestJobStatus: Codable {
    let jobId: String
    let status: String
    let step: String
    let percent: Int
    let message: String
    let filename: String
    let result: UniRAGIngestResult?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case jobId = "job_id"
        case status
        case step
        case percent
        case message
        case filename
        case result
        case error
    }
}

struct UniRAGIngestResult: Codable {
    let sourceId: String
    let chunks: Int
    let format: String
    let filename: String

    enum CodingKeys: String, CodingKey {
        case sourceId = "source_id"
        case chunks
        case format
        case filename
    }
}

// MARK: - Documents

struct UniRAGDocumentInfo: Codable, Identifiable {
    let filename: String
    let chunks: Int
    let format: String
    let sourceId: String?

    var id: String { sourceId ?? filename }

    enum CodingKeys: String, CodingKey {
        case filename
        case chunks
        case format
        case sourceId = "source_id"
    }
}

struct UniRAGDocumentList: Codable {
    let documents: [UniRAGDocumentInfo]
}

struct UniRAGDocumentDeleteResult: Codable {
    let sourceId: String
    let chunksDeleted: Int

    enum CodingKeys: String, CodingKey {
        case sourceId = "source_id"
        case chunksDeleted = "chunks_deleted"
    }
}

// MARK: - Health

struct UniRAGHealth: Codable {
    let status: String
}

// MARK: - Memory (saved_artifact contract, camelCase aliases per server schema)

struct UniRAGMemoryRequest: Encodable {
    let memory: UniRAGMemoryPayload
}

struct UniRAGMemoryPayload: Encodable {
    let source = "vibereader"
    let kind = "saved_artifact"
    let artifactId: String
    let artifactType: String
    let title: String
    let document: UniRAGMemoryDocument
    let verificationStatus: String
    let sourceRefs: [UniRAGMemorySourceRef]
    let content: UniRAGMemoryContent
    let text: String
    let createdAt: Int
    let savedAt: Int
    let contractVersion = "reader-unirag-memory-v1"
}

struct UniRAGMemoryDocument: Encodable {
    let id: String
    let name: String
    let kind: String
}

struct UniRAGMemorySourceRef: Encodable {
    let documentName: String
    let page: Int?
    let chunkId: String
    let label: String
    let text: String
}

struct UniRAGMemoryContent: Encodable {
    var question: String = ""
    var answer: String = ""
    var body: String = ""
}

struct UniRAGMemoryJobStart: Decodable {
    let jobId: String
    let status: String

    enum CodingKeys: String, CodingKey {
        case jobId = "job_id"
        case status
    }
}
