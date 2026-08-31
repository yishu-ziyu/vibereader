/**
 * VIBE Prompts - System prompts for AI-enhanced VIBE interactions.
 * These prompts are consumed by the AI service to generate structured responses
 * based on parsed paper sections.
 */

/**
 * Generate a system prompt for summarizing a paper section.
 * @param {object} section - VIBE section object
 * @returns {string} System prompt for the AI
 */
export function generateSummaryPrompt(section) {
  if (!section || !section.content) {
    throw new Error('Invalid section: content is required');
  }

  return `You are an academic research assistant helping a reader understand a section of a research paper.

## Task
Provide a concise yet comprehensive summary of the following paper section. The summary should:
1. Capture the main argument or contribution
2. Highlight key findings, methods, or claims
3. Explain technical concepts in accessible language
4. Be 3-5 sentences in length

## Context
Section: "${section.title}" (Level ${section.level} heading)
${section.keyPoints?.length > 0 ? `Key sentences from the section:\n${section.keyPoints.map((kp) => `- ${kp}`).join('\n')}` : ''}
${section.entities?.length > 0 ? `\nEntities referenced in this section:\n${section.entities.map((e) => `- ${e.type}: ${e.label}`).join('\n')}` : ''}

## Section Content
${section.content.slice(0, 4000)}

## Output Format
Respond with a JSON object:
{
  "summary": "The summary text...",
  "keyClaims": ["claim 1", "claim 2"],
  "technicalTerms": [{"term": "...", "explanation": "..."}]
}`;
}

/**
 * Generate a system prompt for creating flashcards from a section.
 * @param {object} section - VIBE section object
 * @returns {string} System prompt for the AI
 */
export function generateFlashcardsPrompt(section) {
  if (!section || !section.content) {
    throw new Error('Invalid section: content is required');
  }

  return `You are an academic study assistant creating flashcards for spaced repetition learning.

## Task
Generate 3-7 flashcards from the following paper section. Each flashcard should:
1. Test a key concept, definition, finding, or method from the section
2. Have a clear, specific question (front)
3. Have a concise, accurate answer (back)
4. Vary in difficulty (basic recall, conceptual understanding, application)

## Context
Section: "${section.title}"
${section.keyPoints?.length > 0 ? `\nKey points:\n${section.keyPoints.map((kp) => `- ${kp}`).join('\n')}` : ''}

## Section Content
${section.content.slice(0, 4000)}

## Output Format
Respond with a JSON array of flashcard objects:
[
  {
    "id": "fc_1",
    "front": "Question text?",
    "back": "Answer text.",
    "difficulty": "easy|medium|hard",
    "category": "definition|method|finding|concept"
  }
]`;
}

/**
 * Generate a system prompt for creating a mind map structure from the full paper.
 * @param {object} paperStructure - Full VIBE paper structure
 * @returns {string} System prompt for the AI
 */
export function generateMindMapPrompt(paperStructure) {
  if (!paperStructure || !paperStructure.sections) {
    throw new Error('Invalid paper structure: sections are required');
  }

  const sectionSummaries = paperStructure.sections
    .map(
      (s) =>
        `- ${s.title} (L${s.level}, p.${s.pageStart}${s.pageEnd && s.pageEnd !== s.pageStart ? `-${s.pageEnd}` : ''}): ${s.content.slice(0, 150).replace(/\n/g, ' ')}...`
    )
    .join('\n');

  const entities = [];
  if (paperStructure.figures?.length > 0) {
    entities.push(`Figures: ${paperStructure.figures.map((f) => f.label).join(', ')}`);
  }
  if (paperStructure.tables?.length > 0) {
    entities.push(`Tables: ${paperStructure.tables.map((t) => t.label).join(', ')}`);
  }
  if (paperStructure.equations?.length > 0) {
    entities.push(`Key equations: ${paperStructure.equations.length} total`);
  }

  return `You are an academic visualization assistant creating a structured mind map for a research paper.

## Task
Generate a hierarchical mind map structure that captures the paper's argument flow, key concepts, and relationships between sections. The mind map should:
1. Start with the central thesis/contribution as the root node
2. Branch into major sections as primary nodes
3. Include sub-branches for key concepts, methods, findings, and cited entities
4. Show logical connections between related sections

## Paper Overview
Title: ${paperStructure.title || 'Untitled Paper'}
${paperStructure.abstract ? `\nAbstract: ${paperStructure.abstract.slice(0, 300)}...` : ''}
${paperStructure.keywords?.length > 0 ? `\nKeywords: ${paperStructure.keywords.join(', ')}` : ''}

## Sections
${sectionSummaries}

${entities.length > 0 ? `\n## Key Entities\n${entities.join('\n')}` : ''}

## Output Format
Respond with a JSON object representing the mind map:
{
  "root": {
    "id": "root",
    "label": "Central thesis or paper title",
    "children": [
      {
        "id": "node_1",
        "label": "Section or concept name",
        "sectionId": "sec_xxx", // optional reference to VIBE section
        "children": [
          {
            "id": "node_1_1",
            "label": "Sub-concept",
            "children": []
          }
        ]
      }
    ]
  }
}`;
}

/**
 * Generate a system prompt for cross-referencing entities within the paper.
 * @param {object} paperStructure - Full VIBE paper structure
 * @param {string} entityLabel - Label of the entity to cross-reference (e.g., "Figure 1")
 * @returns {string} System prompt for the AI
 */
export function generateEntityCrossRefPrompt(paperStructure, entityLabel) {
  if (!paperStructure || !entityLabel) {
    throw new Error('Paper structure and entity label are required');
  }

  // Find all sections that mention this entity
  const mentioningSections = paperStructure.sections.filter((s) =>
    s.entities?.some((e) => e.label === entityLabel) ||
    s.content?.includes(entityLabel)
  );

  const entity =
    paperStructure.figures?.find((f) => f.label === entityLabel) ||
    paperStructure.tables?.find((t) => t.label === entityLabel);

  return `You are an academic research assistant analyzing how a specific figure, table, or equation is used throughout a paper.

## Task
Explain where and how "${entityLabel}" is referenced in the paper, and synthesize what it contributes to the overall argument.

## Entity Details
Label: ${entityLabel}
${entity?.caption ? `Caption: ${entity.caption}` : 'No caption available.'}

## Sections Referencing This Entity
${mentioningSections.length > 0
      ? mentioningSections
          .map(
            (s) =>
              `- "${s.title}" (p.${s.pageStart}): ${s.content.slice(0, 200).replace(/\n/g, ' ')}...`
          )
          .join('\n')
      : 'No explicit references found in section entities.'
    }

## Output Format
Respond with a JSON object:
{
  "entityLabel": "${entityLabel}",
  "description": "What this entity shows...",
  "referencedIn": ["Section title 1", "Section title 2"],
  "roleInArgument": "How this entity supports the paper's claims...",
  "keyTakeaway": "The most important insight from this entity"
}`;
}

/**
 * Generate a system prompt for comparing two sections.
 * @param {object} sectionA - First VIBE section
 * @param {object} sectionB - Second VIBE section
 * @returns {string} System prompt for the AI
 */
export function generateSectionComparePrompt(sectionA, sectionB) {
  if (!sectionA || !sectionB) {
    throw new Error('Both sections are required for comparison');
  }

  return `You are an academic analysis assistant comparing two sections of a research paper.

## Task
Compare and contrast the following two sections, identifying:
1. How they relate to each other (sequential, parallel, supporting, contrasting)
2. Shared concepts, methods, or terminology
3. Key differences in focus, methodology, or claims
4. How they contribute to the paper's overall argument

## Section A: "${sectionA.title}"
${sectionA.keyPoints?.length > 0 ? `Key points:\n${sectionA.keyPoints.map((kp) => `- ${kp}`).join('\n')}` : ''}
Content:\n${sectionA.content.slice(0, 2000)}

## Section B: "${sectionB.title}"
${sectionB.keyPoints?.length > 0 ? `Key points:\n${sectionB.keyPoints.map((kp) => `- ${kp}`).join('\n')}` : ''}
Content:\n${sectionB.content.slice(0, 2000)}

## Output Format
Respond with a JSON object:
{
  "relationship": "sequential|parallel|supporting|contrasting|method-result",
  "similarities": ["..."],
  "differences": ["..."],
  "sharedEntities": ["Figure 1", "Method X"],
  "synthesis": "How these sections work together..."
}`;
}

export default {
  generateSummaryPrompt,
  generateFlashcardsPrompt,
  generateMindMapPrompt,
  generateEntityCrossRefPrompt,
  generateSectionComparePrompt,
};
