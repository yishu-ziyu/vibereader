/**
 * PDF 文本提取服务
 * 替代 Zotero.VibeCard.getMarkdownContent()
 * 使用 pdfjs-dist 提取 PDF 文本内容
 */

import * as pdfjsLib from 'pdfjs-dist';
import { usePdfStore } from './store';
import { useProgressStore } from './store/progressStore';
import { configurePdfWorker } from './pdfWorker';

configurePdfWorker(pdfjsLib);

/**
 * 从 File 对象提取 PDF 文本
 * @param {File} file - PDF 文件
 * @returns {Promise<{text: string, pages: number}>}
 */
export async function extractTextFromPDF(file) {
    const progress = useProgressStore.getState();

    if (!file || !file.type.includes('pdf')) {
        progress.failJob({ code: 'INVALID_FILE', message: '请上传 PDF 文件' }, '文件格式不正确，请上传 PDF 文件。');
        throw new Error('请上传 PDF 文件');
    }

    progress.startJob('正在准备解析 PDF 文件...');
    progress.emitEvent({
        stage: 'queued',
        studentMessage: '文件已接收，正在准备解析资源。',
        technicalMessage: `extractTextFromPDF START file=${file.name} size=${file.size}`,
        metadata: { agent: 'pdf-parser', fileName: file.name },
    });

    try {
        progress.emitEvent({
            stage: 'validation',
            studentMessage: '正在验证 PDF 格式并读取页数...',
            technicalMessage: 'VALIDATION_START reading arrayBuffer',
            metadata: { agent: 'pdf-parser' },
        });

        const sourceBytes = new Uint8Array(await file.arrayBuffer());
        const parserBytes = sourceBytes.slice();
        const viewerBytes = sourceBytes.slice();
        const pdf = await pdfjsLib.getDocument({ data: parserBytes }).promise;
        const numPages = pdf.numPages;

        progress.emitEvent({
            stage: 'validation',
            studentMessage: `PDF 验证通过，共 ${numPages} 页，开始逐页提取。`,
            technicalMessage: `VALIDATION_OK pages=${numPages}`,
            metadata: { agent: 'pdf-parser', totalPages: numPages },
        });

        let fullText = '';
        for (let i = 1; i <= numPages; i++) {
            progress.emitEvent({
                stage: 'render',
                studentMessage: `正在提取第 ${i}/${numPages} 页文本...`,
                technicalMessage: `RENDER page=${i}/${numPages} getPage`,
                metadata: { agent: 'pdf-parser', page: i, totalPages: numPages },
            });

            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            progress.emitEvent({
                stage: 'render',
                studentMessage: `第 ${i}/${numPages} 页提取完成，共 ${textContent.items.length} 个文本块。`,
                technicalMessage: `RENDER page=${i}/${numPages} items=${textContent.items.length}`,
                metadata: { agent: 'pdf-parser', page: i, totalPages: numPages, items: textContent.items.length },
            });

            const pageText = textContent.items
                .map(item => item.str)
                .join(' ');
            fullText += `\n\n--- 第 ${i} 页 ---\n\n${pageText}`;
        }

        progress.emitEvent({
            stage: 'alignment',
            studentMessage: '所有页面提取完成，正在整理文本结构...',
            technicalMessage: `ALIGNMENT_START totalLength=${fullText.length}`,
            metadata: { agent: 'pdf-parser', textLength: fullText.length },
        });

        // Keep a separate byte copy for PdfViewer. pdf.js may transfer/consume the
        // buffer passed to getDocument(), so reusing the parser bytes can render blank.
        usePdfStore.getState().setPdfFile(viewerBytes);

        const result = {
            text: fullText.trim(),
            pages: numPages
        };

        progress.finishJob(result);

        return result;
    } catch (err) {
        console.error('[PdfService] Failed to extract PDF:', err);
        progress.failJob(
            { code: 'EXTRACTION_FAILED', message: err.message, stack: err.stack },
            'PDF 解析过程中出现错误，请检查文件是否损坏或尝试重新上传。'
        );
        throw err;
    }
}

/**
 * 读取用户选择的 PDF 文件
 * @param {HTMLInputElement} inputElement
 * @returns {Promise<File|null>}
 */
export function readPDFFile(inputElement) {
    return new Promise((resolve) => {
        const file = inputElement.files?.[0];
        resolve(file || null);
    });
}
