import { describe, expect, it, vi } from 'vitest';
import {
  extractAllParagraphs,
  extractParagraphsFromPage,
  groupParagraphsBySection,
} from './paragraphExtractor';

function item(str, x, y, options = {}) {
  return {
    str,
    width: options.width ?? str.length * 5,
    height: options.height ?? 10,
    transform: [10, 0, 0, 10, x, y],
    fontName: options.fontName ?? 'BodyFont',
    hasEOL: options.hasEOL ?? false,
  };
}

describe('paragraphExtractor', () => {
  it('merges same-paragraph text items in reading order', () => {
    const paragraphs = extractParagraphsFromPage(
      {
        items: [
          item('line', 45, 687, { hasEOL: true }),
          item('First', 10, 700),
          item('paragraph', 40, 700, { hasEOL: true }),
          item('second', 10, 687),
        ],
      },
      2
    );

    expect(paragraphs).toEqual([
      expect.objectContaining({
        id: 'page-2-para-0',
        text: 'First paragraph second line',
        page: 2,
        y: 700,
        fontName: 'BodyFont',
        fontSize: 10,
      }),
    ]);
  });

  it('splits paragraphs when hasEOL is followed by a large y gap', () => {
    const paragraphs = extractParagraphsFromPage(
      {
        items: [
          item('Opening paragraph.', 10, 700, { hasEOL: true }),
          item('Next paragraph.', 10, 660, { hasEOL: true }),
        ],
      },
      1
    );

    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'Opening paragraph.',
      'Next paragraph.',
    ]);
    expect(paragraphs.map((paragraph) => paragraph.id)).toEqual([
      'page-1-para-0',
      'page-1-para-1',
    ]);
  });

  it('splits paragraphs on strong font-size changes and first-line indentation', () => {
    const paragraphs = extractParagraphsFromPage(
      {
        items: [
          item('Heading', 10, 720, { fontName: 'HeadingFont', height: 16, hasEOL: true }),
          item('Body starts here.', 10, 700, { fontName: 'BodyFont', height: 10, hasEOL: true }),
          item('Indented quotation.', 60, 684, { fontName: 'BodyFont', height: 10, hasEOL: true }),
        ],
      },
      3
    );

    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual([
      'Heading',
      'Body starts here.',
      'Indented quotation.',
    ]);
  });

  it('returns no paragraphs for empty text content', () => {
    expect(extractParagraphsFromPage({ items: [] }, 4)).toEqual([]);
    expect(extractParagraphsFromPage(null, 4)).toEqual([]);
  });

  it('extracts all paragraphs from a PDF document and reports progress', async () => {
    const onProgress = vi.fn();
    const pdfDoc = {
      numPages: 2,
      getPage: vi.fn(async (pageNum) => ({
        getTextContent: vi.fn(async () => ({
          items: [item(`Page ${pageNum}`, 10, 700, { hasEOL: true })],
        })),
      })),
    };

    const paragraphs = await extractAllParagraphs(pdfDoc, onProgress);

    expect(paragraphs.map((paragraph) => paragraph.text)).toEqual(['Page 1', 'Page 2']);
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });

  it('groups paragraphs by VIBE section page ranges', () => {
    const paragraphs = [
      { id: 'p1', text: 'Intro paragraph', page: 1 },
      { id: 'p2', text: 'Method paragraph', page: 2 },
      { id: 'p3', text: 'Result paragraph', page: 3 },
    ];
    const sections = [
      { id: 'sec-intro', title: 'Introduction', pageStart: 1, pageEnd: 1 },
      { id: 'sec-method', title: 'Methods', pageStart: 2, pageEnd: 3 },
    ];

    expect(groupParagraphsBySection(paragraphs, sections)).toEqual([
      {
        sectionId: 'sec-intro',
        title: 'Introduction',
        paragraphs: [paragraphs[0]],
      },
      {
        sectionId: 'sec-method',
        title: 'Methods',
        paragraphs: [paragraphs[1], paragraphs[2]],
      },
    ]);
  });
});
