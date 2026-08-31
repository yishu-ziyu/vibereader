// Phase-1-contract-stabilization Reader-side contract test.
// Pins the Reader side of the `reader-unirag-memory-v1` contract against the
// shared fixtures at contracts/reader-unirag-memory/v1/. Covers both the
// request side (buildSavedMemoryPayload → POST /api/memory/jobs) and the
// response side (UniRAG /api/query citations → normalized sourceRefs),
// including contractVersion propagation and defaulting semantics.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSavedMemoryPayload } from './savedMemoryService';
import { createUniRagHttpAdapter } from './ragEngineAdapter';

/**
 * D2：优先读 VIBEREADER_CONTRACTS_DIR 环境变量（与 UniRAG 侧同名约定）。
 * 支持指向 v1 fixture 目录本身，或指向包含 reader-unirag-memory/v1 的 contracts 根目录。
 * 未设置或路径无效时返回 null，回退到相对路径向上查找。
 */
function contractsDirFromEnv() {
    let fromEnv = '';
    try {
        fromEnv = String(process.env?.VIBEREADER_CONTRACTS_DIR || '').trim();
    } catch {
        // 无 process 环境时忽略
    }
    if (!fromEnv) return null;
    const candidates = [
        fromEnv,
        join(fromEnv, 'reader-unirag-memory', 'v1'),
    ];
    for (const candidate of candidates) {
        try {
            readFileSync(join(candidate, 'README.md'), 'utf-8');
            return candidate;
        } catch {
            // 尝试下一个候选路径
        }
    }
    return null;
}

function contractsDir() {
    const fromEnv = contractsDirFromEnv();
    if (fromEnv) return fromEnv;

    let here = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 10; i += 1) {
        const candidates = [
            join(here, 'packages', 'shared-contracts', 'reader-unirag-memory', 'v1'),
            join(here, 'contracts', 'reader-unirag-memory', 'v1'),
        ];
        for (const candidate of candidates) {
            try {
                readFileSync(join(candidate, 'README.md'), 'utf-8');
                return candidate;
            } catch {
                // Try the next compatibility path.
            }
        }
        here = dirname(here);
    }
    throw new Error('reader-unirag-memory/v1 contract fixtures not found');
}

function loadFixture(name) {
    return JSON.parse(readFileSync(join(contractsDir(), name), 'utf-8'));
}

// Artifact + document that corresponds to saved-answer-card.json's memory
// fields. buildSavedMemoryPayload(artifact, document) should reproduce the
// fixture's key fields when Date.now() is pinned to the fixture's savedAt.
const savedAnswerArtifact = {
    id: 'art-explain-001',
    documentId: 'doc-sample-md',
    type: 'explain_card',
    goal: '监督学习的定义',
    verificationStatus: 'grounded',
    createdAt: 1735900000,
    currentContent: {
        question: '什么是监督学习？',
        answer: '监督学习是使用标注数据训练模型的机器学习方法。',
        keyPoints: ['使用标注数据', '训练模型'],
        sourceRefs: [
            {
                documentId: 'doc-sample-md',
                documentName: 'sample.md',
                page: 1,
                paragraphId: 'p-1',
                chunkId: 'chunk-001',
                label: 'P1',
                text: '监督学习使用标注数据训练模型。',
                grounding: {
                    precision: 'paragraph',
                    matchedBy: 'text',
                    score: 0.92,
                },
            },
        ],
    },
};
const savedAnswerDocument = {
    id: 'doc-sample-md',
    name: 'sample.md',
    kind: 'md',
    fingerprint: 'sha256:abc123',
};

describe('reader-unirag-memory-v1 contract', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('builds a memory payload that matches the saved-answer-card contract fixture', () => {
        const fixture = loadFixture('saved-answer-card.json');
        // Pin Date.now so savedAt matches the fixture's deterministic value.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(fixture.memory.savedAt));

        const payload = buildSavedMemoryPayload(savedAnswerArtifact, savedAnswerDocument);

        expect(payload.contractVersion).toBe('reader-unirag-memory-v1');
        expect(payload).toEqual(expect.objectContaining({
            source: fixture.memory.source,
            kind: fixture.memory.kind,
            artifactId: fixture.memory.artifactId,
            artifactType: fixture.memory.artifactType,
            title: fixture.memory.title,
            document: expect.objectContaining({
                id: fixture.memory.document.id,
                name: fixture.memory.document.name,
            }),
            sourceRefs: [
                expect.objectContaining({
                    documentId: fixture.memory.sourceRefs[0].documentId,
                }),
            ],
            createdAt: fixture.memory.createdAt,
            savedAt: fixture.memory.savedAt,
        }));
    });

    it('ingests a memory payload carrying contractVersion to UniRAG adapter', async () => {
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                job_id: 'job-x',
                status_url: '/api/memory/jobs/job-x',
                status: 'completed',
            }),
        }));
        const adapter = createUniRagHttpAdapter({
            fetchImpl,
            ingestTimeoutMs: 10,
        });

        const memory = buildSavedMemoryPayload(savedAnswerArtifact, savedAnswerDocument);
        expect(memory.contractVersion).toBe('reader-unirag-memory-v1');

        await adapter.ingestMemory({ memory });

        expect(fetchImpl).toHaveBeenCalledWith(
            expect.stringContaining('/api/memory/jobs'),
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ memory }),
            })
        );
    });

    it('normalizes a saved_memory citation and preserves contractVersion', async () => {
        const fixtureResponse = loadFixture('query-response-with-saved-memory.json');
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => fixtureResponse,
        }));
        const adapter = createUniRagHttpAdapter({
            fetchImpl,
            queryTimeoutMs: 10,
        });

        const result = await adapter.query({
            question: '什么是监督学习？',
            includeMemory: true,
        });

        const memoryRef = result.sourceRefs.find((ref) => ref.evidenceType === 'memory');
        expect(memoryRef).toBeTruthy();
        expect(memoryRef).toEqual(expect.objectContaining({
            evidenceType: 'memory',
            sourceType: 'saved_memory',
            artifactId: 'art-explain-001',
            memoryId: '2dc412ad66a34e1396141b3de449eb93',
            memoryTitle: '监督学习的定义',
            contractVersion: 'reader-unirag-memory-v1',
        }));
        expect(Array.isArray(memoryRef.sourceRefs)).toBe(true);
    });

    it('defaults contractVersion to v1 when UniRAG omits the field', async () => {
        const fixtureResponse = loadFixture('query-response-with-saved-memory.json');
        const modified = JSON.parse(JSON.stringify(fixtureResponse));
        const memoryCitation = modified.citations.find((c) => c.source_type === 'saved_memory');
        delete memoryCitation.contract_version;
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => modified,
        }));
        const adapter = createUniRagHttpAdapter({
            fetchImpl,
            queryTimeoutMs: 10,
        });

        const result = await adapter.query({
            question: '什么是监督学习？',
            includeMemory: true,
        });

        const memoryRef = result.sourceRefs.find((ref) => ref.evidenceType === 'memory');
        expect(memoryRef).toBeTruthy();
        expect(memoryRef.contractVersion).toBe('reader-unirag-memory-v1');
    });

    it('normalizes an unresolved memory citation and keeps the missing artifactId', async () => {
        const citation = loadFixture('citation-unresolved.json');
        const queryResponse = {
            answer: '这条记忆对应的卡片已被删除。',
            session_id: 's1',
            citations: [citation],
        };
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => queryResponse,
        }));
        const adapter = createUniRagHttpAdapter({
            fetchImpl,
            queryTimeoutMs: 10,
        });

        const result = await adapter.query({
            question: '已删除的笔记',
            includeMemory: true,
        });

        const memoryRef = result.sourceRefs.find((ref) => ref.evidenceType === 'memory');
        expect(memoryRef).toBeTruthy();
        expect(memoryRef).toEqual(expect.objectContaining({
            artifactId: 'art-deleted-999',
            evidenceType: 'memory',
            sourceType: 'saved_memory',
            contractVersion: 'reader-unirag-memory-v1',
        }));
    });

    it('document-only citations are unaffected by the memory contract', async () => {
        const fixtureResponse = loadFixture('query-response-with-saved-memory.json');
        const docOnly = {
            answer: fixtureResponse.answer,
            session_id: fixtureResponse.session_id,
            citations: fixtureResponse.citations.filter((c) => c.source_type !== 'saved_memory'),
        };
        const fetchImpl = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => docOnly,
        }));
        const adapter = createUniRagHttpAdapter({
            fetchImpl,
            queryTimeoutMs: 10,
        });

        const result = await adapter.query({
            question: '什么是监督学习？',
        });

        expect(result.sourceRefs).toHaveLength(1);
        const sourceRef = result.sourceRefs[0];
        expect(sourceRef).toEqual(expect.objectContaining({
            evidenceType: 'source',
            sourceType: 'document',
        }));
        expect(sourceRef).not.toHaveProperty('contractVersion');
    });
});
