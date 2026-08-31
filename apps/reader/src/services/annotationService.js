import {
    createPersistentAnnotation,
    listPersistentAnnotations,
} from './persistentStorage';

// R2 存储单轨化：批注唯一持久化路径是 persistentStorage（Tauri → SQLite）。
// 浏览器 localStorage 回退已删除；非 Tauri 运行时由 persistentStorage
// 返回安全 no-op。

export async function createAnnotation(input) {
    const annotation = {
        id: `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        documentId: input.documentId,
        page: input.page,
        selectedText: input.selectedText,
        note: input.note || '',
        color: input.color || 'yellow',
        rect: input.rect || null,
        createdAt: Date.now(),
    };

    return createPersistentAnnotation(annotation);
}

export async function listAnnotationsForDocument(documentId) {
    return listPersistentAnnotations(documentId);
}
