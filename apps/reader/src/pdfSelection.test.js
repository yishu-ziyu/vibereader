import { describe, expect, it } from 'vitest';
import {
    didPointerDrag,
    denormalizePageRects,
    isInsidePdfAnnotationToolbar,
    isSelectionInsidePdfTextLayer,
    normalizePageRects,
} from './pdfSelection';

describe('PDF selection helpers', () => {
    it('preserves the active PDF selection while focus is inside the annotation toolbar', () => {
        document.body.innerHTML = `
            <div class="pdf-annotation-toolbar">
                <input id="note-input" />
            </div>
        `;

        expect(isInsidePdfAnnotationToolbar(document.querySelector('#note-input'))).toBe(true);
    });

    it('does not preserve PDF selection for unrelated focused elements', () => {
        document.body.innerHTML = '<input id="chat-input" />';

        expect(isInsidePdfAnnotationToolbar(document.querySelector('#chat-input'))).toBe(false);
        expect(isInsidePdfAnnotationToolbar(null)).toBe(false);
    });

    it('accepts a selection whose range intersects the PDF text layer', () => {
        document.body.innerHTML = `
            <div id="text-layer">
                <span>First selected phrase</span>
                <span>second selected phrase</span>
            </div>
        `;
        const textLayer = document.querySelector('#text-layer');
        const range = document.createRange();
        range.setStart(textLayer.firstElementChild.firstChild, 6);
        range.setEnd(textLayer.lastElementChild.firstChild, 6);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        expect(isSelectionInsidePdfTextLayer(selection, textLayer)).toBe(true);
    });

    it('rejects collapsed or outside selections', () => {
        document.body.innerHTML = `
            <div id="text-layer"><span>PDF text</span></div>
            <p id="outside">Chat text</p>
        `;
        const textLayer = document.querySelector('#text-layer');
        const outside = document.querySelector('#outside');
        const range = document.createRange();
        range.selectNodeContents(outside);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        expect(isSelectionInsidePdfTextLayer(selection, textLayer)).toBe(false);

        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        expect(isSelectionInsidePdfTextLayer(selection, textLayer)).toBe(false);
    });

    it('treats pointer movement above the threshold as a drag instead of a paragraph click', () => {
        expect(didPointerDrag({ clientX: 20, clientY: 20 }, { clientX: 23, clientY: 23 })).toBe(false);
        expect(didPointerDrag({ clientX: 20, clientY: 20 }, { clientX: 30, clientY: 23 })).toBe(true);
        expect(didPointerDrag(null, { clientX: 30, clientY: 23 })).toBe(false);
    });

    it('normalizes multi-line selection rects against the rendered page size', () => {
        const rects = normalizePageRects([
            { left: 20, top: 40, width: 120, height: 16 },
            { left: 20, top: 60, width: 80, height: 16 },
        ], { width: 400, height: 800 });

        expect(rects).toEqual([
            { left: 0.05, top: 0.05, width: 0.3, height: 0.02 },
            { left: 0.05, top: 0.075, width: 0.2, height: 0.02 },
        ]);
    });

    it('replays normalized source rects into the current page viewport', () => {
        const rects = denormalizePageRects([
            { left: 0.05, top: 0.05, width: 0.3, height: 0.02 },
            { left: 0.05, top: 0.075, width: 0.2, height: 0.02 },
        ], { width: 600, height: 900 });

        expect(rects).toEqual([
            { left: 30, top: 45, width: 180, height: 18 },
            { left: 30, top: 67.5, width: 120, height: 18 },
        ]);
    });
});
