pub mod commands;
pub mod core;

use commands::api_keys::{storage_delete_api_key, storage_get_api_key, storage_set_api_key};
use commands::storage::{
    storage_create_annotation, storage_create_vibecard, storage_delete_conversation,
    storage_delete_vibecard, storage_export_reading_note, storage_get_document_knowledge,
    storage_get_reading_position, storage_import_reading_note_json, storage_init,
    storage_list_annotations, storage_list_attention_insights, storage_list_conversations,
    storage_list_documents, storage_list_flashcard_decks, storage_list_source_spans,
    storage_list_summaries, storage_list_tasks, storage_list_vibecards, storage_load_conversation,
    storage_load_document_content, storage_load_source_index_status, storage_load_summary,
    storage_load_task, storage_load_thinking_tree, storage_replace_attention_insights,
    storage_replace_flashcard_decks, storage_replace_source_spans, storage_search_source_spans,
    storage_set_document_knowledge, storage_set_reading_position, storage_upsert_conversation,
    storage_upsert_document, storage_upsert_document_content, storage_upsert_source_index_status,
    storage_upsert_summary, storage_upsert_task, storage_upsert_thinking_tree, StorageState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(StorageState::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            storage_init,
            storage_upsert_document,
            storage_list_documents,
            storage_set_document_knowledge,
            storage_get_document_knowledge,
            storage_get_reading_position,
            storage_set_reading_position,
            storage_upsert_document_content,
            storage_load_document_content,
            storage_create_annotation,
            storage_list_annotations,
            storage_create_vibecard,
            storage_delete_vibecard,
            storage_list_vibecards,
            storage_replace_flashcard_decks,
            storage_list_flashcard_decks,
            storage_upsert_conversation,
            storage_load_conversation,
            storage_list_conversations,
            storage_delete_conversation,
            storage_upsert_thinking_tree,
            storage_load_thinking_tree,
            storage_replace_attention_insights,
            storage_list_attention_insights,
            storage_upsert_summary,
            storage_load_summary,
            storage_list_summaries,
            storage_export_reading_note,
            storage_import_reading_note_json,
            storage_replace_source_spans,
            storage_list_source_spans,
            storage_search_source_spans,
            storage_upsert_source_index_status,
            storage_load_source_index_status,
            storage_upsert_task,
            storage_load_task,
            storage_list_tasks,
            storage_set_api_key,
            storage_get_api_key,
            storage_delete_api_key,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
