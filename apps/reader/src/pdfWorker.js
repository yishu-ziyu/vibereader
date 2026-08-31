export function getPdfWorkerSrc() {
    return new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
}

export function configurePdfWorker(pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = getPdfWorkerSrc();
}

