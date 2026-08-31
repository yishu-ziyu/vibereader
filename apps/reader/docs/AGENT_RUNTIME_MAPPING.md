# VibeReader Agent Runtime Mapping

Date: 2026-05-27

This document maps the "Pi / Codex / Claude Code agent loop" idea onto VibeReader. The key point is: connecting a large model does not automatically create an intelligent product. The product becomes agentic when the model is placed inside a controlled loop with context, tools, memory, permissions, and verifiable artifacts.

## Core Thesis

Pi, Codex, Claude Code, and similar tools are not smart because their UI is special. They are smart because they wrap a large model in an execution harness:

```text
model intelligence
+ project/user context
+ tool registry
+ action loop
+ state and memory
+ permission boundaries
+ verification
= agent behavior
```

For VibeReader, the equivalent is:

```text
model intelligence
+ current document context
+ reader tools
+ synthesis tools
+ local annotations and artifacts
+ user-controlled permissions
+ QA / verification loop
= reading agent
```

## What VibeReader Has Today

VibeReader already has the foundation for an agentic reading product:

- Local document reader:
  - PDF
  - Markdown
  - Text
  - safe HTML extraction
- Document context injection:
  - selected text can be sent into chat
  - PDF/Markdown/Text content can become model context
- AI workspace:
  - chat
  - summary
  - flashcards
  - mind map
- Local artifacts:
  - annotations
  - notes
  - conversations
  - demo assets
- Desktop shell direction:
  - Tauri
  - local-first file access

But this is still closer to "AI chat embedded in a reader" than a full agent runtime.

## What Is Missing For A Real Reading Agent

### 1. Explicit Agent Loop

Current behavior is mostly one request at a time:

```text
user selects text -> user asks -> model answers
```

A reading agent should be able to run a bounded loop:

```text
user goal
-> inspect current document
-> decide which tool to call
-> produce intermediate artifact
-> ask for more context if needed
-> verify or cite source span
-> return final answer with trace
```

Example:

```text
"帮我判断这篇论文的核心贡献是否站得住脚"
```

The agent should not only answer from the selected paragraph. It should:

1. read title/abstract;
2. inspect method section;
3. inspect findings section;
4. extract claims;
5. compare evidence;
6. produce a structured critique;
7. cite document spans.

### 2. Tool Registry

Today, VibeReader has UI features, but they are not yet exposed as model-callable tools.

Candidate tools:

```text
read_current_selection()
get_document_metadata()
search_document(query)
get_page_text(page)
get_outline()
create_annotation(text, page, note)
create_summary(scope)
create_flashcards(scope)
create_mindmap(scope)
export_markdown()
```

The model should not have raw filesystem power by default. It should operate through safe, product-specific reading tools.

### 3. Context Packing

Current context injection is direct and user-driven. That is good for transparency, but too primitive for long documents.

VibeReader needs a context packer:

```text
input: user goal + current document + selection + outline + annotations
output: compact model context with source anchors
```

Good context packing should include:

- current selection;
- nearby paragraph/window;
- document title and type;
- outline path;
- relevant annotations;
- previous chat intent;
- source span IDs.

This is where VibeReader can become better than a generic coding agent: the context is reading-specific.

### 4. Artifact Model

Coding agents produce diffs, files, commits, and test results.

VibeReader should produce reading artifacts:

- claim map;
- evidence table;
- summary;
- critique;
- flashcards;
- mind map;
- literature-note draft;
- question list;
- reading plan;
- annotations.

Each artifact should have:

```text
artifact id
document id
source spans
generation prompt/goal
model used
created time
editable content
```

### 5. Permission Boundaries

Pi/Codex permissions are about shell, file edits, and external commands.

VibeReader permissions are different:

- Can the model read the whole document?
- Can the model call the web?
- Can the model save annotations?
- Can the model export files?
- Can the model use multiple documents together?
- Can the model send private document text to an external provider?

This is a product advantage. VibeReader can make AI privacy explicit:

```text
Local-only reading: no model call
Selection-only AI: send selected text only
Document-aware AI: send compressed document context
Multi-doc synthesis: send context from chosen documents
```

### 6. Verification

Coding agents verify with tests/builds.

Reading agents verify with source grounding:

- every claim should link to a source span;
- every summary should state scope;
- every critique should distinguish text evidence from model inference;
- every generated flashcard should be traceable to a document passage.

For VibeReader, "BDD/TDD" maps to:

```text
Given a document with known text
When the user asks for a claim summary
Then the agent returns claims with source span ids
And no claim appears without a source or inference label
```

## Product Architecture Mapping

```text
VibeReader UI
  |
  |-- Reader Layer
  |     - PDF viewer
  |     - Markdown/Text/HTML reader
  |     - selection capture
  |     - outline/page state
  |
  |-- Context Layer
  |     - document text store
  |     - source span index
  |     - annotation store
  |     - context packer
  |
  |-- Agent Runtime
  |     - system prompt
  |     - tool registry
  |     - agent loop
  |     - budget/step limit
  |     - permission policy
  |
  |-- AI Transport
  |     - provider configs
  |     - Tauri/proxy path
  |     - abort/stop
  |     - error normalization
  |
  |-- Artifact Layer
        - summaries
        - flashcards
        - mind maps
        - critiques
        - annotations
        - exports
```

## Why This Matters For The Hackathon

The strongest story is not "we added chat to a PDF reader."

The stronger story is:

```text
VibeReader turns local documents into an agentic reading workspace.
It lets users decide what context the model can see,
then uses reading-specific tools to produce grounded artifacts.
```

This is a clearer product wedge than copying Pi's coding-agent feature set.

Pi's domain is code:

```text
read files -> edit files -> run tests -> commit
```

VibeReader's domain is reading:

```text
read documents -> extract claims -> ground evidence -> synthesize artifacts -> preserve notes
```

## Near-Term Implementation Plan

### Phase A: Agent Runtime Skeleton

Add a small runtime that does not yet run autonomous multi-step tasks:

```text
src/agent/
  toolRegistry.js
  contextPacker.js
  readingAgent.js
  permissions.js
```

Initial goal:

- define tool interfaces;
- expose current document/selection/outline/annotations as tools;
- run a single-turn agent request through the context packer.

### Phase B: Source Span Grounding

Introduce stable source spans:

```text
documentId
spanId
page
startOffset
endOffset
text
```

Use them for:

- selection injection;
- summaries;
- annotations;
- generated artifacts.

### Phase C: Bounded Agent Loop

Add a loop with hard limits:

```text
maxSteps: 4
allowedTools: reading-only
no filesystem writes except artifact save
no web unless user enables it
```

The first agent mode should be conservative:

```text
"Analyze current document"
```

Not:

```text
"Do anything on my computer"
```

### Phase D: Artifact-Centric UI

Make the right panel show agent outputs as artifacts, not just chat bubbles:

- Summary artifact
- Claim table artifact
- Flashcard artifact
- Mind map artifact
- Critique artifact

Chat remains the command surface, but artifacts become the durable output.

## What Not To Do Yet

- Do not clone Pi's whole coding-agent architecture into VibeReader.
- Do not expose shell/file-edit tools to the model.
- Do not create an unrestricted autonomous agent.
- Do not build multi-document RAG before source spans and single-document grounding are stable.
- Do not hide what text is being sent to the model.

## Decision

VibeReader should not be "Pi for documents" in a literal sense.

It should borrow the agent architecture pattern:

```text
model + context + tools + loop + permissions + verification
```

But specialize every layer for reading:

```text
document context + reader tools + source-grounded artifacts + user-controlled privacy
```

That is the path from "AI chat in a reader" to "agentic reading workspace."

