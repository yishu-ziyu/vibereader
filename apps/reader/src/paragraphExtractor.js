const LINE_Y_TOLERANCE = 2;
const EMPTY_LINE_GAP_RATIO = 1.5;
const FONT_SIZE_CHANGE_THRESHOLD = 2;
const INDENT_EM_MULTIPLIER = 2;

function getItemPosition(item) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  return {
    x: Number(transform[4]) || 0,
    y: Number(transform[5]) || 0,
  };
}

function getFontSize(item) {
  const transform = Array.isArray(item?.transform) ? item.transform : [];
  return Math.abs(Number(transform[3])) || Number(item?.height) || 10;
}

function normalizeItems(items = []) {
  return items
    .filter((item) => typeof item?.str === 'string' && item.str.trim())
    .map((item) => ({
      ...item,
      ...getItemPosition(item),
      fontSize: getFontSize(item),
      text: item.str.trim(),
    }))
    .sort((a, b) => (Math.abs(a.y - b.y) <= LINE_Y_TOLERANCE ? a.x - b.x : b.y - a.y));
}

function formatLineText(items) {
  return items
    .map((item) => item.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?，。；：！？])/g, '$1')
    .trim();
}

function createLine(items) {
  const ordered = [...items].sort((a, b) => a.x - b.x);
  const first = ordered[0];
  return {
    text: formatLineText(ordered),
    x: Math.min(...ordered.map((item) => item.x)),
    y: first.y,
    fontName: first.fontName || '',
    fontSize: Math.max(...ordered.map((item) => item.fontSize)),
    hasEOL: ordered.some((item) => item.hasEOL),
  };
}

function buildLines(items) {
  const lines = [];
  let current = [];
  items.forEach((item) => {
    const sameLine = current.length > 0 && Math.abs(current[0].y - item.y) <= LINE_Y_TOLERANCE;
    if (current.length > 0 && !sameLine) {
      lines.push(createLine(current));
      current = [];
    }
    current.push(item);
  });
  if (current.length > 0) lines.push(createLine(current));
  return lines.filter((line) => line.text);
}

function startsNewParagraph(prevLine, nextLine) {
  const lineHeight = Math.max(prevLine.fontSize, nextLine.fontSize, 1);
  const yGap = Math.abs(prevLine.y - nextLine.y);
  const fontChanged =
    prevLine.fontName !== nextLine.fontName &&
    Math.abs(prevLine.fontSize - nextLine.fontSize) > FONT_SIZE_CHANGE_THRESHOLD;
  const indented = nextLine.x - prevLine.x > lineHeight * INDENT_EM_MULTIPLIER;
  return (prevLine.hasEOL && yGap > lineHeight * EMPTY_LINE_GAP_RATIO) || fontChanged || indented;
}

function createParagraph(lines, pageNum, index) {
  const first = lines[0];
  return {
    id: `page-${pageNum}-para-${index}`,
    text: lines.map((line) => line.text).join(' ').replace(/\s+/g, ' ').trim(),
    page: pageNum,
    y: first.y,
    fontName: first.fontName,
    fontSize: first.fontSize,
  };
}

/**
 * 从单页 textContent 提取段落。
 * @param {object} textContent - pdf.js getTextContent() 结果
 * @param {number} pageNum - 页码
 * @returns {Array<{id, text, page, y, fontName, fontSize}>}
 */
export function extractParagraphsFromPage(textContent, pageNum) {
  const lines = buildLines(normalizeItems(textContent?.items));
  if (lines.length === 0) return [];

  const paragraphs = [];
  let currentLines = [lines[0]];
  lines.slice(1).forEach((line) => {
    if (startsNewParagraph(currentLines[currentLines.length - 1], line)) {
      paragraphs.push(createParagraph(currentLines, pageNum, paragraphs.length));
      currentLines = [];
    }
    currentLines.push(line);
  });
  paragraphs.push(createParagraph(currentLines, pageNum, paragraphs.length));
  return paragraphs;
}

/**
 * 从完整 PDF 提取所有段落。
 * @param {PDFDocumentProxy} pdfDoc - pdf.js 文档对象
 * @param {Function} onProgress - (current, total) => void
 * @returns {Promise<Array<{id, text, page, y}>>}
 */
export async function extractAllParagraphs(pdfDoc, onProgress) {
  if (!pdfDoc?.numPages || typeof pdfDoc.getPage !== 'function') return [];

  const paragraphs = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum += 1) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    paragraphs.push(...extractParagraphsFromPage(textContent, pageNum));
    if (onProgress) onProgress(pageNum, pdfDoc.numPages);
  }
  return paragraphs;
}

/**
 * 按章节分组段落。
 * @param {Array} paragraphs - 段落列表
 * @param {Array} sections - vibeParser 解析的章节列表
 * @returns {Array<{sectionId, title, paragraphs: [...]}>}
 */
export function groupParagraphsBySection(paragraphs = [], sections = []) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return [{ sectionId: 'body', title: 'Body', paragraphs }];
  }

  return sections.map((section, index) => {
    const nextSection = sections[index + 1];
    const pageStart = section.pageStart || 1;
    const pageEnd = section.pageEnd || (nextSection?.pageStart ? nextSection.pageStart - 1 : Infinity);
    return {
      sectionId: section.id || `section-${index}`,
      title: section.title || `Section ${index + 1}`,
      paragraphs: paragraphs.filter((paragraph) => paragraph.page >= pageStart && paragraph.page <= pageEnd),
    };
  });
}
