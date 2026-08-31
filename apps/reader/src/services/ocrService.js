import { createOcrSourceSpans } from '../ocrSourceSpans';

async function loadTesseract() {
    try {
        return await import('tesseract.js');
    } catch (error) {
        throw new Error('OCR 引擎未安装或加载失败，请安装 tesseract.js 后重试。', { cause: error });
    }
}

function extractWords(result) {
    const data = result?.data || result || {};
    return Array.isArray(data.words) ? data.words : [];
}

function normalizeTesseractLanguages(language) {
    if (Array.isArray(language)) return language;
    if (typeof language !== 'string') return 'eng';
    const languages = language.split('+').map((item) => item.trim()).filter(Boolean);
    return languages.length > 1 ? languages : (languages[0] || 'eng');
}

async function recognizeWithTesseract(image, lang) {
    const tesseract = await loadTesseract();
    if (typeof tesseract.createWorker !== 'function') {
        throw new Error('当前 tesseract.js 版本缺少 createWorker API。');
    }

    const worker = await tesseract.createWorker(normalizeTesseractLanguages(lang));
    try {
        return await worker.recognize(image);
    } finally {
        if (typeof worker.terminate === 'function') {
            await worker.terminate();
        }
    }
}

export async function recognizeCurrentPdfPage({
    canvas,
    documentId,
    page,
    language = 'chi_sim+eng',
    engine = 'tesseract.js',
    recognizer,
} = {}) {
    if (!canvas) throw new Error('OCR 需要当前 PDF 页面 canvas。');
    const runRecognizer = recognizer || recognizeWithTesseract;

    const result = await runRecognizer(canvas, language);
    return createOcrSourceSpans({
        documentId,
        page,
        engine,
        words: extractWords(result),
    });
}
