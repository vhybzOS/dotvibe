//! Perfect Semantic Search FFI
//! Ultra-Functioning: embed() -> Id, query() -> Vec<SearchMatch>

use std::ffi::{CStr, CString, c_char};
use std::sync::{Arc, OnceLock};
use std::ptr;
use tokio::runtime::Runtime;
use serde::{Deserialize, Serialize};
use surrealdb::{Surreal, engine::local::Db, engine::local::RocksDb, sql::Id, sql::Thing};
use embed_anything::{embeddings::embed::Embedder, embed_query};
use anyhow::Result;

// Global state - initialized once via withConfig()
static RUNTIME: OnceLock<Runtime> = OnceLock::new();
static mut DATABASE: Option<Arc<Surreal<Db>>> = None;
static mut EMBEDDER: Option<Arc<Embedder>> = None;
static mut CONFIG: Option<GlobalConfig> = None;

// Configuration types - matching EmbedAnything's actual capabilities
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GlobalConfig {
    pub db_file_path: String,
    pub ranking: RankingStrategy,
    pub embedding: EmbedAnythingConfig,
    pub threshold: f32,
    pub limit: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmbedAnythingConfig {
    pub model_architecture: String,    // "jina", "bert", "clip"
    pub model_id: String,              // "jinaai/jina-embeddings-v2-small-en"
    pub revision: Option<String>,      // "main" or specific commit
    pub batch_size: Option<usize>,     // Processing batch size
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum RankingStrategy {
    Cosine,
    Euclidean, 
    Manhattan,
    Dot,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchMatch {
    pub id: String,                    // Serialized Id for FFI transfer
    pub similarity_score: f32,
}

// SurrealQL query templates - PERFECTED syntax
fn get_query_template(strategy: &RankingStrategy) -> &'static str {
    match strategy {
        RankingStrategy::Cosine => r#"
            SELECT * FROM (
                SELECT id, vector::similarity::cosine(vector, $query_vector) AS similarity_score
                FROM embeddings
            ) WHERE similarity_score > $threshold
            ORDER BY similarity_score DESC 
            LIMIT $limit
        "#,
        RankingStrategy::Euclidean => r#"
            SELECT * FROM (
                SELECT id, (1.0 / (1.0 + vector::distance::euclidean(vector, $query_vector))) AS similarity_score
                FROM embeddings
            ) WHERE similarity_score > $threshold
            ORDER BY similarity_score DESC 
            LIMIT $limit
        "#,
        RankingStrategy::Manhattan => r#"
            SELECT * FROM (
                SELECT id, (1.0 / (1.0 + vector::distance::manhattan(vector, $query_vector))) AS similarity_score
                FROM embeddings
            ) WHERE similarity_score > $threshold
            ORDER BY similarity_score DESC 
            LIMIT $limit
        "#,
        RankingStrategy::Dot => r#"
            SELECT * FROM (
                SELECT id, vector::similarity::dot(vector, $query_vector) AS similarity_score
                FROM embeddings
            ) WHERE similarity_score > $threshold
            ORDER BY similarity_score DESC 
            LIMIT $limit
        "#,
    }
}

// Database connection with PERFECT SurrealQL
async fn connect_database(db_path: &str) -> Result<Arc<Surreal<Db>>> {
    // Create .vibe directory if it doesn't exist
    if let Some(parent) = std::path::Path::new(db_path).parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    
    // Direct RocksDB file access - the performance advantage
    let db = Surreal::new::<RocksDb>(db_path).await?;
    db.use_ns("vibe").use_db("code").await?;
    
    // PERFECT table definition
    db.query(r#"
        DEFINE TABLE IF NOT EXISTS embeddings SCHEMAFULL;
        DEFINE FIELD IF NOT EXISTS id ON TABLE embeddings TYPE record<embeddings>;
        DEFINE FIELD IF NOT EXISTS vector ON TABLE embeddings TYPE array<float>;
    "#).await?;
    
    Ok(Arc::new(db))
}

// EmbedAnything integration - using their actual API
fn create_embedder(config: &EmbedAnythingConfig) -> Result<Embedder> {
    let embedder = Embedder::from_pretrained_hf(
        &config.model_architecture,
        &config.model_id,
        config.revision.as_deref(),
        None, // token
        None  // dtype
    )?;
    Ok(embedder)
}

// Private function: text -> vector (used by both embed and query)
async fn embed_text(text: &str) -> Result<Vec<f32>> {
    let embedder = unsafe { 
        EMBEDDER.as_ref().ok_or_else(|| anyhow::anyhow!("Embedder not initialized"))? 
    };
    
    // Use correct embed_query signature: &[&str], &Embedder, Option<&TextEmbedConfig>
    let text_slice = &[text];
    let embeddings = embed_query(text_slice, embedder, None).await?;
    
    // Extract the dense vector from EmbedData
    if let Some(embed_data) = embeddings.first() {
        let dense_vector = embed_data.embedding.to_dense()?;
        Ok(dense_vector)
    } else {
        Err(anyhow::anyhow!("No embeddings generated"))
    }
}

// Helper: Convert SurrealDB Id to C string for FFI
fn id_to_cstring(id: &Id) -> *const c_char {
    let id_string = id.to_string();
    match CString::new(id_string) {
        Ok(cstring) => {
            let ptr = cstring.as_ptr();
            std::mem::forget(cstring); // Prevent deallocation - caller must free
            ptr
        },
        Err(_) => ptr::null(),
    }
}

// Helper: Convert Vec<SearchMatch> to JSON C string for FFI
fn matches_to_cstring(matches: &[SearchMatch]) -> *const c_char {
    match serde_json::to_string(matches) {
        Ok(json) => {
            match CString::new(json) {
                Ok(cstring) => {
                    let ptr = cstring.as_ptr();
                    std::mem::forget(cstring); // Prevent deallocation
                    ptr
                },
                Err(_) => ptr::null(),
            }
        },
        Err(_) => ptr::null(),
    }
}

// FFI initialization function
#[no_mangle]
pub extern "C" fn with_config(config_json: *const c_char) -> i32 {
    let runtime = RUNTIME.get_or_init(|| Runtime::new().unwrap());
    
    let config_str = unsafe {
        match CStr::from_ptr(config_json).to_str() {
            Ok(s) => s,
            Err(_) => return -1,
        }
    };
    
    let config: GlobalConfig = match serde_json::from_str(config_str) {
        Ok(c) => c,
        Err(_) => return -2,
    };
    
    // Initialize database
    let db = match runtime.block_on(connect_database(&config.db_file_path)) {
        Ok(db) => db,
        Err(_) => return -3,
    };
    
    // Initialize embedder
    let embedder = match create_embedder(&config.embedding) {
        Ok(e) => Arc::new(e),
        Err(_) => return -4,
    };
    
    // Store global state
    unsafe {
        DATABASE = Some(db);
        EMBEDDER = Some(embedder);
        CONFIG = Some(config);
    }
    
    0 // Success
}

// PERFECT API Function 1: embed(text) -> *const c_char (serialized Id)
#[no_mangle]
pub extern "C" fn embed(text: *const c_char) -> *const c_char {
    let runtime = match RUNTIME.get() {
        Some(rt) => rt,
        None => return ptr::null(),
    };
    
    let text_str = unsafe {
        match CStr::from_ptr(text).to_str() {
            Ok(s) => s,
            Err(_) => return ptr::null(),
        }
    };
    
    let result = runtime.block_on(async {
        // Generate embedding vector
        let vector = embed_text(text_str).await?;
        
        // Store in database with auto-generated ID
        let db = unsafe { DATABASE.as_ref().unwrap() };
        let mut response = db.query("CREATE embeddings SET vector = $vector")
            .bind(("vector", vector))
            .await?;
        
        // Use proper SurrealDB record type with Thing ID
        #[derive(Serialize, Deserialize, Debug)]
        struct EmbeddingRecord {
            id: Thing,
            vector: Vec<f32>,
        }
        
        let records: Vec<EmbeddingRecord> = response.take(0)?;
        
        if let Some(record) = records.first() {
            let id: Id = Id::from(record.id.id.clone());
            return Ok(id);
        }
        
        Err(anyhow::anyhow!("Failed to extract created ID"))
    });
    
    match result {
        Ok(id) => id_to_cstring(&id),
        Err(_) => ptr::null(),
    }
}

// PERFECT API Function 2: query(text) -> *const c_char (JSON SearchMatch[])
#[no_mangle]
pub extern "C" fn query(text: *const c_char) -> *const c_char {
    let runtime = match RUNTIME.get() {
        Some(rt) => rt,
        None => return ptr::null(),
    };
    
    let text_str = unsafe {
        match CStr::from_ptr(text).to_str() {
            Ok(s) => s,
            Err(_) => return ptr::null(),
        }
    };
    
    let result = runtime.block_on(async {
        // Generate query vector
        let query_vector = embed_text(text_str).await?;
        
        // Get configuration
        let config = unsafe { CONFIG.as_ref().unwrap() };
        
        // Build and execute PERFECT query
        let db = unsafe { DATABASE.as_ref().unwrap() };
        let query_template = get_query_template(&config.ranking);
        
        let mut response = db.query(query_template)
            .bind(("query_vector", query_vector))
            .bind(("threshold", config.threshold))
            .bind(("limit", config.limit as i64))
            .await?;
        
        // Use proper SurrealDB record type for query results
        #[derive(Serialize, Deserialize, Debug)]
        struct QueryResult {
            id: Thing,
            similarity_score: f64,
        }
        
        let results: Vec<QueryResult> = response.take(0)?;
        
        let matches: Vec<SearchMatch> = results
            .into_iter()
            .map(|result| SearchMatch {
                id: result.id.id.to_string(),
                similarity_score: result.similarity_score as f32,
            })
            .collect();
        
        Ok::<Vec<SearchMatch>, anyhow::Error>(matches)
    });
    
    match result {
        Ok(matches) => matches_to_cstring(&matches),
        Err(_) => ptr::null(),
    }
}

// Memory cleanup function
#[no_mangle]
pub extern "C" fn free_cstring(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr);
        }
    }
}

// Cleanup function
#[no_mangle]
pub extern "C" fn cleanup() {
    unsafe {
        DATABASE = None;
        EMBEDDER = None;
        CONFIG = None;
    }
}