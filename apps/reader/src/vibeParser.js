/**
 * VIBE Parser - Visual, Interactive, Block, Extract
 * Heuristic parser for academic paper structure.
 * Takes raw PDF text and outputs structured representation.
 */

// ─── Regex Patterns ──────────────────────────────────────────────────────────

const PAGE_MARKER_RE = /---\s*第\s*(\d+)\s*页\s*---/;
const SECTION_NUMBERED_RE = /^(\d+(?:\.\d+)*)(?:\s+[.\-])?\s+(.+)$/;
const SECTION_WORD_RE = /^(Abstract|摘要|Introduction|介绍|Intro|Background|背景|Related\s+Work|相关工作|Methods?|方法|Methodology|方法论|Experiments?|实验|Results?|结果|Discussion|讨论|Conclusion|结论|Concluding\s+Remarks|Future\s+Work|Acknowledgments?|致谢|References?|参考文献|Appendix|附录|Supplementary\s+Material)$/i;
const FIGURE_RE = /(?:Figure|Fig\.?|图)\s*(\d+[a-zA-Z]?)[.:\s]*([^\n]*)/gi;
const TABLE_RE = /(?:Table|表)\s*(\d+[a-zA-Z]?)[.:\s]*([^\n]*)/gi;
const EQUATION_INLINE_RE = /\$[^$\n]{1,200}\$/g;
const EQUATION_DISPLAY_RE = /\\\[([\s\S]*?)\\\]/g;
const CODE_FENCE_RE = /```(\w+)?\n([\s\S]*?)```/g;
const CODE_INDENT_RE = /^( {4,}|\t+)(.+)$/gm;
const KEYWORD_RE = /(?:Keywords?|关键词|Key\s+words?)[:：]\s*([^\n]+)/i;
const REFERENCE_RE = /^\[?(\d+)\]?\s+(.+)$/;
const URL_RE = /https?:\/\/[^\s]+/g;
const DOI_RE = /10\.\d{4,}\/[^\s]+/;

// ─── Utilities ───────────────────────────────────────────────────────────────

function generateId(prefix = 'block') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function splitIntoPages(text) {
  const pages = [];
  const parts = text.split(/---\s*第\s*\d+\s*页\s*---/);
  const markers = text.match(/---\s*第\s*(\d+)\s*页\s*---/g) || [];

  let pageNum = 1;
  parts.forEach((part, idx) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const markerMatch = markers[idx - 1]?.match(/---\s*第\s*(\d+)\s*页\s*---/);
    if (markerMatch) {
      pageNum = parseInt(markerMatch[1], 10);
    }
    pages.push({ number: pageNum, text: trimmed });
  });

  if (pages.length === 0 && text.trim()) {
    pages.push({ number: 1, text: text.trim() });
  }

  return pages;
}

function findPageForPosition(text, position, pages) {
  let cumulative = 0;
  for (const page of pages) {
    const pageLen = page.text.length;
    if (position >= cumulative && position < cumulative + pageLen) {
      return page.number;
    }
    cumulative += pageLen + 20; // account for marker length
  }
  return pages[pages.length - 1]?.number || 1;
}

function extractSentences(text, maxSentences = 3) {
  const sentences = text
    .replace(/\n/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 300);
  return sentences.slice(0, maxSentences);
}

function extractKeywordsFromText(text) {
  const keywords = new Set();

  // Try explicit keyword section
  const keywordMatch = text.match(KEYWORD_RE);
  if (keywordMatch) {
    keywordMatch[1].split(/[,;，；]/).forEach((k) => {
      const trimmed = k.trim();
      if (trimmed.length > 2 && trimmed.length < 50) {
        keywords.add(trimmed);
      }
    });
  }

  // Fallback: extract single-word technical terms from abstract/headings only
  const stopWords = /^(The|This|That|These|Those|Figure|Table|Section|Appendix|Abstract|Introduction|Conclusion|References|Keywords?|Background|Methods?|Results?|Discussion|Experiments?|Model|Architecture|Encoder|Decoder|Stacks|Neural|Network|Machine|Translation|English|German|Maximum|We|It|They|Our|Their|His|Her|Its|An|As|At|Be|By|Do|Go|He|If|In|Is|Me|My|No|Of|On|Or|Ox|So|To|Up|Us|We|All|You|Need|Have|Has|Had|Can|Could|Would|Should|Will|Shall|May|Might|Must|Been|Being|Done|Doing|Made|Making|Used|Using|Found|Finding|Shown|Showing|Given|Giving|Taken|Taking|Called|Calling|Based|Based|Such|Than|Only|Also|Well|Both|Each|Every|Many|Some|Any|More|Most|Much|Very|Just|Even|Still|Yet|However|Therefore|Thus|Hence|Moreover|Furthermore|Nevertheless|Otherwise|Instead|Meanwhile|Afterwards|Finally|Initially|Subsequently|Consequently|Accordingly|Likewise|Conversely|Namely|Specifically|Particularly|Especially|Generally|Usually|Typically|Often|Sometimes|Rarely|Never|Always|Already|Almost|Quite|Rather|Enough|Rather|Instead|Else|Ever|Never|Here|There|Where|When|Why|How|What|Which|Who|Whom|Whose|All|Any|Both|Each|Either|Neither|One|None|Several|Few|Many|Most|Other|Another|Such|Only|Own|Same|So|Than|Too|Very|Just|Now|Then|Once|Again|Back|Down|Off|On|Out|Over|Up|About|Above|Across|After|Against|Along|Among|Around|At|Before|Behind|Below|Beneath|Beside|Between|Beyond|But|Despite|During|Except|For|From|Inside|Into|Like|Near|Of|Onto|Outside|Past|Since|Through|Throughout|Till|Toward|Under|Until|Upon|With|Within|Without|And|Because|But|If|Or|Since|So|Although|Though|While|Whereas|Unless|Whether|Either|Neither|Both|Not|Nor)$/i;
  const singleWords = text.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  singleWords.forEach((term) => {
    if (!stopWords.test(term)) {
      keywords.add(term);
    }
  });

  return Array.from(keywords).slice(0, 15);
}

// ─── Entity Extractors ───────────────────────────────────────────────────────

function extractFigures(text) {
  const figures = [];
  let match;
  while ((match = FIGURE_RE.exec(text)) !== null) {
    figures.push({
      id: generateId('fig'),
      type: 'figure',
      label: `Figure ${match[1]}`,
      number: match[1],
      caption: (match[2] || '').trim(),
    });
  }
  return figures;
}

function extractTables(text) {
  const tables = [];
  let match;
  while ((match = TABLE_RE.exec(text)) !== null) {
    tables.push({
      id: generateId('tbl'),
      type: 'table',
      label: `Table ${match[1]}`,
      number: match[1],
      caption: (match[2] || '').trim(),
    });
  }
  return tables;
}

function extractEquations(text) {
  const equations = [];
  let match;

  // Display equations
  while ((match = EQUATION_DISPLAY_RE.exec(text)) !== null) {
    equations.push({
      id: generateId('eq'),
      type: 'equation',
      label: '',
      content: match[1].trim(),
      display: true,
    });
  }

  // Inline equations (collect unique ones)
  const inlineSet = new Set();
  while ((match = EQUATION_INLINE_RE.exec(text)) !== null) {
    const eq = match[0].trim();
    if (eq.length > 3 && !inlineSet.has(eq)) {
      inlineSet.add(eq);
      equations.push({
        id: generateId('eq'),
        type: 'equation',
        label: '',
        content: eq,
        display: false,
      });
    }
  }

  // Isolated math-like lines (heuristic)
  const lines = text.split('\n');
  lines.forEach((line) => {
    const trimmed = line.trim();
    // Use a fixed-length check first, then a safe regex for math-like characters only
    if (trimmed.length > 5 && trimmed.length < 200 &&
        /[=+\-*/]/.test(trimmed) &&
        !trimmed.includes('http') &&
        !inlineSet.has(`$${trimmed}$`) &&
        /^[\d\w\s=+\-*/()[\]{}^_$&%#@;:,./]+$/.test(trimmed)) {
      equations.push({
        id: generateId('eq'),
        type: 'equation',
        label: '',
        content: trimmed,
        display: true,
      });
    }
  });

  return equations;
}

function extractCodeBlocks(text) {
  const codeBlocks = [];
  let match;

  // Fenced code blocks
  while ((match = CODE_FENCE_RE.exec(text)) !== null) {
    codeBlocks.push({
      id: generateId('code'),
      type: 'code',
      label: match[1] || 'code',
      content: match[2].trim(),
    });
  }

  // Indented code blocks (heuristic)
  const lines = text.split('\n');
  let currentBlock = [];
  let inBlock = false;

  lines.forEach((line) => {
    const indentMatch = line.match(/^( {4,}|\t+)/);
    if (indentMatch && line.trim().length > 0) {
      if (!inBlock) {
        inBlock = true;
        currentBlock = [];
      }
      currentBlock.push(line.replace(/^( {4,}|\t+)/, ''));
    } else if (inBlock) {
      if (currentBlock.length >= 3) {
        codeBlocks.push({
          id: generateId('code'),
          type: 'code',
          label: 'code',
          content: currentBlock.join('\n'),
        });
      }
      inBlock = false;
      currentBlock = [];
    }
  });

  // Flush remaining block
  if (inBlock && currentBlock.length >= 3) {
    codeBlocks.push({
      id: generateId('code'),
      type: 'code',
      label: 'code',
      content: currentBlock.join('\n'),
    });
  }

  return codeBlocks;
}

function extractReferences(text) {
  const references = [];
  const lines = text.split('\n');
  let inRefSection = false;

  lines.forEach((line) => {
    const trimmed = line.trim();

    // Detect reference section
    if (/^(References?|参考文献|Bibliography)/i.test(trimmed)) {
      inRefSection = true;
      return;
    }

    if (inRefSection) {
      // Stop at next major section
      if (/^(Appendix|附录|Acknowledgments?|致谢|Supplementary)/i.test(trimmed)) {
        inRefSection = false;
        return;
      }

      const refMatch = trimmed.match(REFERENCE_RE);
      if (refMatch || trimmed.length > 30) {
        references.push(trimmed);
      }
    }
  });

  return references.slice(0, 100);
}

// ─── Section Parser ──────────────────────────────────────────────────────────

function parseSections(text, pages) {
  const lines = text.split('\n');
  const sections = [];
  let currentSection = null;
  let currentContent = [];
  let currentEntities = [];
  let pageStart = 1;

  function flushSection() {
    if (currentSection) {
      const content = currentContent.join('\n').trim();
      const pageEnd = findPageForPosition(
        text,
        text.indexOf(currentContent[currentContent.length - 1] || ''),
        pages
      );

      sections.push({
        ...currentSection,
        content,
        pageEnd: pageEnd || pageStart,
        keyPoints: extractSentences(content),
        entities: currentEntities,
      });
    }
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Detect page marker
    const pageMatch = trimmed.match(PAGE_MARKER_RE);
    if (pageMatch) {
      pageStart = parseInt(pageMatch[1], 10);
      return;
    }

    // Detect section heading
    const numberedMatch = trimmed.match(SECTION_NUMBERED_RE);
    const wordMatch = trimmed.match(SECTION_WORD_RE);

    if (numberedMatch || wordMatch) {
      flushSection();

      const title = numberedMatch
        ? `${numberedMatch[1]} ${numberedMatch[2]}`
        : trimmed;
      const level = numberedMatch
        ? numberedMatch[1].split('.').length
        : 1;

      currentSection = {
        id: generateId('sec'),
        title,
        level,
        pageStart,
      };
      currentContent = [];
      currentEntities = [];
      return;
    }

    // Collect content
    if (currentSection) {
      currentContent.push(trimmed);

      // Extract inline entities
      const figMatch = trimmed.match(FIGURE_RE);
      if (figMatch) {
        currentEntities.push({
          type: 'figure',
          label: `Figure ${figMatch[1]}`,
          content: (figMatch[2] || '').trim(),
        });
      }

      const tblMatch = trimmed.match(TABLE_RE);
      if (tblMatch) {
        currentEntities.push({
          type: 'table',
          label: `Table ${tblMatch[1]}`,
          content: (tblMatch[2] || '').trim(),
        });
      }
    }
  });

  flushSection();

  // If no sections found, create a single body section
  if (sections.length === 0) {
    const content = text
      .split('\n')
      .filter((l) => !PAGE_MARKER_RE.test(l.trim()))
      .join('\n')
      .trim();

    sections.push({
      id: generateId('sec'),
      title: 'Body',
      level: 1,
      content,
      pageStart: 1,
      pageEnd: pages.length || 1,
      keyPoints: extractSentences(content),
      entities: [],
    });
  }

  return sections;
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

/**
 * Parse raw PDF text into structured VIBE representation.
 * @param {string} rawText - PDF text with page markers
 * @returns {object} Structured paper representation
 */
export function parseVibe(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Invalid input: rawText must be a non-empty string');
  }

  const pages = splitIntoPages(rawText);
  const textWithoutMarkers = rawText
    .split('\n')
    .filter((line) => !PAGE_MARKER_RE.test(line.trim()))
    .join('\n');

  // Detect title: first substantial non-empty line
  const lines = textWithoutMarkers.split('\n').map((l) => l.trim());
  let title = '';
  for (const line of lines) {
    if (line.length > 5 && line.length < 200 && !/^(Abstract|摘要|Keywords?|关键词)/i.test(line)) {
      title = line;
      break;
    }
  }

  // Detect abstract
  let abstract = '';
  const abstractMatch = textWithoutMarkers.match(
    /(?:Abstract|摘要)[:：]?\s*\n?([\s\S]{50,2000}?)(?=\n\s*(?:Keywords?|关键词|1\s+Introduction|Introduction|介绍|1\.\s))/i
  );
  if (abstractMatch) {
    abstract = abstractMatch[1].trim().replace(/\n/g, ' ').slice(0, 2000);
  }

  // Parse sections
  const sections = parseSections(rawText, pages);

  // Extract global entities
  const figures = extractFigures(textWithoutMarkers);
  const tables = extractTables(textWithoutMarkers);
  const equations = extractEquations(textWithoutMarkers);
  const codeBlocks = extractCodeBlocks(textWithoutMarkers);
  const keywords = extractKeywordsFromText(textWithoutMarkers);
  const references = extractReferences(textWithoutMarkers);

  return {
    title,
    abstract,
    sections,
    figures,
    tables,
    equations,
    keywords,
    references,
  };
}

/**
 * Quick parse for preview - returns title and section count only.
 * @param {string} rawText
 * @returns {{title: string, sectionCount: number, pageCount: number}}
 */
export function parseVibePreview(rawText) {
  const result = parseVibe(rawText);
  const pages = splitIntoPages(rawText);
  return {
    title: result.title,
    sectionCount: result.sections.length,
    pageCount: pages.length,
  };
}

export default parseVibe;
