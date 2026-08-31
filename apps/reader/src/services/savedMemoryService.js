import { createUniRagHttpAdapter } from './ragEngineAdapter';
import { savePersistentTask } from './persistentStorage';

export const SAVED_MEMORY_INGEST_TASK_TYPE = 'saved_memory_ingest';

const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_MAX_POLLS = 120;

const INGESTIBLE_ARTIFACT_TYPES = new Set([
    'explain_card',
    'lens_card',
    'evidence_card',
    'concept_card',
    'concept',
    'reading_note',
]);

function nowMs(value) {
    return typeof value === 'number' ? value : Date.now();
}

function artifactContent(artifact = {}) {
    return artifact.currentContent || artifact.originalContent || {};
}

function artifactTitle(artifact = {}) {
    return artifact.goal || artifact.title || artifactContent(artifact).title || artifact.type || 'Saved memory';
}

function sourceRefsForArtifact(artifact = {}) {
    const content = artifactContent(artifact);
    const refs = Array.isArray(content.sourceRefs) ? content.sourceRefs : [];
    const source = artifact.source || content.source;
    return refs.length > 0 ? refs : (source ? [source] : []);
}

function compactSourceRef(sourceRef = {}) {
    return {
        documentId: sourceRef.documentId || '',
        documentName: sourceRef.documentName || '',
        page: sourceRef.page || null,
        paragraphId: sourceRef.paragraphId || '',
        chunkId: sourceRef.chunkId || '',
        label: sourceRef.label || '',
        text: sourceRef.text || sourceRef.sourceText || sourceRef.selectedText || '',
        grounding: sourceRef.grounding || null,
    };
}

function linesFromContent(content = {}) {
    const lines = [];
    if (content.question) lines.push(`Question: ${content.question}`);
    if (content.answer) lines.push(`Answer: ${content.answer}`);
    if (content.summary) lines.push(`Summary: ${content.summary}`);
    if (content.explanation) lines.push(`Explanation: ${content.explanation}`);
    if (content.description) lines.push(`Description: ${content.description}`);
    if (content.body) lines.push(String(content.body));
    if (content.userNote) lines.push(`User note: ${content.userNote}`);
    if (content.selectionText) lines.push(`Source selection: ${content.selectionText}`);
    if (content.sourceText) lines.push(`Source text: ${content.sourceText}`);
    if (Array.isArray(content.keyPoints) && content.keyPoints.length > 0) {
        lines.push('Key points:', ...content.keyPoints.map((point) => `- ${point}`));
    }
    if (Array.isArray(content.claims) && content.claims.length > 0) {
        lines.push('Claims:', ...content.claims.map((claim) => `- ${claim.text || claim}`));
    }
    return lines
        .map((line) => String(line || '').trim())
        .filter(Boolean);
}

function memoryMarkdownForArtifact(artifact = {}, document = {}) {
    const content = artifactContent(artifact);
    const sourceRefs = sourceRefsForArtifact(artifact).map(compactSourceRef);
    const lines = [
        `# ${artifactTitle(artifact)}`,
        '',
        `- Type: ${artifact.type || 'artifact'}`,
        `- Document: ${document.name || document.title || artifact.documentId || 'Untitled'}`,
        `- Verification: ${artifact.verificationStatus || 'ungrounded'}`,
        ...sourceRefs.map((sourceRef, index) => {
            const precision = sourceRef.grounding?.precision || (sourceRef.paragraphId ? 'paragraph' : sourceRef.page ? 'page' : 'document');
            return `- Source ${index + 1}: ${sourceRef.label || `P${sourceRef.page || '?'}`} (${precision})`;
        }),
        '',
        ...linesFromContent(content),
    ];
    return lines.join('\n').trim();
}

function taskIdForArtifact(artifactId) {
    return `task-saved-memory-ingest-${artifactId}`;
}

function taskStatusForIngestStatus(status = '') {
    if (status === 'completed') return 'succeeded';
    if (status === 'failed') return 'failed';
    if (status === 'queued') return 'pending';
    return 'running';
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function emitStatus(onStatus, status) {
    if (typeof onStatus === 'function') onStatus(Object.freeze({ ...status }));
}

export function canIngestSavedMemoryArtifact(artifact = {}) {
    if (!artifact?.id || !artifact?.documentId) return false;
    if (!INGESTIBLE_ARTIFACT_TYPES.has(artifact.type || '')) return false;
    return Boolean(memoryMarkdownForArtifact(artifact).trim());
}

export function buildSavedMemoryPayload(artifact = {}, document = {}) {
    const content = artifactContent(artifact);
    const sourceRefs = sourceRefsForArtifact(artifact).map(compactSourceRef);
    return Object.freeze({
        source: 'vibereader',
        kind: 'saved_artifact',
        artifactId: artifact.id || '',
        artifactType: artifact.type || 'artifact',
        title: artifactTitle(artifact),
        document: Object.freeze({
            id: document.id || artifact.documentId || '',
            name: document.name || document.title || '',
            kind: document.kind || '',
            fingerprint: document.fingerprint || null,
        }),
        verificationStatus: artifact.verificationStatus || 'ungrounded',
        sourceRefs: Object.freeze(sourceRefs.map((sourceRef) => Object.freeze(sourceRef))),
        content: Object.freeze({
            question: content.question || '',
            answer: content.answer || '',
            summary: content.summary || '',
            explanation: content.explanation || '',
            body: content.body || '',
            userNote: content.userNote || '',
            keyPoints: Array.isArray(content.keyPoints) ? Object.freeze([...content.keyPoints]) : Object.freeze([]),
            claims: Array.isArray(content.claims) ? Object.freeze([...content.claims]) : Object.freeze([]),
        }),
        text: memoryMarkdownForArtifact(artifact, document),
        createdAt: artifact.createdAt || Date.now(),
        savedAt: Date.now(),
        // contractVersion (phase-1-contract-stabilization): marks which
        // Reader↔UniRAG memory contract this payload obeys. UniRAG accepts
        // both contractVersion (alias) and contract_version.
        contractVersion: 'reader-unirag-memory-v1',
    });
}

async function recordMemoryTask(artifact = {}, document = {}, patch = {}) {
    if (!artifact?.id) return null;
    const now = nowMs(patch.updatedAt);
    return savePersistentTask({
        id: taskIdForArtifact(artifact.id),
        documentId: artifact.documentId || document.id || null,
        type: SAVED_MEMORY_INGEST_TASK_TYPE,
        title: '记忆沉淀',
        payload: {
            artifactId: artifact.id,
            artifactType: artifact.type,
            artifactTitle: artifactTitle(artifact),
            documentId: artifact.documentId || document.id || '',
            documentName: document.name || document.title || '',
            engine: 'uni-rag',
        },
        createdAt: nowMs(patch.createdAt || artifact.createdAt || now),
        updatedAt: now,
        ...patch,
    }).catch((error) => {
        console.warn('[savedMemoryService] Failed to record saved memory task:', error);
        return null;
    });
}

export async function startSavedMemoryIngest(options = {}) {
    const {
        artifact,
        document = {},
        adapter = createUniRagHttpAdapter(),
        onStatus,
        pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
        maxPolls = DEFAULT_MAX_POLLS,
        shouldContinue = () => true,
    } = options;

    if (!artifact?.id) {
        throw new Error('Saved memory ingest requires an artifact with id.');
    }
    if (!canIngestSavedMemoryArtifact(artifact)) {
        throw new Error('Saved memory ingest requires a supported saved artifact with text content.');
    }

    const memory = buildSavedMemoryPayload(artifact, document);
    const startedAt = Date.now();
    emitStatus(onStatus, {
        status: 'queued',
        percent: 1,
        message: '正在沉淀到知识记忆',
        artifactId: artifact.id,
        documentId: artifact.documentId || document.id || null,
    });
    await recordMemoryTask(artifact, document, {
        status: 'pending',
        progress: 1,
        startedAt,
    });

    try {
        const start = await adapter.ingestMemory({ memory });
        await recordMemoryTask(artifact, document, {
            status: 'running',
            progress: 10,
            startedAt,
            result: {
                jobId: start.jobId,
                statusUrl: start.statusUrl,
            },
        });

        if (!start.jobId && start.status === 'completed') {
            await recordMemoryTask(artifact, document, {
                status: 'succeeded',
                progress: 100,
                startedAt,
                completedAt: Date.now(),
                result: { status: 'completed' },
            });
            emitStatus(onStatus, {
                status: 'completed',
                percent: 100,
                message: '已沉淀到知识记忆',
                artifactId: artifact.id,
                documentId: artifact.documentId || document.id || null,
            });
            return start;
        }

        for (let pollCount = 0; pollCount < maxPolls; pollCount += 1) {
            if (!shouldContinue()) return null;
            if (pollCount > 0 && pollIntervalMs > 0) {
                await sleep(pollIntervalMs);
            }
            if (!shouldContinue()) return null;

            const latest = await adapter.getMemoryIngestStatus(start.jobId);
            const completed = latest.status === 'completed';
            const failed = latest.status === 'failed';
            const taskStatus = taskStatusForIngestStatus(latest.status);
            const updatedAt = Date.now();

            emitStatus(onStatus, {
                ...latest,
                artifactId: artifact.id,
                documentId: artifact.documentId || document.id || null,
            });
            await recordMemoryTask(artifact, document, {
                status: taskStatus,
                progress: Math.max(0, Math.min(100, Number(latest.percent || 0))),
                result: {
                    jobId: start.jobId,
                    statusUrl: start.statusUrl,
                    memoryId: latest.result?.memory_id || latest.result?.memoryId || null,
                    chunks: latest.result?.chunks || 0,
                },
                errorMessage: latest.error || (failed ? latest.message : null),
                startedAt,
                completedAt: completed || failed ? updatedAt : null,
            });

            if (completed) return latest;
            if (failed) {
                throw new Error(latest.error || latest.message || 'Saved memory ingest failed.');
            }
        }

        throw new Error('Saved memory ingest timed out.');
    } catch (error) {
        const failedAt = Date.now();
        await recordMemoryTask(artifact, document, {
            status: 'failed',
            progress: 100,
            errorMessage: error?.message || String(error),
            startedAt,
            completedAt: failedAt,
        });
        emitStatus(onStatus, {
            status: 'failed',
            percent: 100,
            message: '记忆沉淀失败',
            error: error?.message || String(error),
            artifactId: artifact.id,
            documentId: artifact.documentId || document.id || null,
        });
        throw error;
    }
}
