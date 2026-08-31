use rusqlite::{params, Connection};

use super::error::{StorageError, StorageResult};

const READING_NOTE_EXPORT_TYPE: &str = "reading_note";
const READING_NOTE_SCHEMA_VERSION: i64 = 1;

fn validate_required(name: &str, value: &str) -> StorageResult<()> {
    if value.trim().is_empty() {
        return Err(StorageError::Validation(format!("{name} is required")));
    }
    Ok(())
}

fn validate_task_status(value: &str) -> StorageResult<()> {
    match value {
        "pending" | "running" | "succeeded" | "failed" | "cancelled" => Ok(()),
        _ => Err(StorageError::Validation(format!(
            "unsupported task status: {value}"
        ))),
    }
}

fn normalize_index_text(value: &str) -> String {
    value
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn tokenize_query(value: &str) -> Vec<String> {
    value
        .to_lowercase()
        .split(|character: char| !character.is_alphanumeric())
        .map(str::trim)
        .filter(|token| token.len() >= 3)
        .map(str::to_string)
        .collect()
}

fn source_span_score(tokens: &[String], span: &SourceSpanRecord) -> usize {
    tokens
        .iter()
        .map(|token| span.text.to_lowercase().matches(token).count())
        .sum()
}

fn current_time_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInput {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub source: String,
    pub path: Option<String>,
    pub mime_type: String,
    pub size: i64,
    pub fingerprint: Option<String>,
    pub opened_at: i64,
    pub updated_at: i64,
    pub parse_status: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRecord {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub source: String,
    pub path: Option<String>,
    pub mime_type: String,
    pub size: i64,
    pub fingerprint: Option<String>,
    pub opened_at: i64,
    pub updated_at: i64,
    pub parse_status: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentKnowledgeRecord {
    pub unirag_source_id: Option<String>,
    pub knowledge_status: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContentInput {
    pub document_id: String,
    pub content_text: String,
    pub source_type: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentContentRecord {
    pub document_id: String,
    pub content_text: String,
    pub source_type: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationInput {
    pub id: String,
    pub document_id: String,
    pub page: i64,
    pub paragraph_id: Option<String>,
    pub selected_text: String,
    pub note: String,
    pub color: String,
    pub rect_json: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationRecord {
    pub id: String,
    pub document_id: String,
    pub page: i64,
    pub paragraph_id: Option<String>,
    pub selected_text: String,
    pub note: String,
    pub color: String,
    pub rect_json: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VibeCardInput {
    pub id: String,
    pub document_id: String,
    #[serde(rename = "type")]
    pub card_type: String,
    pub title: String,
    pub source_text: String,
    pub ai_content: String,
    pub user_note: String,
    pub page: Option<i64>,
    pub paragraph_id: Option<String>,
    pub tags_json: String,
    pub source_json: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub verification_status: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VibeCardRecord {
    pub id: String,
    pub document_id: String,
    #[serde(rename = "type")]
    pub card_type: String,
    pub title: String,
    pub source_text: String,
    pub ai_content: String,
    pub user_note: String,
    pub page: Option<i64>,
    pub paragraph_id: Option<String>,
    pub tags_json: String,
    pub source_json: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub verification_status: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardInput {
    pub id: String,
    pub deck_id: String,
    pub document_id: String,
    pub front: String,
    pub back: String,
    pub known: bool,
    pub unknown: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardRecord {
    pub id: String,
    pub deck_id: String,
    pub document_id: String,
    pub front: String,
    pub back: String,
    pub known: bool,
    pub unknown: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardDeckInput {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub cards: Vec<FlashcardInput>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlashcardDeckRecord {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub cards: Vec<FlashcardRecord>,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationInput {
    pub session_id: String,
    pub document_id: Option<String>,
    pub title: String,
    pub messages_json: String,
    pub message_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRecord {
    pub session_id: String,
    pub document_id: Option<String>,
    pub title: String,
    pub messages_json: String,
    pub message_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThinkingTreeInput {
    pub document_id: String,
    pub tree_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThinkingTreeRecord {
    pub document_id: String,
    pub tree_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionInsightInput {
    pub id: String,
    pub document_id: String,
    #[serde(rename = "type")]
    pub insight_type: String,
    pub description: String,
    pub page: i64,
    pub paragraph_index: i64,
    pub paragraph_id: String,
    pub payload_json: String,
    pub read_status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionInsightRecord {
    pub id: String,
    pub document_id: String,
    #[serde(rename = "type")]
    pub insight_type: String,
    pub description: String,
    pub page: i64,
    pub paragraph_index: i64,
    pub paragraph_id: String,
    pub payload_json: String,
    pub read_status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryInput {
    pub id: String,
    pub document_id: String,
    pub summary_kind: String,
    pub section_id: Option<String>,
    pub section_title: String,
    pub summary: String,
    pub key_points_json: String,
    pub raw_response: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryRecord {
    pub id: String,
    pub document_id: String,
    pub summary_kind: String,
    pub section_id: Option<String>,
    pub section_title: String,
    pub summary: String,
    pub key_points_json: String,
    pub raw_response: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSpanInput {
    pub id: String,
    pub document_id: String,
    pub page: i64,
    pub paragraph_id: String,
    pub chunk_id: String,
    pub text: String,
    pub order_index: i64,
    pub source_type: String,
    pub metadata_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSpanRecord {
    pub id: String,
    pub document_id: String,
    pub page: i64,
    pub paragraph_id: String,
    pub chunk_id: String,
    pub text: String,
    pub order_index: i64,
    pub source_type: String,
    pub metadata_json: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceIndexStatusInput {
    pub document_id: String,
    pub index_signature: String,
    pub span_count: i64,
    pub indexed_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceIndexStatusRecord {
    pub document_id: String,
    pub index_signature: String,
    pub span_count: i64,
    pub indexed_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub id: String,
    pub document_id: Option<String>,
    #[serde(rename = "type")]
    pub task_type: String,
    pub status: String,
    pub title: String,
    pub progress: i64,
    pub payload_json: String,
    pub result_json: String,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub cancelled_at: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRecord {
    pub id: String,
    pub document_id: Option<String>,
    #[serde(rename = "type")]
    pub task_type: String,
    pub status: String,
    pub title: String,
    pub progress: i64,
    pub payload_json: String,
    pub result_json: String,
    pub error_message: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub started_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub cancelled_at: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingNoteExport {
    pub export_type: String,
    pub schema_version: i64,
    pub exported_at: i64,
    pub document: DocumentRecord,
    pub document_content: Option<DocumentContentRecord>,
    pub summaries: Vec<SummaryRecord>,
    pub annotations: Vec<AnnotationRecord>,
    pub vibecards: Vec<VibeCardRecord>,
    pub flashcard_decks: Vec<FlashcardDeckRecord>,
    pub attention_insights: Vec<AttentionInsightRecord>,
    pub thinking_tree: Option<ThinkingTreeRecord>,
    pub conversations: Vec<ConversationRecord>,
    pub markdown: String,
    pub json: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReadingNoteExportPayload {
    export_type: String,
    schema_version: i64,
    exported_at: i64,
    document: DocumentRecord,
    #[serde(default)]
    document_content: Option<DocumentContentRecord>,
    summaries: Vec<SummaryRecord>,
    annotations: Vec<AnnotationRecord>,
    vibecards: Vec<VibeCardRecord>,
    flashcard_decks: Vec<FlashcardDeckRecord>,
    attention_insights: Vec<AttentionInsightRecord>,
    thinking_tree: Option<ThinkingTreeRecord>,
    conversations: Vec<ConversationRecord>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingNoteImportResult {
    pub document: DocumentRecord,
    pub summary_count: usize,
    pub annotation_count: usize,
    pub vibecard_count: usize,
    pub flashcard_deck_count: usize,
    pub attention_insight_count: usize,
    pub conversation_count: usize,
}

fn document_input_from_record(record: &DocumentRecord) -> DocumentInput {
    DocumentInput {
        id: record.id.clone(),
        name: record.name.clone(),
        kind: record.kind.clone(),
        source: record.source.clone(),
        path: record.path.clone(),
        mime_type: record.mime_type.clone(),
        size: record.size,
        fingerprint: record.fingerprint.clone(),
        opened_at: record.opened_at,
        updated_at: record.updated_at,
        parse_status: record.parse_status.clone(),
    }
}

fn document_content_input_from_record(record: &DocumentContentRecord) -> DocumentContentInput {
    DocumentContentInput {
        document_id: record.document_id.clone(),
        content_text: record.content_text.clone(),
        source_type: record.source_type.clone(),
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn annotation_input_from_record(record: &AnnotationRecord) -> AnnotationInput {
    AnnotationInput {
        id: record.id.clone(),
        document_id: record.document_id.clone(),
        page: record.page,
        paragraph_id: record.paragraph_id.clone(),
        selected_text: record.selected_text.clone(),
        note: record.note.clone(),
        color: record.color.clone(),
        rect_json: record.rect_json.clone(),
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn vibecard_input_from_record(record: &VibeCardRecord) -> VibeCardInput {
    VibeCardInput {
        id: record.id.clone(),
        document_id: record.document_id.clone(),
        card_type: record.card_type.clone(),
        title: record.title.clone(),
        source_text: record.source_text.clone(),
        ai_content: record.ai_content.clone(),
        user_note: record.user_note.clone(),
        page: record.page,
        paragraph_id: record.paragraph_id.clone(),
        tags_json: record.tags_json.clone(),
        source_json: record.source_json.clone(),
        created_at: record.created_at,
        updated_at: record.updated_at,
        verification_status: record.verification_status.clone(),
    }
}

fn flashcard_input_from_record(record: &FlashcardRecord) -> FlashcardInput {
    FlashcardInput {
        id: record.id.clone(),
        deck_id: record.deck_id.clone(),
        document_id: record.document_id.clone(),
        front: record.front.clone(),
        back: record.back.clone(),
        known: record.known,
        unknown: record.unknown,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn flashcard_deck_input_from_record(record: &FlashcardDeckRecord) -> FlashcardDeckInput {
    FlashcardDeckInput {
        id: record.id.clone(),
        document_id: record.document_id.clone(),
        title: record.title.clone(),
        created_at: record.created_at,
        updated_at: record.updated_at,
        cards: record
            .cards
            .iter()
            .map(flashcard_input_from_record)
            .collect(),
    }
}

fn conversation_input_from_record(record: &ConversationRecord) -> ConversationInput {
    ConversationInput {
        session_id: record.session_id.clone(),
        document_id: record.document_id.clone(),
        title: record.title.clone(),
        messages_json: record.messages_json.clone(),
        message_count: record.message_count,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn thinking_tree_input_from_record(record: &ThinkingTreeRecord) -> ThinkingTreeInput {
    ThinkingTreeInput {
        document_id: record.document_id.clone(),
        tree_json: record.tree_json.clone(),
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn attention_insight_input_from_record(record: &AttentionInsightRecord) -> AttentionInsightInput {
    AttentionInsightInput {
        id: record.id.clone(),
        document_id: record.document_id.clone(),
        insight_type: record.insight_type.clone(),
        description: record.description.clone(),
        page: record.page,
        paragraph_index: record.paragraph_index,
        paragraph_id: record.paragraph_id.clone(),
        payload_json: record.payload_json.clone(),
        read_status: record.read_status.clone(),
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn summary_input_from_record(record: &SummaryRecord) -> SummaryInput {
    SummaryInput {
        id: record.id.clone(),
        document_id: record.document_id.clone(),
        summary_kind: record.summary_kind.clone(),
        section_id: record.section_id.clone(),
        section_title: record.section_title.clone(),
        summary: record.summary.clone(),
        key_points_json: record.key_points_json.clone(),
        raw_response: record.raw_response.clone(),
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn validate_payload_document_ids(payload: &ReadingNoteExportPayload) -> StorageResult<()> {
    let document_id = &payload.document.id;
    validate_required("document id", document_id)?;

    if let Some(document_content) = &payload.document_content {
        if &document_content.document_id != document_id {
            return Err(StorageError::Validation(
                "document content document id does not match import document".into(),
            ));
        }
    }
    for summary in &payload.summaries {
        if &summary.document_id != document_id {
            return Err(StorageError::Validation(
                "summary document id does not match import document".into(),
            ));
        }
    }
    for annotation in &payload.annotations {
        if &annotation.document_id != document_id {
            return Err(StorageError::Validation(
                "annotation document id does not match import document".into(),
            ));
        }
    }
    for card in &payload.vibecards {
        if &card.document_id != document_id {
            return Err(StorageError::Validation(
                "vibecard document id does not match import document".into(),
            ));
        }
    }
    for deck in &payload.flashcard_decks {
        if &deck.document_id != document_id {
            return Err(StorageError::Validation(
                "flashcard deck document id does not match import document".into(),
            ));
        }
        for card in &deck.cards {
            if &card.document_id != document_id {
                return Err(StorageError::Validation(
                    "flashcard document id does not match import document".into(),
                ));
            }
            if card.deck_id != deck.id {
                return Err(StorageError::Validation(
                    "flashcard deck id does not match parent deck".into(),
                ));
            }
        }
    }
    for insight in &payload.attention_insights {
        if &insight.document_id != document_id {
            return Err(StorageError::Validation(
                "attention insight document id does not match import document".into(),
            ));
        }
    }
    if let Some(tree) = &payload.thinking_tree {
        if &tree.document_id != document_id {
            return Err(StorageError::Validation(
                "thinking tree document id does not match import document".into(),
            ));
        }
    }
    for conversation in &payload.conversations {
        if let Some(conversation_document_id) = &conversation.document_id {
            if conversation_document_id != document_id {
                return Err(StorageError::Validation(
                    "conversation document id does not match import document".into(),
                ));
            }
        }
    }

    Ok(())
}

pub struct Storage {
    connection: Connection,
}

impl Storage {
    pub fn open(path: impl AsRef<std::path::Path>) -> StorageResult<Self> {
        Ok(Self {
            connection: Connection::open(path)?,
        })
    }

    pub fn open_memory() -> StorageResult<Self> {
        Ok(Self {
            connection: Connection::open_in_memory()?,
        })
    }

    pub fn init_schema(&self) -> StorageResult<()> {
        self.connection.execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL
            );

            INSERT OR IGNORE INTO schema_migrations (version, applied_at)
            VALUES (1, strftime('%s','now') * 1000);

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                source TEXT NOT NULL,
                path TEXT,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                fingerprint TEXT,
                opened_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                parse_status TEXT NOT NULL,
                unirag_source_id TEXT,
                knowledge_status TEXT,
                reading_position TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_documents_opened_at
                ON documents(opened_at DESC);

            CREATE TABLE IF NOT EXISTS document_contents (
                document_id TEXT PRIMARY KEY,
                content_text TEXT NOT NULL,
                source_type TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS annotations (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                page INTEGER NOT NULL,
                paragraph_id TEXT,
                selected_text TEXT NOT NULL,
                note TEXT NOT NULL,
                color TEXT NOT NULL,
                rect_json TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_annotations_document_created
                ON annotations(document_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS vibecards (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                source_text TEXT NOT NULL,
                ai_content TEXT NOT NULL,
                user_note TEXT NOT NULL,
                page INTEGER,
                paragraph_id TEXT,
                tags_json TEXT NOT NULL,
                source_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                verification_status TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_vibecards_document_created
                ON vibecards(document_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS flashcard_decks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_flashcard_decks_document_updated
                ON flashcard_decks(document_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS flashcards (
                id TEXT PRIMARY KEY,
                deck_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                front TEXT NOT NULL,
                back TEXT NOT NULL,
                known INTEGER NOT NULL,
                unknown INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_flashcards_deck_created
                ON flashcards(deck_id, created_at ASC);

            CREATE TABLE IF NOT EXISTS conversations (
                session_id TEXT PRIMARY KEY,
                document_id TEXT,
                title TEXT NOT NULL,
                messages_json TEXT NOT NULL,
                message_count INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
                ON conversations(updated_at DESC);

            CREATE TABLE IF NOT EXISTS thinking_trees (
                document_id TEXT PRIMARY KEY,
                tree_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS attention_insights (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                type TEXT NOT NULL,
                description TEXT NOT NULL,
                page INTEGER NOT NULL,
                paragraph_index INTEGER NOT NULL,
                paragraph_id TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                read_status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_attention_insights_document_page
                ON attention_insights(document_id, page, paragraph_index);

            CREATE TABLE IF NOT EXISTS summaries (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                summary_kind TEXT NOT NULL,
                section_id TEXT NOT NULL,
                section_title TEXT NOT NULL,
                summary TEXT NOT NULL,
                key_points_json TEXT NOT NULL,
                raw_response TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(document_id, summary_kind, section_id)
            );

            CREATE INDEX IF NOT EXISTS idx_summaries_document_kind
                ON summaries(document_id, summary_kind);

            CREATE TABLE IF NOT EXISTS source_spans (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                page INTEGER NOT NULL,
                paragraph_id TEXT NOT NULL,
                chunk_id TEXT NOT NULL,
                text TEXT NOT NULL,
                normalized_text TEXT NOT NULL,
                order_index INTEGER NOT NULL,
                source_type TEXT NOT NULL,
                metadata_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_source_spans_document_order
                ON source_spans(document_id, order_index ASC);

            CREATE INDEX IF NOT EXISTS idx_source_spans_document_page
                ON source_spans(document_id, page, paragraph_id);

            CREATE TABLE IF NOT EXISTS source_index_status (
                document_id TEXT PRIMARY KEY,
                index_signature TEXT NOT NULL,
                span_count INTEGER NOT NULL,
                indexed_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS task_records (
                id TEXT PRIMARY KEY,
                document_id TEXT,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                title TEXT NOT NULL,
                progress INTEGER NOT NULL,
                payload_json TEXT NOT NULL,
                result_json TEXT NOT NULL,
                error_message TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                started_at INTEGER,
                completed_at INTEGER,
                cancelled_at INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_task_records_document_updated
                ON task_records(document_id, updated_at DESC);

            CREATE INDEX IF NOT EXISTS idx_task_records_status_updated
                ON task_records(status, updated_at DESC);
            ",
        )?;
        self.migrate_documents_columns()?;
        Ok(())
    }

    /// 老库迁移：documents 表补充 unirag_source_id / knowledge_status /
    /// reading_position 列。CREATE TABLE IF NOT EXISTS 不会给已存在的表加列，
    /// 因此启动建表后检查 PRAGMA table_info，缺列则 ALTER TABLE ADD COLUMN
    /// （幂等，可重复执行）。
    fn migrate_documents_columns(&self) -> StorageResult<()> {
        let existing_columns: Vec<String> = {
            let mut statement = self.connection.prepare("PRAGMA table_info(documents)")?;
            let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(StorageError::from)?
        };
        for column in ["unirag_source_id", "knowledge_status", "reading_position"] {
            if existing_columns.iter().any(|name| name == column) {
                continue;
            }
            // 列名来自固定白名单，无注入风险
            self.connection.execute(
                &format!("ALTER TABLE documents ADD COLUMN {column} TEXT"),
                [],
            )?;
        }
        Ok(())
    }

    pub fn upsert_document(&self, input: DocumentInput) -> StorageResult<DocumentRecord> {
        validate_required("document id", &input.id)?;
        validate_required("document name", &input.name)?;
        validate_required("document kind", &input.kind)?;

        self.connection.execute(
            "
            INSERT INTO documents (
                id, name, kind, source, path, mime_type, size, fingerprint,
                opened_at, updated_at, parse_status
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                kind = excluded.kind,
                source = excluded.source,
                path = excluded.path,
                mime_type = excluded.mime_type,
                size = excluded.size,
                fingerprint = excluded.fingerprint,
                opened_at = excluded.opened_at,
                updated_at = excluded.updated_at,
                parse_status = excluded.parse_status
            ",
            params![
                input.id,
                input.name,
                input.kind,
                input.source,
                input.path,
                input.mime_type,
                input.size,
                input.fingerprint,
                input.opened_at,
                input.updated_at,
                input.parse_status,
            ],
        )?;

        self.get_document_by_id(&input.id)
    }

    pub fn list_documents(&self) -> StorageResult<Vec<DocumentRecord>> {
        let mut statement = self.connection.prepare(
            "
            SELECT id, name, kind, source, path, mime_type, size, fingerprint,
                   opened_at, updated_at, parse_status
            FROM documents
            ORDER BY opened_at DESC, updated_at DESC
            ",
        )?;
        let rows = statement.query_map([], document_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StorageError::from)
    }

    /// 设置文档↔UniRAG 入库链接（D4）：写 documents 表的
    /// unirag_source_id / knowledge_status 两列。文档不存在时报校验错误。
    pub fn set_document_knowledge(
        &self,
        document_id: &str,
        unirag_source_id: Option<String>,
        knowledge_status: Option<String>,
    ) -> StorageResult<()> {
        validate_required("document id", document_id)?;

        let updated = self.connection.execute(
            "
            UPDATE documents
            SET unirag_source_id = ?2, knowledge_status = ?3
            WHERE id = ?1
            ",
            params![document_id, unirag_source_id, knowledge_status],
        )?;
        if updated == 0 {
            return Err(StorageError::Validation(format!(
                "document not found: {document_id}"
            )));
        }
        Ok(())
    }

    /// 读取文档↔UniRAG 入库链接（D4）。文档不存在时返回 None；
    /// 文档存在但未设置链接时两个字段均为 None。
    pub fn get_document_knowledge(
        &self,
        document_id: &str,
    ) -> StorageResult<Option<DocumentKnowledgeRecord>> {
        validate_required("document id", document_id)?;

        let result = self.connection.query_row(
            "
            SELECT unirag_source_id, knowledge_status
            FROM documents
            WHERE id = ?1
            ",
            [document_id],
            |row| {
                Ok(DocumentKnowledgeRecord {
                    unirag_source_id: row.get(0)?,
                    knowledge_status: row.get(1)?,
                })
            },
        );

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(StorageError::from(error)),
        }
    }

    /// 保存阅读位置（PageFlow 式 Reading Position Memory）：把前端定义的
    /// 位置 JSON 字符串（如 {page, scrollRatio, zoom, updatedAt}）写入
    /// documents.reading_position 列。文档不存在时报校验错误。
    pub fn set_reading_position(&self, document_id: &str, position_json: &str) -> StorageResult<()> {
        validate_required("document id", document_id)?;
        validate_required("position json", position_json)?;

        let updated = self.connection.execute(
            "
            UPDATE documents
            SET reading_position = ?2
            WHERE id = ?1
            ",
            params![document_id, position_json],
        )?;
        if updated == 0 {
            return Err(StorageError::Validation(format!(
                "document not found: {document_id}"
            )));
        }
        Ok(())
    }

    /// 读取阅读位置。文档不存在或未保存过位置时返回 None；
    /// 位置结构由前端定义，这里透传 JSON 字符串。
    pub fn get_reading_position(&self, document_id: &str) -> StorageResult<Option<String>> {
        validate_required("document id", document_id)?;

        let result = self.connection.query_row(
            "
            SELECT reading_position
            FROM documents
            WHERE id = ?1
            ",
            [document_id],
            |row| row.get::<_, Option<String>>(0),
        );

        match result {
            Ok(value) => Ok(value),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(StorageError::from(error)),
        }
    }

    pub fn upsert_document_content(
        &self,
        input: DocumentContentInput,
    ) -> StorageResult<DocumentContentRecord> {
        validate_required("document id", &input.document_id)?;
        validate_required("source type", &input.source_type)?;

        self.connection.execute(
            "
            INSERT INTO document_contents (
                document_id, content_text, source_type, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(document_id) DO UPDATE SET
                content_text = excluded.content_text,
                source_type = excluded.source_type,
                updated_at = excluded.updated_at
            ",
            params![
                input.document_id,
                input.content_text,
                input.source_type,
                input.created_at,
                input.updated_at,
            ],
        )?;

        self.load_document_content(&input.document_id)?
            .ok_or_else(|| StorageError::Validation("document content was not saved".into()))
    }

    pub fn load_document_content(
        &self,
        document_id: &str,
    ) -> StorageResult<Option<DocumentContentRecord>> {
        validate_required("document id", document_id)?;

        let result = self.connection.query_row(
            "
            SELECT document_id, content_text, source_type, created_at, updated_at
            FROM document_contents
            WHERE document_id = ?1
            ",
            [document_id],
            document_content_from_row,
        );

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(StorageError::from(error)),
        }
    }

    pub fn create_annotation(&self, input: AnnotationInput) -> StorageResult<AnnotationRecord> {
        validate_required("annotation id", &input.id)?;
        validate_required("document id", &input.document_id)?;
        validate_required("selected text", &input.selected_text)?;

        self.connection.execute(
            "
            INSERT INTO annotations (
                id, document_id, page, paragraph_id, selected_text, note,
                color, rect_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ",
            params![
                input.id,
                input.document_id,
                input.page,
                input.paragraph_id,
                input.selected_text,
                input.note,
                input.color,
                input.rect_json,
                input.created_at,
                input.updated_at,
            ],
        )?;

        self.get_annotation_by_id(&input.id)
    }

    pub fn list_annotations(&self, document_id: &str) -> StorageResult<Vec<AnnotationRecord>> {
        validate_required("document id", document_id)?;

        let mut statement = self.connection.prepare(
            "
            SELECT id, document_id, page, paragraph_id, selected_text, note,
                   color, rect_json, created_at, updated_at
            FROM annotations
            WHERE document_id = ?1
            ORDER BY created_at DESC
            ",
        )?;
        let rows = statement.query_map([document_id], annotation_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StorageError::from)
    }

    pub fn create_vibecard(&self, input: VibeCardInput) -> StorageResult<VibeCardRecord> {
        validate_required("card id", &input.id)?;
        validate_required("document id", &input.document_id)?;
        validate_required("card type", &input.card_type)?;

        self.connection.execute(
            "
            INSERT INTO vibecards (
                id, document_id, type, title, source_text, ai_content, user_note,
                page, paragraph_id, tags_json, source_json, created_at, updated_at,
                verification_status
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
                document_id = excluded.document_id,
                type = excluded.type,
                title = excluded.title,
                source_text = excluded.source_text,
                ai_content = excluded.ai_content,
                user_note = excluded.user_note,
                page = excluded.page,
                paragraph_id = excluded.paragraph_id,
                tags_json = excluded.tags_json,
                source_json = excluded.source_json,
                updated_at = excluded.updated_at,
                verification_status = excluded.verification_status
            ",
            params![
                input.id,
                input.document_id,
                input.card_type,
                input.title,
                input.source_text,
                input.ai_content,
                input.user_note,
                input.page,
                input.paragraph_id,
                input.tags_json,
                input.source_json,
                input.created_at,
                input.updated_at,
                input.verification_status,
            ],
        )?;

        self.get_vibecard_by_id(&input.id)
    }

    pub fn delete_vibecard(&self, id: &str) -> StorageResult<bool> {
        validate_required("card id", id)?;

        let affected = self
            .connection
            .execute("DELETE FROM vibecards WHERE id = ?1", [id])?;
        Ok(affected > 0)
    }

    pub fn list_vibecards(&self, document_id: &str) -> StorageResult<Vec<VibeCardRecord>> {
        validate_required("document id", document_id)?;

        let mut statement = self.connection.prepare(
            "
            SELECT id, document_id, type, title, source_text, ai_content, user_note,
                   page, paragraph_id, tags_json, source_json, created_at, updated_at,
                   verification_status
            FROM vibecards
            WHERE document_id = ?1
            ORDER BY created_at DESC
            ",
        )?;
        let rows = statement.query_map([document_id], vibecard_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StorageError::from)
    }

    pub fn replace_flashcard_decks(
        &self,
        document_id: &str,
        decks: Vec<FlashcardDeckInput>,
    ) -> StorageResult<Vec<FlashcardDeckRecord>> {
        validate_required("document id", document_id)?;

        self.connection.execute(
            "DELETE FROM flashcards WHERE document_id = ?1",
            [document_id],
        )?;
        self.connection.execute(
            "DELETE FROM flashcard_decks WHERE document_id = ?1",
            [document_id],
        )?;

        for deck in decks {
            validate_required("deck id", &deck.id)?;
            validate_required("document id", &deck.document_id)?;
            validate_required("deck title", &deck.title)?;

            if deck.document_id != document_id {
                return Err(StorageError::Validation(
                    "deck document id does not match target document".into(),
                ));
            }

            self.connection.execute(
                "
                INSERT INTO flashcard_decks (
                    id, document_id, title, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5)
                ",
                params![
                    &deck.id,
                    &deck.document_id,
                    deck.title,
                    deck.created_at,
                    deck.updated_at,
                ],
            )?;

            for card in deck.cards {
                validate_required("flashcard id", &card.id)?;
                validate_required("deck id", &card.deck_id)?;
                validate_required("document id", &card.document_id)?;
                validate_required("flashcard front", &card.front)?;

                if card.document_id != document_id {
                    return Err(StorageError::Validation(
                        "flashcard document id does not match target document".into(),
                    ));
                }
                if card.deck_id != deck.id {
                    return Err(StorageError::Validation(
                        "flashcard deck id does not match parent deck".into(),
                    ));
                }

                self.connection.execute(
                    "
                    INSERT INTO flashcards (
                        id, deck_id, document_id, front, back, known, unknown,
                        created_at, updated_at
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                    ",
                    params![
                        card.id,
                        card.deck_id,
                        card.document_id,
                        card.front,
                        card.back,
                        if card.known { 1 } else { 0 },
                        if card.unknown { 1 } else { 0 },
                        card.created_at,
                        card.updated_at,
                    ],
                )?;
            }
        }

        self.list_flashcard_decks(document_id)
    }

    pub fn list_flashcard_decks(
        &self,
        document_id: &str,
    ) -> StorageResult<Vec<FlashcardDeckRecord>> {
        validate_required("document id", document_id)?;

        let mut statement = self.connection.prepare(
            "
            SELECT id, document_id, title, created_at, updated_at
            FROM flashcard_decks
            WHERE document_id = ?1
            ORDER BY updated_at DESC, created_at DESC
            ",
        )?;
        let deck_rows = statement.query_map([document_id], flashcard_deck_from_row)?;
        let mut decks = deck_rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(StorageError::from)?;

        for deck in &mut decks {
            deck.cards = self.list_flashcards_for_deck(&deck.id)?;
        }

        Ok(decks)
    }

    pub fn upsert_conversation(
        &self,
        input: ConversationInput,
    ) -> StorageResult<ConversationRecord> {
        validate_required("session id", &input.session_id)?;

        self.connection.execute(
            "
            INSERT INTO conversations (
                session_id, document_id, title, messages_json, message_count,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(session_id) DO UPDATE SET
                document_id = excluded.document_id,
                title = excluded.title,
                messages_json = excluded.messages_json,
                message_count = excluded.message_count,
                updated_at = excluded.updated_at
            ",
            params![
                &input.session_id,
                input.document_id,
                input.title,
                input.messages_json,
                input.message_count,
                input.created_at,
                input.updated_at,
            ],
        )?;

        self.load_conversation(&input.session_id)?
            .ok_or_else(|| StorageError::Validation("conversation was not saved".into()))
    }

    pub fn load_conversation(&self, session_id: &str) -> StorageResult<Option<ConversationRecord>> {
        validate_required("session id", session_id)?;

        let result = self.connection.query_row(
            "
            SELECT session_id, document_id, title, messages_json, message_count,
                   created_at, updated_at
            FROM conversations
            WHERE session_id = ?1
            ",
            [session_id],
            conversation_from_row,
        );

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(StorageError::from(error)),
        }
    }

    pub fn list_conversations(&self) -> StorageResult<Vec<ConversationRecord>> {
        let mut statement = self.connection.prepare(
            "
            SELECT session_id, document_id, title, messages_json, message_count,
                   created_at, updated_at
            FROM conversations
            ORDER BY updated_at DESC, created_at DESC
            ",
        )?;
        let rows = statement.query_map([], conversation_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StorageError::from)
    }

    pub fn delete_conversation(&self, session_id: &str) -> StorageResult<bool> {
        validate_required("session id", session_id)?;

        let deleted = self.connection.execute(
            "DELETE FROM conversations WHERE session_id = ?1",
            [session_id],
        )?;
        Ok(deleted > 0)
    }

    pub fn upsert_thinking_tree(
        &self,
        input: ThinkingTreeInput,
    ) -> StorageResult<ThinkingTreeRecord> {
        validate_required("document id", &input.document_id)?;
        validate_required("tree json", &input.tree_json)?;

        self.connection.execute(
            "
            INSERT INTO thinking_trees (
                document_id, tree_json, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(document_id) DO UPDATE SET
                tree_json = excluded.tree_json,
                updated_at = excluded.updated_at
            ",
            params![
                &input.document_id,
                input.tree_json,
                input.created_at,
                input.updated_at,
            ],
        )?;

        self.load_thinking_tree(&input.document_id)?
            .ok_or_else(|| StorageError::Validation("thinking tree was not saved".into()))
    }

    pub fn load_thinking_tree(
        &self,
        document_id: &str,
    ) -> StorageResult<Option<ThinkingTreeRecord>> {
        validate_required("document id", document_id)?;

        let result = self.connection.query_row(
            "
            SELECT document_id, tree_json, created_at, updated_at
            FROM thinking_trees
            WHERE document_id = ?1
            ",
            [document_id],
            thinking_tree_from_row,
        );

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(StorageError::from(error)),
        }
    }

    pub fn replace_attention_insights(
        &self,
        document_id: &str,
        insights: Vec<AttentionInsightInput>,
    ) -> StorageResult<Vec<AttentionInsightRecord>> {
        validate_required("document id", document_id)?;

        self.connection.execute(
            "DELETE FROM attention_insights WHERE document_id = ?1",
            [document_id],
        )?;

        for insight in insights {
            validate_required("insight id", &insight.id)?;
            validate_required("document id", &insight.document_id)?;
            validate_required("insight type", &insight.insight_type)?;
            validate_required("paragraph id", &insight.paragraph_id)?;

            if insight.document_id != document_id {
                return Err(StorageError::Validation(
                    "insight document id does not match target document".into(),
                ));
            }

            self.connection.execute(
                "
                INSERT INTO attention_insights (
                    id, document_id, type, description, page, paragraph_index,
                    paragraph_id, payload_json, read_status, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                ",
                params![
                    insight.id,
                    insight.document_id,
                    insight.insight_type,
                    insight.description,
                    insight.page,
                    insight.paragraph_index,
                    insight.paragraph_id,
                    insight.payload_json,
                    insight.read_status,
                    insight.created_at,
                    insight.updated_at,
                ],
            )?;
        }

        self.list_attention_insights(document_id)
    }

    pub fn list_attention_insights(
        &self,
        document_id: &str,
    ) -> StorageResult<Vec<AttentionInsightRecord>> {
        validate_required("document id", document_id)?;

        let mut statement = self.connection.prepare(
            "
            SELECT id, document_id, type, description, page, paragraph_index,
                   paragraph_id, payload_json, read_status, created_at, updated_at
            FROM attention_insights
            WHERE document_id = ?1
            ORDER BY page ASC, paragraph_index ASC, created_at ASC
            ",
        )?;
        let rows = statement.query_map([document_id], attention_insight_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StorageError::from)
    }

    pub fn upsert_summary(&self, input: SummaryInput) -> StorageResult<SummaryRecord> {
        validate_required("summary id", &input.id)?;
        validate_required("document id", &input.document_id)?;
        validate_required("summary kind", &input.summary_kind)?;

        let section_id = input.section_id.unwrap_or_default();
        self.connection.execute(
            "
            INSERT INTO summaries (
                id, document_id, summary_kind, section_id, section_title, summary,
                key_points_json, raw_response, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(document_id, summary_kind, section_id) DO UPDATE SET
                id = excluded.id,
                section_title = excluded.section_title,
                summary = excluded.summary,
                key_points_json = excluded.key_points_json,
                raw_response = excluded.raw_response,
                updated_at = excluded.updated_at
            ",
            params![
                &input.id,
                &input.document_id,
                &input.summary_kind,
                &section_id,
                input.section_title,
                input.summary,
                input.key_points_json,
                input.raw_response,
                input.created_at,
                input.updated_at,
            ],
        )?;

        self.load_summary(&input.document_id, &input.summary_kind, Some(&section_id))?
            .ok_or_else(|| StorageError::Validation("summary was not saved".into()))
    }

    pub fn load_summary(
        &self,
        document_id: &str,
        summary_kind: &str,
        section_id: Option<&str>,
    ) -> StorageResult<Option<SummaryRecord>> {
        validate_required("document id", document_id)?;
        validate_required("summary kind", summary_kind)?;
        let section_id = section_id.unwrap_or_default();

        let result = self.connection.query_row(
            "
            SELECT id, document_id, summary_kind, section_id, section_title, summary,
                   key_points_json, raw_response, created_at, updated_at
            FROM summaries
            WHERE document_id = ?1 AND summary_kind = ?2 AND section_id = ?3
            ",
            params![document_id, summary_kind, section_id],
            summary_from_row,
        );

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(StorageError::from(error)),
        }
    }

    pub fn list_summaries(&self, document_id: &str) -> StorageResult<Vec<SummaryRecord>> {
        validate_required("document id", document_id)?;

        let mut statement = self.connection.prepare(
            "
            SELECT id, document_id, summary_kind, section_id, section_title, summary,
                   key_points_json, raw_response, created_at, updated_at
            FROM summaries
            WHERE document_id = ?1
            ORDER BY summary_kind ASC, section_id ASC, updated_at DESC
            ",
        )?;
        let rows = statement.query_map([document_id], summary_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StorageError::from)
    }

    pub fn export_reading_note(&self, document_id: &str) -> StorageResult<ReadingNoteExport> {
        validate_required("document id", document_id)?;

        let document = self.get_document_by_id(document_id)?;
        let payload = ReadingNoteExportPayload {
            export_type: READING_NOTE_EXPORT_TYPE.into(),
            schema_version: READING_NOTE_SCHEMA_VERSION,
            exported_at: current_time_millis(),
            document,
            document_content: self.load_document_content(document_id)?,
            summaries: self.list_summaries(document_id)?,
            annotations: self.list_annotations(document_id)?,
            vibecards: self.list_vibecards(document_id)?,
            flashcard_decks: self.list_flashcard_decks(document_id)?,
            attention_insights: self.list_attention_insights(document_id)?,
            thinking_tree: self.load_thinking_tree(document_id)?,
            conversations: self.list_conversations_for_document(document_id)?,
        };
        let markdown = render_reading_note_markdown(&payload);
        let json = serde_json::to_string_pretty(&payload)
            .map_err(|error| StorageError::Validation(error.to_string()))?;

        Ok(ReadingNoteExport {
            export_type: payload.export_type,
            schema_version: payload.schema_version,
            exported_at: payload.exported_at,
            document: payload.document,
            document_content: payload.document_content,
            summaries: payload.summaries,
            annotations: payload.annotations,
            vibecards: payload.vibecards,
            flashcard_decks: payload.flashcard_decks,
            attention_insights: payload.attention_insights,
            thinking_tree: payload.thinking_tree,
            conversations: payload.conversations,
            markdown,
            json,
        })
    }

    pub fn import_reading_note_json(&self, json: &str) -> StorageResult<ReadingNoteImportResult> {
        validate_required("reading note json", json)?;
        let payload: ReadingNoteExportPayload = serde_json::from_str(json)
            .map_err(|error| StorageError::Validation(error.to_string()))?;

        if payload.export_type != READING_NOTE_EXPORT_TYPE {
            return Err(StorageError::Validation(format!(
                "unsupported reading note export type: {}",
                payload.export_type
            )));
        }
        if payload.schema_version != READING_NOTE_SCHEMA_VERSION {
            return Err(StorageError::Validation(format!(
                "unsupported reading note schema version: {}",
                payload.schema_version
            )));
        }
        validate_payload_document_ids(&payload)?;

        let document_id = payload.document.id.clone();
        let document = self.upsert_document(document_input_from_record(&payload.document))?;

        self.connection.execute(
            "DELETE FROM annotations WHERE document_id = ?1",
            [&document_id],
        )?;
        self.connection.execute(
            "DELETE FROM vibecards WHERE document_id = ?1",
            [&document_id],
        )?;
        self.connection.execute(
            "DELETE FROM summaries WHERE document_id = ?1",
            [&document_id],
        )?;
        self.connection.execute(
            "DELETE FROM flashcards WHERE document_id = ?1",
            [&document_id],
        )?;
        self.connection.execute(
            "DELETE FROM flashcard_decks WHERE document_id = ?1",
            [&document_id],
        )?;
        self.connection.execute(
            "DELETE FROM attention_insights WHERE document_id = ?1",
            [&document_id],
        )?;
        self.connection.execute(
            "DELETE FROM thinking_trees WHERE document_id = ?1",
            [&document_id],
        )?;
        self.connection.execute(
            "DELETE FROM conversations WHERE document_id = ?1",
            [&document_id],
        )?;
        self.connection.execute(
            "DELETE FROM document_contents WHERE document_id = ?1",
            [&document_id],
        )?;

        if let Some(document_content) = &payload.document_content {
            self.upsert_document_content(document_content_input_from_record(document_content))?;
        }
        for summary in &payload.summaries {
            self.upsert_summary(summary_input_from_record(summary))?;
        }
        for annotation in &payload.annotations {
            self.create_annotation(annotation_input_from_record(annotation))?;
        }
        for card in &payload.vibecards {
            self.create_vibecard(vibecard_input_from_record(card))?;
        }
        self.replace_flashcard_decks(
            &document_id,
            payload
                .flashcard_decks
                .iter()
                .map(flashcard_deck_input_from_record)
                .collect(),
        )?;
        self.replace_attention_insights(
            &document_id,
            payload
                .attention_insights
                .iter()
                .map(attention_insight_input_from_record)
                .collect(),
        )?;
        if let Some(tree) = &payload.thinking_tree {
            self.upsert_thinking_tree(thinking_tree_input_from_record(tree))?;
        }
        for conversation in &payload.conversations {
            self.upsert_conversation(conversation_input_from_record(conversation))?;
        }

        Ok(ReadingNoteImportResult {
            document,
            summary_count: payload.summaries.len(),
            annotation_count: payload.annotations.len(),
            vibecard_count: payload.vibecards.len(),
            flashcard_deck_count: payload.flashcard_decks.len(),
            attention_insight_count: payload.attention_insights.len(),
            conversation_count: payload.conversations.len(),
        })
    }

    pub fn replace_source_spans(
        &self,
        document_id: &str,
        spans: Vec<SourceSpanInput>,
    ) -> StorageResult<Vec<SourceSpanRecord>> {
        validate_required("document id", document_id)?;

        self.connection.execute(
            "DELETE FROM source_spans WHERE document_id = ?1",
            [document_id],
        )?;

        for span in spans {
            validate_required("source span id", &span.id)?;
            validate_required("document id", &span.document_id)?;
            validate_required("paragraph id", &span.paragraph_id)?;
            validate_required("chunk id", &span.chunk_id)?;
            validate_required("source text", &span.text)?;

            if span.document_id != document_id {
                return Err(StorageError::Validation(
                    "source span document id does not match target document".into(),
                ));
            }

            self.connection.execute(
                "
                INSERT INTO source_spans (
                    id, document_id, page, paragraph_id, chunk_id, text,
                    normalized_text, order_index, source_type, metadata_json,
                    created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                ",
                params![
                    span.id,
                    span.document_id,
                    span.page,
                    span.paragraph_id,
                    span.chunk_id,
                    span.text,
                    normalize_index_text(&span.text),
                    span.order_index,
                    span.source_type,
                    span.metadata_json,
                    span.created_at,
                    span.updated_at,
                ],
            )?;
        }

        self.list_source_spans(document_id)
    }

    pub fn list_source_spans(&self, document_id: &str) -> StorageResult<Vec<SourceSpanRecord>> {
        validate_required("document id", document_id)?;

        let mut statement = self.connection.prepare(
            "
            SELECT id, document_id, page, paragraph_id, chunk_id, text, order_index,
                   source_type, metadata_json, created_at, updated_at
            FROM source_spans
            WHERE document_id = ?1
            ORDER BY order_index ASC, page ASC
            ",
        )?;
        let rows = statement.query_map([document_id], source_span_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StorageError::from)
    }

    pub fn search_source_spans(
        &self,
        document_id: &str,
        query: &str,
        limit: i64,
    ) -> StorageResult<Vec<SourceSpanRecord>> {
        validate_required("document id", document_id)?;
        let tokens = tokenize_query(query);
        if tokens.is_empty() {
            return Ok(vec![]);
        }

        let limit = limit.clamp(1, 20) as usize;
        let mut scored = self
            .list_source_spans(document_id)?
            .into_iter()
            .map(|span| {
                let score = source_span_score(&tokens, &span);
                (span, score)
            })
            .filter(|(_, score)| *score > 0)
            .collect::<Vec<_>>();

        scored.sort_by(|(left_span, left_score), (right_span, right_score)| {
            right_score
                .cmp(left_score)
                .then_with(|| left_span.order_index.cmp(&right_span.order_index))
        });

        Ok(scored
            .into_iter()
            .take(limit)
            .map(|(span, _)| span)
            .collect())
    }

    pub fn upsert_source_index_status(
        &self,
        input: SourceIndexStatusInput,
    ) -> StorageResult<SourceIndexStatusRecord> {
        validate_required("document id", &input.document_id)?;
        validate_required("index signature", &input.index_signature)?;

        self.connection.execute(
            "
            INSERT INTO source_index_status (
                document_id, index_signature, span_count, indexed_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(document_id) DO UPDATE SET
                index_signature = excluded.index_signature,
                span_count = excluded.span_count,
                indexed_at = excluded.indexed_at,
                updated_at = excluded.updated_at
            ",
            params![
                &input.document_id,
                &input.index_signature,
                input.span_count,
                input.indexed_at,
                input.updated_at,
            ],
        )?;

        self.load_source_index_status(&input.document_id)?
            .ok_or_else(|| StorageError::Validation("source index status was not saved".into()))
    }

    pub fn load_source_index_status(
        &self,
        document_id: &str,
    ) -> StorageResult<Option<SourceIndexStatusRecord>> {
        validate_required("document id", document_id)?;

        let result = self.connection.query_row(
            "
            SELECT document_id, index_signature, span_count, indexed_at, updated_at
            FROM source_index_status
            WHERE document_id = ?1
            ",
            [document_id],
            source_index_status_from_row,
        );

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(StorageError::from(error)),
        }
    }

    pub fn upsert_task(&self, input: TaskInput) -> StorageResult<TaskRecord> {
        validate_required("task id", &input.id)?;
        validate_required("task type", &input.task_type)?;
        validate_required("task status", &input.status)?;
        validate_task_status(&input.status)?;

        let progress = input.progress.clamp(0, 100);
        self.connection.execute(
            "
            INSERT INTO task_records (
                id, document_id, type, status, title, progress, payload_json,
                result_json, error_message, created_at, updated_at, started_at,
                completed_at, cancelled_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
            ON CONFLICT(id) DO UPDATE SET
                document_id = excluded.document_id,
                type = excluded.type,
                status = excluded.status,
                title = excluded.title,
                progress = excluded.progress,
                payload_json = excluded.payload_json,
                result_json = excluded.result_json,
                error_message = excluded.error_message,
                updated_at = excluded.updated_at,
                started_at = excluded.started_at,
                completed_at = excluded.completed_at,
                cancelled_at = excluded.cancelled_at
            ",
            params![
                &input.id,
                input.document_id,
                &input.task_type,
                &input.status,
                input.title,
                progress,
                input.payload_json,
                input.result_json,
                input.error_message,
                input.created_at,
                input.updated_at,
                input.started_at,
                input.completed_at,
                input.cancelled_at,
            ],
        )?;

        self.load_task(&input.id)?
            .ok_or_else(|| StorageError::Validation("task record was not saved".into()))
    }

    pub fn load_task(&self, id: &str) -> StorageResult<Option<TaskRecord>> {
        validate_required("task id", id)?;

        let result = self.connection.query_row(
            "
            SELECT id, document_id, type, status, title, progress, payload_json,
                   result_json, error_message, created_at, updated_at, started_at,
                   completed_at, cancelled_at
            FROM task_records
            WHERE id = ?1
            ",
            [id],
            task_from_row,
        );

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(error) => Err(StorageError::from(error)),
        }
    }

    pub fn list_tasks(&self, document_id: Option<&str>) -> StorageResult<Vec<TaskRecord>> {
        let mut statement = if document_id.is_some() {
            self.connection.prepare(
                "
                SELECT id, document_id, type, status, title, progress, payload_json,
                       result_json, error_message, created_at, updated_at, started_at,
                       completed_at, cancelled_at
                FROM task_records
                WHERE document_id = ?1
                ORDER BY updated_at DESC, created_at DESC
                ",
            )?
        } else {
            self.connection.prepare(
                "
                SELECT id, document_id, type, status, title, progress, payload_json,
                       result_json, error_message, created_at, updated_at, started_at,
                       completed_at, cancelled_at
                FROM task_records
                ORDER BY updated_at DESC, created_at DESC
                ",
            )?
        };

        if let Some(document_id) = document_id {
            validate_required("document id", document_id)?;
            let rows = statement.query_map([document_id], task_from_row)?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(StorageError::from)
        } else {
            let rows = statement.query_map([], task_from_row)?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(StorageError::from)
        }
    }

    fn get_document_by_id(&self, id: &str) -> StorageResult<DocumentRecord> {
        self.connection
            .query_row(
                "
                SELECT id, name, kind, source, path, mime_type, size, fingerprint,
                       opened_at, updated_at, parse_status
                FROM documents
                WHERE id = ?1
                ",
                [id],
                document_from_row,
            )
            .map_err(StorageError::from)
    }

    fn get_annotation_by_id(&self, id: &str) -> StorageResult<AnnotationRecord> {
        self.connection
            .query_row(
                "
                SELECT id, document_id, page, paragraph_id, selected_text, note,
                       color, rect_json, created_at, updated_at
                FROM annotations
                WHERE id = ?1
                ",
                [id],
                annotation_from_row,
            )
            .map_err(StorageError::from)
    }

    fn get_vibecard_by_id(&self, id: &str) -> StorageResult<VibeCardRecord> {
        self.connection
            .query_row(
                "
                SELECT id, document_id, type, title, source_text, ai_content, user_note,
                       page, paragraph_id, tags_json, source_json, created_at, updated_at,
                       verification_status
                FROM vibecards
                WHERE id = ?1
                ",
                [id],
                vibecard_from_row,
            )
            .map_err(StorageError::from)
    }

    fn list_flashcards_for_deck(&self, deck_id: &str) -> StorageResult<Vec<FlashcardRecord>> {
        let mut statement = self.connection.prepare(
            "
            SELECT id, deck_id, document_id, front, back, known, unknown, created_at, updated_at
            FROM flashcards
            WHERE deck_id = ?1
            ORDER BY created_at ASC, updated_at ASC
            ",
        )?;
        let rows = statement.query_map([deck_id], flashcard_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StorageError::from)
    }

    fn list_conversations_for_document(
        &self,
        document_id: &str,
    ) -> StorageResult<Vec<ConversationRecord>> {
        let mut statement = self.connection.prepare(
            "
            SELECT session_id, document_id, title, messages_json, message_count,
                   created_at, updated_at
            FROM conversations
            WHERE document_id = ?1
            ORDER BY updated_at DESC, created_at DESC
            ",
        )?;
        let rows = statement.query_map([document_id], conversation_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(StorageError::from)
    }
}

fn document_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentRecord> {
    Ok(DocumentRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        kind: row.get(2)?,
        source: row.get(3)?,
        path: row.get(4)?,
        mime_type: row.get(5)?,
        size: row.get(6)?,
        fingerprint: row.get(7)?,
        opened_at: row.get(8)?,
        updated_at: row.get(9)?,
        parse_status: row.get(10)?,
    })
}

fn document_content_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentContentRecord> {
    Ok(DocumentContentRecord {
        document_id: row.get(0)?,
        content_text: row.get(1)?,
        source_type: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn render_reading_note_markdown(payload: &ReadingNoteExportPayload) -> String {
    let mut output = String::new();
    let mut exported_source_refs: Vec<MarkdownSourceRef> = vec![];
    output.push_str("# Reading Note\n\n");
    output.push_str("## Metadata\n");
    output.push_str(&format!("- Title: {}\n", payload.document.name));
    output.push_str(&format!("- Source: {}\n", payload.document.source));
    output.push_str(&format!("- Document ID: {}\n", payload.document.id));
    output.push_str(&format!("- Opened At: {}\n", payload.document.opened_at));
    output.push_str(&format!("- Exported At: {}\n\n", payload.exported_at));

    output.push_str("## One-line Summary\n\n");
    if let Some(summary) = payload.summaries.first() {
        output.push_str(&summary.summary);
        output.push_str("\n\n");
    } else {
        output.push_str("_No summary saved yet._\n\n");
    }

    output.push_str("## Structure\n\n");
    if payload.thinking_tree.is_some() {
        output.push_str("- Thinking Tree saved for this document.\n\n");
    } else {
        output.push_str("_No Thinking Tree saved yet._\n\n");
    }

    output.push_str("## Section Summaries\n\n");
    if payload.summaries.is_empty() {
        output.push_str("_No section summaries saved yet._\n\n");
    } else {
        for summary in &payload.summaries {
            let title = if summary.section_title.is_empty() {
                summary.summary_kind.as_str()
            } else {
                summary.section_title.as_str()
            };
            output.push_str(&format!("### {}\n\n{}\n\n", title, summary.summary));
            let key_points = parse_json_string_list(&summary.key_points_json);
            for point in key_points {
                output.push_str(&format!("- {}\n", point));
            }
            output.push('\n');
        }
    }

    output.push_str("## Important Insights\n\n");
    if payload.attention_insights.is_empty() {
        output.push_str("_No attention insights saved yet._\n\n");
    } else {
        for insight in &payload.attention_insights {
            output.push_str(&format!(
                "- [{}] P{}: {}\n",
                insight.insight_type, insight.page, insight.description
            ));
        }
        output.push('\n');
    }

    output.push_str("## VibeCards\n\n");
    if payload.vibecards.is_empty() {
        output.push_str("_No VibeCards saved yet._\n\n");
    } else {
        for card in &payload.vibecards {
            let ai_content = parse_json_object(&card.ai_content);
            let source_refs = card_source_refs(card, ai_content.as_ref());
            let page = card_page_label(card, &source_refs);
            output.push_str(&format!(
                "- {} ({}, {})\n",
                card.title, card.card_type, page
            ));
            if card.card_type == "reading_note" {
                if let Some(body) = ai_content
                    .as_ref()
                    .and_then(|content| json_string_field(content, "body"))
                {
                    if !body.is_empty() {
                        output.push_str(&format!("  - Body: {}\n", body));
                    }
                }
            }
            if !card.source_text.is_empty() {
                output.push_str(&format!("  - Source: {}\n", card.source_text));
            }
            for source_ref in source_refs {
                output.push_str(&format!("  - Source ref: {}\n", source_ref.markdown_link()));
                push_unique_source_ref(&mut exported_source_refs, source_ref);
            }
            if !card.user_note.is_empty() {
                output.push_str(&format!("  - Note: {}\n", card.user_note));
            }
        }
        output.push('\n');
    }

    output.push_str("## Flashcards\n\n");
    if payload.flashcard_decks.is_empty() {
        output.push_str("_No flashcards saved yet._\n\n");
    } else {
        for deck in &payload.flashcard_decks {
            output.push_str(&format!("### {}\n\n", deck.title));
            for card in &deck.cards {
                output.push_str(&format!("- Q: {}\n  A: {}\n", card.front, card.back));
            }
            output.push('\n');
        }
    }

    output.push_str("## AI Q&A\n\n");
    if payload.conversations.is_empty() {
        output.push_str("_No document-bound AI conversations saved yet._\n\n");
    } else {
        for conversation in &payload.conversations {
            output.push_str(&format!(
                "- {} ({} messages)\n",
                conversation.title, conversation.message_count
            ));
        }
        output.push('\n');
    }

    output.push_str("## My Notes\n\n");
    if payload.annotations.is_empty() {
        output.push_str("_No highlights or notes saved yet._\n\n");
    } else {
        for annotation in &payload.annotations {
            output.push_str(&format!(
                "- P{}: {}",
                annotation.page, annotation.selected_text
            ));
            if !annotation.note.is_empty() {
                output.push_str(&format!(" — {}", annotation.note));
            }
            output.push('\n');
        }
        output.push('\n');
    }

    if !exported_source_refs.is_empty() {
        output.push_str("## Sources\n\n");
        for source_ref in &exported_source_refs {
            output.push_str(&format!("<a id=\"{}\"></a>\n\n", source_ref.anchor));
            output.push_str(&format!("### {}\n\n", source_ref.label));
            if let Some(text) = &source_ref.text {
                output.push_str(&format!("> {}\n\n", text));
            } else {
                output.push_str("_No source excerpt saved._\n\n");
            }
        }
    }

    output.push_str("## Follow-up\n\n- \n");
    output
}

fn parse_json_string_list(value: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(value).unwrap_or_default()
}

fn parse_json_object(value: &str) -> Option<serde_json::Value> {
    serde_json::from_str::<serde_json::Value>(value).ok()
}

fn json_string_field<'a>(value: &'a serde_json::Value, key: &str) -> Option<&'a str> {
    value.get(key)?.as_str().map(str::trim)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MarkdownSourceRef {
    label: String,
    anchor: String,
    text: Option<String>,
}

impl MarkdownSourceRef {
    fn new(label: String, text: Option<String>) -> Self {
        Self {
            anchor: source_ref_anchor(&label),
            label,
            text,
        }
    }

    fn markdown_link(&self) -> String {
        format!("[{}](#{})", self.label, self.anchor)
    }
}

fn card_page_label(card: &VibeCardRecord, source_refs: &[MarkdownSourceRef]) -> String {
    card.page
        .map(|page| format!("P{}", page))
        .or_else(|| {
            source_refs
                .first()
                .map(|source_ref| source_ref.label.clone())
        })
        .unwrap_or_else(|| "No source page".into())
}

fn card_source_refs(
    card: &VibeCardRecord,
    ai_content: Option<&serde_json::Value>,
) -> Vec<MarkdownSourceRef> {
    let refs = ai_content
        .and_then(|content| content.get("sourceRefs"))
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(source_ref_label)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if !refs.is_empty() {
        return refs;
    }

    match (card.page, card.paragraph_id.as_deref()) {
        (Some(page), Some(paragraph_id)) => {
            vec![MarkdownSourceRef::new(
                format!("P{} {}", page, paragraph_id),
                if card.source_text.is_empty() {
                    None
                } else {
                    Some(card.source_text.clone())
                },
            )]
        }
        (Some(page), None) => vec![MarkdownSourceRef::new(
            format!("P{}", page),
            if card.source_text.is_empty() {
                None
            } else {
                Some(card.source_text.clone())
            },
        )],
        _ => vec![],
    }
}

fn source_ref_label(value: &serde_json::Value) -> Option<MarkdownSourceRef> {
    let page = value.get("page").and_then(serde_json::Value::as_i64);
    let paragraph_id = value
        .get("paragraphId")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|paragraph_id| !paragraph_id.is_empty());
    let text = value
        .get("text")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string);

    let label = match (page, paragraph_id) {
        (Some(page), Some(paragraph_id)) => Some(format!("P{} {}", page, paragraph_id)),
        (Some(page), None) => Some(format!("P{}", page)),
        (None, Some(paragraph_id)) => Some(paragraph_id.to_string()),
        (None, None) => None,
    }?;

    Some(MarkdownSourceRef::new(label, text))
}

fn source_ref_anchor(label: &str) -> String {
    let slug = label
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");

    format!("source-{}", slug)
}

fn push_unique_source_ref(source_refs: &mut Vec<MarkdownSourceRef>, source_ref: MarkdownSourceRef) {
    if !source_refs
        .iter()
        .any(|existing| existing.anchor == source_ref.anchor)
    {
        source_refs.push(source_ref);
    }
}

fn annotation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AnnotationRecord> {
    Ok(AnnotationRecord {
        id: row.get(0)?,
        document_id: row.get(1)?,
        page: row.get(2)?,
        paragraph_id: row.get(3)?,
        selected_text: row.get(4)?,
        note: row.get(5)?,
        color: row.get(6)?,
        rect_json: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn vibecard_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<VibeCardRecord> {
    Ok(VibeCardRecord {
        id: row.get(0)?,
        document_id: row.get(1)?,
        card_type: row.get(2)?,
        title: row.get(3)?,
        source_text: row.get(4)?,
        ai_content: row.get(5)?,
        user_note: row.get(6)?,
        page: row.get(7)?,
        paragraph_id: row.get(8)?,
        tags_json: row.get(9)?,
        source_json: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        verification_status: row.get(13)?,
    })
}

fn flashcard_deck_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FlashcardDeckRecord> {
    Ok(FlashcardDeckRecord {
        id: row.get(0)?,
        document_id: row.get(1)?,
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        cards: vec![],
    })
}

fn flashcard_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FlashcardRecord> {
    let known: i64 = row.get(5)?;
    let unknown: i64 = row.get(6)?;

    Ok(FlashcardRecord {
        id: row.get(0)?,
        deck_id: row.get(1)?,
        document_id: row.get(2)?,
        front: row.get(3)?,
        back: row.get(4)?,
        known: known != 0,
        unknown: unknown != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn conversation_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConversationRecord> {
    Ok(ConversationRecord {
        session_id: row.get(0)?,
        document_id: row.get(1)?,
        title: row.get(2)?,
        messages_json: row.get(3)?,
        message_count: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn thinking_tree_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ThinkingTreeRecord> {
    Ok(ThinkingTreeRecord {
        document_id: row.get(0)?,
        tree_json: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

fn attention_insight_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AttentionInsightRecord> {
    Ok(AttentionInsightRecord {
        id: row.get(0)?,
        document_id: row.get(1)?,
        insight_type: row.get(2)?,
        description: row.get(3)?,
        page: row.get(4)?,
        paragraph_index: row.get(5)?,
        paragraph_id: row.get(6)?,
        payload_json: row.get(7)?,
        read_status: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SummaryRecord> {
    let section_id: String = row.get(3)?;
    Ok(SummaryRecord {
        id: row.get(0)?,
        document_id: row.get(1)?,
        summary_kind: row.get(2)?,
        section_id: if section_id.is_empty() {
            None
        } else {
            Some(section_id)
        },
        section_title: row.get(4)?,
        summary: row.get(5)?,
        key_points_json: row.get(6)?,
        raw_response: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn source_span_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceSpanRecord> {
    Ok(SourceSpanRecord {
        id: row.get(0)?,
        document_id: row.get(1)?,
        page: row.get(2)?,
        paragraph_id: row.get(3)?,
        chunk_id: row.get(4)?,
        text: row.get(5)?,
        order_index: row.get(6)?,
        source_type: row.get(7)?,
        metadata_json: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn source_index_status_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<SourceIndexStatusRecord> {
    Ok(SourceIndexStatusRecord {
        document_id: row.get(0)?,
        index_signature: row.get(1)?,
        span_count: row.get(2)?,
        indexed_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn task_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskRecord> {
    Ok(TaskRecord {
        id: row.get(0)?,
        document_id: row.get(1)?,
        task_type: row.get(2)?,
        status: row.get(3)?,
        title: row.get(4)?,
        progress: row.get(5)?,
        payload_json: row.get(6)?,
        result_json: row.get(7)?,
        error_message: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        started_at: row.get(11)?,
        completed_at: row.get(12)?,
        cancelled_at: row.get(13)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_legacy_documents_table_without_knowledge_columns() {
        let storage = Storage::open_memory().expect("open memory db");
        // 模拟老库：先手工建一个缺少 unirag_source_id / knowledge_status 列的 documents 表
        storage
            .connection
            .execute_batch(
                "
                CREATE TABLE documents (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    source TEXT NOT NULL,
                    path TEXT,
                    mime_type TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    fingerprint TEXT,
                    opened_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    parse_status TEXT NOT NULL
                );
                ",
            )
            .expect("create legacy documents table");

        // init_schema：CREATE TABLE IF NOT EXISTS 跳过已存在的表，迁移负责补列
        storage.init_schema().expect("init schema migrates columns");

        storage
            .upsert_document(DocumentInput {
                id: "doc-legacy".into(),
                name: "Legacy.pdf".into(),
                kind: "pdf".into(),
                source: "local-file".into(),
                path: None,
                mime_type: "application/pdf".into(),
                size: 10,
                fingerprint: None,
                opened_at: 100,
                updated_at: 100,
                parse_status: "parsed".into(),
            })
            .expect("insert legacy document");

        storage
            .set_document_knowledge(
                "doc-legacy",
                Some("src-legacy".into()),
                Some("completed".into()),
            )
            .expect("set knowledge link on migrated columns");

        let link = storage
            .get_document_knowledge("doc-legacy")
            .expect("get knowledge link")
            .expect("link exists");
        assert_eq!(link.unirag_source_id.as_deref(), Some("src-legacy"));
        assert_eq!(link.knowledge_status.as_deref(), Some("completed"));
    }

    #[test]
    fn migrates_legacy_documents_table_without_reading_position_column() {
        let storage = Storage::open_memory().expect("open memory db");
        // 模拟老库：先手工建一个只有 unirag/knowledge 列、缺少 reading_position 列的 documents 表
        storage
            .connection
            .execute_batch(
                "
                CREATE TABLE documents (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    source TEXT NOT NULL,
                    path TEXT,
                    mime_type TEXT NOT NULL,
                    size INTEGER NOT NULL,
                    fingerprint TEXT,
                    opened_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    parse_status TEXT NOT NULL,
                    unirag_source_id TEXT,
                    knowledge_status TEXT
                );
                ",
            )
            .expect("create legacy documents table");

        // init_schema：CREATE TABLE IF NOT EXISTS 跳过已存在的表，迁移负责补 reading_position 列
        storage.init_schema().expect("init schema migrates column");

        storage
            .upsert_document(DocumentInput {
                id: "doc-legacy-position".into(),
                name: "Legacy Position.pdf".into(),
                kind: "pdf".into(),
                source: "local-file".into(),
                path: None,
                mime_type: "application/pdf".into(),
                size: 10,
                fingerprint: None,
                opened_at: 100,
                updated_at: 100,
                parse_status: "parsed".into(),
            })
            .expect("insert legacy document");

        let position_json = r#"{"page":3,"scrollRatio":0.5,"zoom":1.0,"updatedAt":42}"#;
        storage
            .set_reading_position("doc-legacy-position", position_json)
            .expect("set reading position on migrated column");

        assert_eq!(
            storage
                .get_reading_position("doc-legacy-position")
                .expect("get reading position")
                .expect("position exists"),
            position_json
        );
    }
}
