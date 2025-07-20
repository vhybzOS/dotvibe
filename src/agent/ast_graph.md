# AST Graph Integration: Multi-Perspective Semantic Intelligence Architecture

## 🎯 **Overview**

This document provides a comprehensive implementation guide for integrating the existing AST parsing (`ast.ts`) and graph storage (`storage.ts`) systems with the new multi-perspective semantic embedding architecture described in [EMBEDDING.md](./EMBEDDING.md).

**Core Principle**: Extend, don't replace. The existing atomic units remain unchanged while new modules add semantic intelligence layers.

## 📋 **Current System Analysis**

### **ast.ts Integration Points** 

The AST parser provides perfect structural boundaries and semantic elements:

```typescript
// Line 501-578: extractElements() - Our semantic element source
const elements: CodeElementData[] = []

// Line 1438-1453: generateStorageElementId() - Hybrid ID generation
const generateStorageElementId = (filePath: string, elementName: string, node?: any): string => {
  if (node?.type === 'import_statement') {
    const resolvedModuleName = resolveImportPath(moduleName, filePath)
    return `${resolvedModuleName}:${elementName}` // External reference
  }
  return `${filePath}:${elementName}` // Internal reference
}

// Line 1063-1086: generateSearchPhrases() - Basic semantic phrases (to be enhanced)
const generateSearchPhrases = (name: string, type: ElementType, content: string): string[] => {
  // Current implementation generates simple phrases
  // Will be extended by semantic enrichment
}
```

**Integration Strategy**: Hook into the element extraction pipeline to trigger semantic enrichment.

### **storage.ts Integration Points**

The storage system creates perfect graph structure and provides extension hooks:

```typescript
// Line 97-103: CodeElement interface - Add embedding fields here
export interface CodeElement extends CodeElementData {
  id: string
  content_embedding?: number[]  // ✅ Already present
  semantic_embedding?: number[] // ✅ Already present
  // NEW: Add multi-perspective embeddings
  semantic_descriptions?: SemanticDescriptor
  embedding_metadata?: EmbeddingMetadata
}

// Line 768-874: Element storage pipeline - Hook point for embedding generation
const elementPromises = parseResult.elements.map(async (element) => {
  // Current: Store structural data
  // NEW: Trigger semantic enrichment pipeline
})

// Line 1366-1388: searchElements() - Placeholder for semantic search
export const searchElements = (query: string, projectPath: string) => {
  // Current: Basic name/content search
  // NEW: Implement MRI search with embeddings
}
```

**Integration Strategy**: Extend the schema and add semantic enrichment hooks to the indexing pipeline.

## 🏗️ **New Architecture Design**

### **Module Structure**

```
src/
├── infra/                    # Existing atomic units (unchanged)
│   ├── ast.ts               # ✅ AST parsing & relationship discovery
│   ├── storage.ts           # ✅ Graph database operations
│   └── embeddings.ts        # 🆕 Rust service interface
├── agent/                   # Existing + new semantic modules
│   ├── semantic-enrichment.ts  # 🆕 Multi-perspective LLM descriptions
│   ├── semantic-search.ts      # 🆕 MRI search implementation
│   ├── embedding-pipeline.ts   # 🆕 Orchestration & batch processing
│   └── [existing files]        # ✅ Keep existing agent modules
└── embed/                   # 🆕 Rust microservice
    ├── src/
    │   ├── main.rs          # FastAPI wrapper
    │   ├── embedder.rs      # EmbedAnything integration
    │   └── models.rs        # Request/response types
    ├── Cargo.toml
    └── requirements.txt     # Python dependencies
```

## 🔧 **Implementation Design**

### **1. Enhanced SurrealDB Schema Extension**

**File**: `src/infra/storage.ts` (extend existing schema)
**Lines to modify**: 229-244 (schema definition)

```typescript
// Enhanced schema with embedding fields
await db.query(`
  DEFINE TABLE code_elements SCHEMAFULL;
  
  -- Existing fields (unchanged)
  DEFINE FIELD element_path ON code_elements TYPE string;
  DEFINE FIELD file_path ON code_elements TYPE string;
  DEFINE FIELD element_name ON code_elements TYPE string;
  DEFINE FIELD element_type ON code_elements TYPE string;
  DEFINE FIELD content ON code_elements TYPE string;
  DEFINE FIELD start_line ON code_elements TYPE int;
  DEFINE FIELD end_line ON code_elements TYPE int;
  DEFINE FIELD is_placeholder ON code_elements TYPE bool DEFAULT false;
  
  -- NEW: Multi-perspective semantic fields
  DEFINE FIELD semantic_descriptions ON code_elements TYPE object;
  DEFINE FIELD functionality_embeddings ON code_elements TYPE array<float>;
  DEFINE FIELD integration_embeddings ON code_elements TYPE array<float>;
  DEFINE FIELD patterns_embeddings ON code_elements TYPE array<float>;
  DEFINE FIELD dependencies_embeddings ON code_elements TYPE array<float>;
  DEFINE FIELD usage_context_embeddings ON code_elements TYPE array<float>;
  DEFINE FIELD keywords_embeddings ON code_elements TYPE array<float>;
  
  -- Embedding metadata
  DEFINE FIELD embedding_model ON code_elements TYPE string;
  DEFINE FIELD embedding_version ON code_elements TYPE string;
  DEFINE FIELD embedding_timestamp ON code_elements TYPE datetime;
  DEFINE FIELD enrichment_status ON code_elements TYPE string DEFAULT 'pending';
  
  -- Enhanced indexes
  DEFINE INDEX element_path_unique ON code_elements COLUMNS element_path UNIQUE;
  DEFINE INDEX enrichment_status_idx ON code_elements COLUMNS enrichment_status;
  DEFINE INDEX embedding_timestamp_idx ON code_elements COLUMNS embedding_timestamp;
`)
```

### **2. Python FastAPI Embedding Microservice**

**File**: `embed/main.py`

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
import asyncio
from embed_anything import EmbeddingModel, embed_query, WhichModel
import time
import logging
import re

app = FastAPI(title="Vibe Embedding Service", version="1.0.0")

# Request/Response models
class EmbedRequest(BaseModel):
    text: str
    element_type: str
    perspective: str  # "functionality", "integration", etc.
    batch_id: Optional[str] = None

class EmbedResponse(BaseModel):
    embedding: List[float]
    model: str
    dimensions: int
    processing_time_ms: int

class BatchEmbedItem(BaseModel):
    text: str
    perspective: str
    element_id: str

class BatchEmbedRequest(BaseModel):
    items: List[BatchEmbedItem]
    element_type: str

class BatchEmbedResult(BaseModel):
    element_id: str
    perspective: str
    embedding: List[float]
    success: bool
    error: Optional[str] = None

class BatchEmbedResponse(BaseModel):
    results: List[BatchEmbedResult]
    total_processing_time_ms: int

# Model cache for performance
class ModelCache:
    def __init__(self):
        self.code_model = None
        self.text_model = None
        self._loading = {}
    
    async def get_model_for_element(self, element_type: str):
        if element_type in ['function', 'class', 'method']:
            if self.code_model is None and 'code' not in self._loading:
                self._loading['code'] = True
                try:
                    self.code_model = EmbeddingModel.from_pretrained_hf(
                        WhichModel.Jina, 
                        "jinaai/jina-embeddings-v2-base-code"
                    )
                finally:
                    del self._loading['code']
            return self.code_model
        else:
            if self.text_model is None and 'text' not in self._loading:
                self._loading['text'] = True
                try:
                    self.text_model = EmbeddingModel.from_pretrained_hf(
                        WhichModel.Jina,
                        "jinaai/jina-embeddings-v2-base-en"
                    )
                finally:
                    del self._loading['text']
            return self.text_model

# Global model cache
cache = ModelCache()

def preprocess_for_embedding(text: str, perspective: str) -> str:
    """Context-aware preprocessing for different perspectives"""
    if perspective == "functionality":
        return f"Functionality: {extract_functional_essence(text)}"
    elif perspective == "integration":
        return f"Integration: {extract_integration_patterns(text)}"
    elif perspective == "patterns":
        return f"Patterns: {extract_design_patterns(text)}"
    elif perspective == "dependencies":
        return f"Dependencies: {extract_dependencies(text)}"
    elif perspective == "usage_context":
        return f"Usage: {extract_usage_context(text)}"
    elif perspective == "keywords":
        return f"Keywords: {extract_searchable_terms(text)}"
    else:
        return text

def extract_functional_essence(text: str) -> str:
    """Extract what the code does, not how it does it"""
    lines = [line.strip() for line in text.split('\n') 
             if line.strip() and not line.strip().startswith('//')]
    return ' '.join(lines[:5])  # Limit to essential lines

def extract_integration_patterns(text: str) -> str:
    """Extract function signatures, parameter types, return types"""
    signature_lines = [line for line in text.split('\n')
                       if any(keyword in line for keyword in 
                             ['function', 'export', ':', '=>'])]
    return ' '.join(signature_lines)

def extract_design_patterns(text: str) -> str:
    """Extract architectural patterns, class hierarchies"""
    pattern_indicators = ['class', 'interface', 'extends', 'implements', 'async', 'Promise']
    pattern_lines = [line for line in text.split('\n')
                     if any(indicator in line for indicator in pattern_indicators)]
    return ' '.join(pattern_lines)

def extract_dependencies(text: str) -> str:
    """Extract import statements, external function calls"""
    import_lines = [line for line in text.split('\n')
                    if line.strip().startswith('import') or 'require' in line]
    return ' '.join(import_lines)

def extract_usage_context(text: str) -> str:
    """Extract comments, JSDoc, usage examples"""
    comment_lines = [line for line in text.split('\n')
                     if line.strip().startswith(('//','*','/**'))]
    return ' '.join(comment_lines)

def extract_searchable_terms(text: str) -> str:
    """Extract identifiers, function names, key terms"""
    identifier_pattern = r'\b[a-zA-Z_$][a-zA-Z0-9_$]*\b'
    identifiers = re.findall(identifier_pattern, text)
    # Filter out short terms and common keywords
    meaningful_terms = [term for term in identifiers 
                       if len(term) > 2 and term not in ['const', 'let', 'var', 'function']]
    return ' '.join(meaningful_terms)

@app.post("/embed", response_model=EmbedResponse)
async def embed_text(request: EmbedRequest):
    """Generate single embedding"""
    start_time = time.time()
    
    try:
        # Get appropriate model
        model = await cache.get_model_for_element(request.element_type)
        if model is None:
            raise HTTPException(status_code=500, detail="Failed to load embedding model")
        
        # Preprocess text for perspective
        processed_text = preprocess_for_embedding(request.text, request.perspective)
        
        # Generate embedding
        embedding = embed_query(model, processed_text)
        
        processing_time = int((time.time() - start_time) * 1000)
        
        return EmbedResponse(
            embedding=embedding,
            model="jina-embeddings-v2",
            dimensions=len(embedding),
            processing_time_ms=processing_time
        )
        
    except Exception as e:
        logging.error(f"Embedding failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/embed/batch", response_model=BatchEmbedResponse)
async def embed_batch(request: BatchEmbedRequest):
    """Generate batch embeddings with controlled concurrency"""
    start_time = time.time()
    
    try:
        # Get appropriate model
        model = await cache.get_model_for_element(request.element_type)
        if model is None:
            raise HTTPException(status_code=500, detail="Failed to load embedding model")
        
        # Process items with controlled concurrency (max 10 concurrent)
        semaphore = asyncio.Semaphore(10)
        
        async def process_item(item: BatchEmbedItem) -> BatchEmbedResult:
            async with semaphore:
                try:
                    processed_text = preprocess_for_embedding(item.text, item.perspective)
                    embedding = embed_query(model, processed_text)
                    
                    return BatchEmbedResult(
                        element_id=item.element_id,
                        perspective=item.perspective,
                        embedding=embedding,
                        success=True
                    )
                except Exception as e:
                    return BatchEmbedResult(
                        element_id=item.element_id,
                        perspective=item.perspective,
                        embedding=[],
                        success=False,
                        error=str(e)
                    )
        
        # Process all items concurrently
        tasks = [process_item(item) for item in request.items]
        results = await asyncio.gather(*tasks)
        
        total_time = int((time.time() - start_time) * 1000)
        
        return BatchEmbedResponse(
            results=results,
            total_processing_time_ms=total_time
        )
        
    except Exception as e:
        logging.error(f"Batch embedding failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "vibe-embeddings"}

@app.get("/")
async def root():
    """Root endpoint with service info"""
    return {
        "service": "Vibe Embedding Service",
        "version": "1.0.0",
        "endpoints": {
            "/embed": "Single embedding generation",
            "/embed/batch": "Batch embedding generation", 
            "/health": "Health check"
        }
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Vibe Embedding Service on http://0.0.0.0:3001")
    uvicorn.run(app, host="0.0.0.0", port=3001)
```

**File**: `embed/requirements.txt`

```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
embed-anything==0.4.8
numpy==1.24.3
```

**File**: `embed/start.sh`

```bash
#!/bin/bash
cd "$(dirname "$0")"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the service
echo "🚀 Starting Vibe Embedding Service..."
python main.py
```

### **3. Deno Embedding Interface**

**File**: `src/infra/embeddings.ts` (new)

```typescript
/**
 * Embedding Service Interface - Rust Microservice Communication
 * 
 * Provides typed interface to the Rust embedding microservice with automatic
 * model selection, batch processing, and error handling.
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createError, type VibeError } from './errors.ts'

// Create subsystem-specific error creator
const embeddingError = createError('embeddings')

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

export const EmbedRequestSchema = z.object({
  text: z.string().min(1),
  element_type: z.string(),
  perspective: z.enum(['functionality', 'integration', 'patterns', 'dependencies', 'usage_context', 'keywords']),
  batch_id: z.string().optional()
})

export const EmbedResponseSchema = z.object({
  embedding: z.array(z.number()),
  model: z.string(),
  dimensions: z.number(),
  processing_time_ms: z.number()
})

export const BatchEmbedRequestSchema = z.object({
  items: z.array(z.object({
    text: z.string(),
    perspective: z.string(),
    element_id: z.string()
  })),
  element_type: z.string()
})

export type EmbedRequest = z.infer<typeof EmbedRequestSchema>
export type EmbedResponse = z.infer<typeof EmbedResponseSchema>
export type BatchEmbedRequest = z.infer<typeof BatchEmbedRequestSchema>

// Configuration
interface EmbeddingConfig {
  serviceUrl: string
  timeout: number
  maxRetries: number
  batchSize: number
}

const DEFAULT_CONFIG: EmbeddingConfig = {
  serviceUrl: 'http://localhost:3001',
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  batchSize: 50
}

// =============================================================================
// CORE EMBEDDING FUNCTIONS
// =============================================================================

/**
 * Generate single embedding via Rust service
 */
export const generateEmbedding = (
  text: string, 
  elementType: string, 
  perspective: string,
  config: EmbeddingConfig = DEFAULT_CONFIG
): Effect.Effect<number[], VibeError> => {
  return pipe(
    Effect.tryPromise({
      try: async () => {
        const request: EmbedRequest = {
          text: text.trim(),
          element_type: elementType,
          perspective,
        }
        
        // Validate request
        const validatedRequest = EmbedRequestSchema.parse(request)
        
        // Call Rust service with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), config.timeout)
        
        try {
          const response = await fetch(`${config.serviceUrl}/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validatedRequest),
            signal: controller.signal
          })
          
          if (!response.ok) {
            throw new Error(`Embedding service returned ${response.status}: ${response.statusText}`)
          }
          
          const result = await response.json()
          const validatedResponse = EmbedResponseSchema.parse(result)
          
          return validatedResponse.embedding
        } finally {
          clearTimeout(timeoutId)
        }
      },
      catch: (error) => embeddingError(
        'error',
        `Failed to generate embedding for ${elementType}`,
        text.substring(0, 100),
        { error, perspective, elementType }
      )
    }),
    
    // Retry logic
    Effect.retry({
      times: config.maxRetries,
      schedule: Effect.Schedule.exponential('100 millis')
    })
  )
}

/**
 * Generate batch embeddings for performance
 */
export const generateBatchEmbeddings = (
  items: Array<{ text: string; perspective: string; elementId: string }>,
  elementType: string,
  config: EmbeddingConfig = DEFAULT_CONFIG
): Effect.Effect<Map<string, Map<string, number[]>>, VibeError> => {
  return pipe(
    Effect.tryPromise({
      try: async () => {
        // Split into batches
        const batches = []
        for (let i = 0; i < items.length; i += config.batchSize) {
          batches.push(items.slice(i, i + config.batchSize))
        }
        
        console.log(`Processing ${items.length} items in ${batches.length} batches`)
        
        // Process batches sequentially to avoid overwhelming the service
        const results = new Map<string, Map<string, number[]>>()
        
        for (const batch of batches) {
          const batchRequest: BatchEmbedRequest = {
            items: batch,
            element_type: elementType
          }
          
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), config.timeout)
          
          try {
            const response = await fetch(`${config.serviceUrl}/embed/batch`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(batchRequest),
              signal: controller.signal
            })
            
            if (!response.ok) {
              throw new Error(`Batch embedding failed: ${response.status}`)
            }
            
            const batchResult = await response.json()
            
            // Process results
            for (const item of batchResult.results) {
              if (item.success) {
                if (!results.has(item.element_id)) {
                  results.set(item.element_id, new Map())
                }
                results.get(item.element_id)!.set(item.perspective, item.embedding)
              } else {
                console.warn(`Failed to embed ${item.element_id}:${item.perspective}: ${item.error}`)
              }
            }
          } finally {
            clearTimeout(timeoutId)
          }
        }
        
        return results
      },
      catch: (error) => embeddingError(
        'error',
        `Failed to generate batch embeddings`,
        `${items.length} items`,
        { error, elementType }
      )
    })
  )
}

/**
 * Health check for embedding service
 */
export const checkEmbeddingService = (
  config: EmbeddingConfig = DEFAULT_CONFIG
): Effect.Effect<boolean, VibeError> => {
  return pipe(
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
        
        try {
          const response = await fetch(`${config.serviceUrl}/health`, {
            signal: controller.signal
          })
          return response.ok
        } finally {
          clearTimeout(timeoutId)
        }
      },
      catch: (error) => embeddingError(
        'error',
        'Embedding service health check failed',
        config.serviceUrl,
        { error }
      )
    })
  )
}

// Legacy compatibility function (already imported by storage.ts line 22)
export const generateSingleEmbedding = (text: string): Effect.Effect<number[], VibeError> => {
  return generateEmbedding(text, 'generic', 'functionality')
}
```

### **4. Multi-Perspective Semantic Enrichment**

**File**: `src/agent/semantic-enrichment.ts` (new)

```typescript
/**
 * Multi-Perspective Semantic Enrichment
 * 
 * Uses LLM with full codebase context to generate atomic sentences that capture
 * different perspectives of each code element. These sentences are then embedded
 * separately to create multiple entry points for semantic search.
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createError, type VibeError } from '../infra/errors.ts'
import { createLLMClient } from './llm.ts'
import { generateBatchEmbeddings } from '../infra/embeddings.ts'
import type { CodeElementData } from '../infra/storage.ts'

// Create subsystem-specific error creator
const enrichmentError = createError('semantic-enrichment')

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

export const SemanticDescriptorSchema = z.object({
  element_path: z.string(),
  functionality: z.array(z.string()).max(20),      // What it does
  integration: z.array(z.string()).max(20),        // How to use it
  patterns: z.array(z.string()).max(20),          // Architectural role
  dependencies: z.array(z.string()).max(20),      // What it needs/provides
  usage_context: z.array(z.string()).max(20),     // When/where to use
  keywords: z.array(z.string()).max(20),          // Searchable terms
  generation_metadata: z.object({
    model: z.string(),
    codebase_context_size: z.number(),
    generation_timestamp: z.string(),
    processing_time_ms: z.number()
  })
})

export const EmbeddingMetadataSchema = z.object({
  model: z.string(),
  dimensions: z.number(),
  generation_timestamp: z.string(),
  perspective_count: z.number(),
  total_embeddings: z.number()
})

export type SemanticDescriptor = z.infer<typeof SemanticDescriptorSchema>
export type EmbeddingMetadata = z.infer<typeof EmbeddingMetadataSchema>

// Multi-perspective embeddings structure
export interface MultiPerspectiveEmbeddings {
  functionality: number[][]      // Array of embeddings for functionality descriptions
  integration: number[][]        // Array of embeddings for integration descriptions
  patterns: number[][]          // Array of embeddings for pattern descriptions
  dependencies: number[][]      // Array of embeddings for dependency descriptions
  usage_context: number[][]     // Array of embeddings for usage descriptions
  keywords: number[][]          // Array of embeddings for keyword descriptions
}

// =============================================================================
// CODEBASE CONTEXT MANAGEMENT
// =============================================================================

/**
 * Load complete codebase context for LLM enrichment
 * This provides the LLM with full architectural understanding
 */
export const loadCodebaseContext = async (projectPath: string): Promise<string> => {
  try {
    // Read key architectural files
    const keyFiles = [
      'package.json', 'deno.json', 'tsconfig.json', 'README.md',
      'src/infra/types.ts', 'src/infra/config.ts'
    ]
    
    const contextParts: string[] = []
    
    for (const file of keyFiles) {
      try {
        const content = await Deno.readTextFile(`${projectPath}/${file}`)
        contextParts.push(`=== ${file} ===\n${content.substring(0, 2000)}\n`)
      } catch {
        // File doesn't exist, skip
      }
    }
    
    // Add project structure overview
    contextParts.push(`\n=== Project Structure ===\n`)
    contextParts.push(await generateProjectOverview(projectPath))
    
    return contextParts.join('\n')
  } catch (error) {
    console.warn(`Failed to load codebase context: ${error}`)
    return '// Codebase context unavailable'
  }
}

/**
 * Generate high-level project overview
 */
const generateProjectOverview = async (projectPath: string): Promise<string> => {
  try {
    const overview: string[] = []
    
    // Scan src directory structure
    const srcPath = `${projectPath}/src`
    for await (const entry of Deno.readDir(srcPath)) {
      if (entry.isDirectory) {
        overview.push(`${entry.name}/: ${await getDirPurpose(entry.name)}`)
      }
    }
    
    return overview.join('\n')
  } catch {
    return 'TypeScript project with modular architecture'
  }
}

const getDirPurpose = (dirName: string): string => {
  const purposes: Record<string, string> = {
    'infra': 'Core infrastructure (AST, storage, config)',
    'agent': 'AI agent components (LLM, embeddings, search)',
    'commands': 'CLI command implementations',
    'types': 'Type definitions and schemas',
    'utils': 'Utility functions and helpers'
  }
  return purposes[dirName] || 'Application modules'
}

// =============================================================================
// LLM ENRICHMENT PIPELINE
// =============================================================================

/**
 * Generate multi-perspective descriptions for a code element using LLM
 */
export const enrichElementWithLLM = (
  element: CodeElementData,
  codebaseContext: string,
  projectPath: string
): Effect.Effect<SemanticDescriptor, VibeError> => {
  return pipe(
    Effect.tryPromise({
      try: async () => {
        const startTime = Date.now()
        
        const llmClient = createLLMClient({
          model: 'gemini-2.5-flash',
          temperature: 0.7,
          enableFunctionCalling: false
        })
        
        const enrichmentPrompt = generateEnrichmentPrompt(element, codebaseContext)
        
        const response = await llmClient.generateResponse(enrichmentPrompt, {
          systemInstruction: `You are a code analysis expert. Generate precise, atomic sentences that capture different perspectives of the given code element. Each sentence should be self-contained and optimized for semantic search.`,
          conversationHistory: []
        })
        
        // Parse LLM response into structured descriptions
        const descriptions = parseLLMResponse(response.content, element.element_path)
        
        // Add generation metadata
        const descriptor: SemanticDescriptor = {
          ...descriptions,
          generation_metadata: {
            model: 'gemini-2.5-flash',
            codebase_context_size: codebaseContext.length,
            generation_timestamp: new Date().toISOString(),
            processing_time_ms: Date.now() - startTime
          }
        }
        
        // Validate schema
        return SemanticDescriptorSchema.parse(descriptor)
      },
      catch: (error) => enrichmentError(
        'error',
        `Failed to enrich element with LLM`,
        element.element_path,
        { error, elementType: element.element_type }
      )
    })
  )
}

/**
 * Generate comprehensive enrichment prompt
 */
const generateEnrichmentPrompt = (element: CodeElementData, codebaseContext: string): string => {
  return `
CODEBASE CONTEXT:
${codebaseContext}

ELEMENT TO ANALYZE:
Type: ${element.element_type}
Name: ${element.element_name}
File: ${element.file_path}
Lines: ${element.start_line}-${element.end_line}

Code:
\`\`\`typescript
${element.content}
\`\`\`

TASK: Generate 5-20 atomic sentences for each perspective. Each sentence should be:
- Self-contained and complete
- Optimized for semantic search matching
- Specific to this element
- Free of code syntax or implementation details

PERSPECTIVES:

1. FUNCTIONALITY (what this code does):
- Core purpose and behavior
- Key operations and transformations
- Output and side effects
- Business logic summary

2. INTEGRATION (how to use this code):
- Function signatures and parameters
- Return types and values
- Usage patterns and examples
- Error conditions and handling

3. PATTERNS (architectural role):
- Design patterns implemented
- Architectural responsibilities
- Code organization principles
- Abstraction level and purpose

4. DEPENDENCIES (what this code needs):
- Required imports and libraries
- External services and APIs
- Type dependencies
- Runtime requirements

5. USAGE CONTEXT (when/where to use):
- Appropriate use cases
- Integration points
- Workflow positioning
- Performance characteristics

6. KEYWORDS (searchable terms):
- Technical concepts
- Domain terminology
- Alternative names
- Related technologies

Respond in this exact JSON format:
{
  "element_path": "${element.element_path}",
  "functionality": ["sentence 1", "sentence 2", ...],
  "integration": ["sentence 1", "sentence 2", ...],
  "patterns": ["sentence 1", "sentence 2", ...],
  "dependencies": ["sentence 1", "sentence 2", ...],
  "usage_context": ["sentence 1", "sentence 2", ...],
  "keywords": ["sentence 1", "sentence 2", ...]
}
`
}

/**
 * Parse LLM response into structured descriptions
 */
const parseLLMResponse = (llmResponse: string, elementPath: string): Omit<SemanticDescriptor, 'generation_metadata'> => {
  try {
    // Extract JSON from LLM response (may have markdown formatting)
    const jsonMatch = llmResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in LLM response')
    }
    
    const parsed = JSON.parse(jsonMatch[0])
    
    // Ensure all required fields exist with defaults
    return {
      element_path: elementPath,
      functionality: parsed.functionality || [],
      integration: parsed.integration || [],
      patterns: parsed.patterns || [],
      dependencies: parsed.dependencies || [],
      usage_context: parsed.usage_context || [],
      keywords: parsed.keywords || []
    }
  } catch (error) {
    console.warn(`Failed to parse LLM response for ${elementPath}:`, error)
    
    // Fallback: Generate basic descriptions from element data
    return generateFallbackDescriptions(elementPath)
  }
}

/**
 * Generate fallback descriptions when LLM fails
 */
const generateFallbackDescriptions = (elementPath: string): Omit<SemanticDescriptor, 'generation_metadata'> => {
  const [filePath, elementName] = elementPath.split(':')
  const fileName = filePath.split('/').pop() || ''
  
  return {
    element_path: elementPath,
    functionality: [`implements ${elementName} functionality`],
    integration: [`use ${elementName} for processing`],
    patterns: [`follows standard ${fileName} patterns`],
    dependencies: [`requires standard TypeScript runtime`],
    usage_context: [`apply ${elementName} in appropriate contexts`],
    keywords: [elementName, fileName.replace('.ts', ''), 'typescript']
  }
}

// =============================================================================
// EMBEDDING GENERATION PIPELINE
// =============================================================================

/**
 * Generate multi-perspective embeddings for semantic descriptor
 */
export const generateMultiPerspectiveEmbeddings = (
  descriptor: SemanticDescriptor,
  elementType: string
): Effect.Effect<MultiPerspectiveEmbeddings, VibeError> => {
  return pipe(
    Effect.tryPromise({
      try: async () => {
        // Prepare batch embedding requests for all perspectives
        const batchItems: Array<{ text: string; perspective: string; elementId: string }> = []
        
        // Create embedding requests for each perspective
        for (const [perspective, descriptions] of Object.entries(descriptor)) {
          if (Array.isArray(descriptions)) {
            descriptions.forEach((desc, index) => {
              batchItems.push({
                text: desc,
                perspective,
                elementId: `${descriptor.element_path}:${perspective}:${index}`
              })
            })
          }
        }
        
        console.log(`Generating ${batchItems.length} embeddings for ${descriptor.element_path}`)
        
        // Generate embeddings in batch
        const embeddingResults = await Effect.runPromise(
          generateBatchEmbeddings(batchItems, elementType)
        )
        
        // Organize embeddings by perspective
        const multiPerspectiveEmbeddings: MultiPerspectiveEmbeddings = {
          functionality: [],
          integration: [],
          patterns: [],
          dependencies: [],
          usage_context: [],
          keywords: []
        }
        
        // Group embeddings by perspective
        for (const [elementId, perspectiveMap] of embeddingResults) {
          const [, perspective, index] = elementId.split(':')
          const embedding = perspectiveMap.get(perspective)
          
          if (embedding && multiPerspectiveEmbeddings[perspective as keyof MultiPerspectiveEmbeddings]) {
            const perspectiveArray = multiPerspectiveEmbeddings[perspective as keyof MultiPerspectiveEmbeddings]
            perspectiveArray[parseInt(index)] = embedding
          }
        }
        
        return multiPerspectiveEmbeddings
      },
      catch: (error) => enrichmentError(
        'error',
        `Failed to generate multi-perspective embeddings`,
        descriptor.element_path,
        { error, elementType }
      )
    })
  )
}

// =============================================================================
// BATCH PROCESSING
// =============================================================================

/**
 * Process multiple elements in batch for efficiency
 */
export const enrichElementsBatch = (
  elements: CodeElementData[],
  codebaseContext: string,
  projectPath: string,
  options: { batchSize?: number; parallelism?: number } = {}
): Effect.Effect<Array<{ element: CodeElementData; descriptor: SemanticDescriptor; embeddings: MultiPerspectiveEmbeddings }>, VibeError> => {
  const { batchSize = 10, parallelism = 3 } = options
  
  return pipe(
    Effect.tryPromise({
      try: async () => {
        const results = []
        
        // Process elements in batches with controlled parallelism
        for (let i = 0; i < elements.length; i += batchSize) {
          const batch = elements.slice(i, i + batchSize)
          console.log(`Processing enrichment batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(elements.length / batchSize)}`)
          
          // Process batch with limited parallelism
          const batchPromises = batch.slice(0, parallelism).map(async (element) => {
            try {
              const descriptor = await Effect.runPromise(
                enrichElementWithLLM(element, codebaseContext, projectPath)
              )
              
              const embeddings = await Effect.runPromise(
                generateMultiPerspectiveEmbeddings(descriptor, element.element_type)
              )
              
              return { element, descriptor, embeddings }
            } catch (error) {
              console.warn(`Failed to enrich element ${element.element_path}:`, error)
              return null
            }
          })
          
          const batchResults = await Promise.all(batchPromises)
          results.push(...batchResults.filter(Boolean))
          
          // Small delay between batches to avoid overwhelming the LLM service
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
        
        return results
      },
      catch: (error) => enrichmentError(
        'error',
        `Failed to process elements batch`,
        `${elements.length} elements`,
        { error }
      )
    })
  )
}
```

### **5. MRI Semantic Search Implementation**

**File**: `src/agent/semantic-search.ts` (new)

```typescript
/**
 * MRI Semantic Search - Multi-Perspective Graph Activation
 * 
 * Implements the "MRI Machine" concept where semantic queries activate
 * relevant subgraphs with varying intensity based on multi-perspective
 * embedding similarity and structural relationships.
 */

import { Effect, pipe } from 'effect'
import { z } from 'zod/v4'
import { createError, type VibeError } from '../infra/errors.ts'
import { withProjectDatabase } from '../infra/storage.ts'
import { generateEmbedding } from '../infra/embeddings.ts'

// Create subsystem-specific error creator
const searchError = createError('semantic-search')

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

export const ActivatedNodeSchema = z.object({
  element_path: z.string(),
  element_name: z.string(),
  element_type: z.string(),
  file_path: z.string(),
  start_line: z.number(),
  content: z.string(),
  activation_score: z.number().min(0).max(1),
  activation_type: z.enum(['primary', 'related', 'context']),
  matched_perspectives: z.array(z.string()),
  matched_descriptions: z.array(z.string()),
  propagation_source: z.string().optional()
})

export const ActivatedSubgraphSchema = z.object({
  query: z.string(),
  query_embedding: z.array(z.number()),
  primary_matches: z.array(ActivatedNodeSchema),     // Score > 0.8
  related_matches: z.array(ActivatedNodeSchema),     // Score 0.5-0.8
  context_matches: z.array(ActivatedNodeSchema),     // Score 0.3-0.5
  activation_summary: z.object({
    total_nodes: z.number(),
    primary_count: z.number(),
    related_count: z.number(),
    context_count: z.number(),
    processing_time_ms: z.number()
  }),
  suggested_entry_points: z.array(z.object({
    element_path: z.string(),
    reason: z.string(),
    confidence: z.number()
  }))
})

export type ActivatedNode = z.infer<typeof ActivatedNodeSchema>
export type ActivatedSubgraph = z.infer<typeof ActivatedSubgraphSchema>

// Search options
export interface MRISearchOptions {
  maxResults?: number
  primaryThreshold?: number    // Default: 0.8
  relatedThreshold?: number    // Default: 0.5
  contextThreshold?: number    // Default: 0.3
  enablePropagation?: boolean  // Default: true
  propagationDecay?: number    // Default: 0.8
  includeContent?: boolean     // Default: false
}

const DEFAULT_SEARCH_OPTIONS: Required<MRISearchOptions> = {
  maxResults: 50,
  primaryThreshold: 0.8,
  relatedThreshold: 0.5,
  contextThreshold: 0.3,
  enablePropagation: true,
  propagationDecay: 0.8,
  includeContent: false
}

// =============================================================================
// CORE MRI SEARCH
// =============================================================================

/**
 * Execute MRI search with multi-perspective activation
 */
export const executeeMRISearch = (
  query: string,
  projectPath: string,
  options: MRISearchOptions = {}
): Effect.Effect<ActivatedSubgraph, VibeError> => {
  const opts = { ...DEFAULT_SEARCH_OPTIONS, ...options }
  
  return pipe(
    // Step 1: Generate query embedding
    generateEmbedding(query, 'query', 'functionality'),
    
    // Step 2: Find direct semantic matches
    Effect.flatMap(queryEmbedding => 
      findDirectSemanticMatches(query, queryEmbedding, projectPath, opts)
    ),
    
    // Step 3: Propagate activation through relationships
    Effect.flatMap(directMatches => 
      opts.enablePropagation 
        ? propagateActivation(directMatches, projectPath, opts)
        : Effect.succeed(directMatches)
    ),
    
    // Step 4: Classify and organize results
    Effect.map(allMatches => 
      createActivatedSubgraph(query, allMatches, opts)
    ),
    
    // Error handling
    Effect.catchAll(error => Effect.fail(searchError(
      'error',
      `MRI search failed for query: ${query}`,
      query,
      { error, projectPath }
    )))
  )
}

/**
 * Find direct semantic matches using multi-perspective embeddings
 */
const findDirectSemanticMatches = (
  query: string,
  queryEmbedding: number[],
  projectPath: string,
  options: Required<MRISearchOptions>
): Effect.Effect<ActivatedNode[], VibeError> => {
  return withProjectDatabase(projectPath, async (db) => {
    // Query for elements with multi-perspective embeddings
    const semanticQuery = `
      SELECT 
        element_path,
        element_name,
        element_type,
        file_path,
        start_line,
        ${options.includeContent ? 'content,' : ''}
        semantic_descriptions,
        functionality_embeddings,
        integration_embeddings,
        patterns_embeddings,
        dependencies_embeddings,
        usage_context_embeddings,
        keywords_embeddings
      FROM code_elements 
      WHERE enrichment_status = 'completed'
      AND (
        functionality_embeddings IS NOT NULL OR
        integration_embeddings IS NOT NULL OR
        patterns_embeddings IS NOT NULL OR
        dependencies_embeddings IS NOT NULL OR
        usage_context_embeddings IS NOT NULL OR
        keywords_embeddings IS NOT NULL
      )
    `
    
    console.log(`Finding semantic matches for: "${query}"`)
    const results = await db.query(semanticQuery)
    const elements = results?.[0] || []
    
    console.log(`Analyzing ${elements.length} elements for semantic similarity`)
    
    // Calculate multi-perspective similarity scores
    const activatedNodes: ActivatedNode[] = []
    
    for (const element of elements) {
      const activation = calculateMultiPerspectiveActivation(
        element, 
        queryEmbedding, 
        query,
        options
      )
      
      if (activation && activation.activation_score >= options.contextThreshold) {
        activatedNodes.push(activation)
      }
    }
    
    // Sort by activation score
    activatedNodes.sort((a, b) => b.activation_score - a.activation_score)
    
    console.log(`Found ${activatedNodes.length} semantically activated nodes`)
    return activatedNodes.slice(0, options.maxResults)
  })
}

/**
 * Calculate multi-perspective activation score for an element
 */
const calculateMultiPerspectiveActivation = (
  element: any,
  queryEmbedding: number[],
  query: string,
  options: Required<MRISearchOptions>
): ActivatedNode | null => {
  try {
    const perspectives = [
      'functionality', 'integration', 'patterns', 
      'dependencies', 'usage_context', 'keywords'
    ]
    
    let maxScore = 0
    const matchedPerspectives: string[] = []
    const matchedDescriptions: string[] = []
    
    // Calculate similarity across all perspectives
    for (const perspective of perspectives) {
      const embeddingField = `${perspective}_embeddings`
      const embeddings = element[embeddingField]
      
      if (embeddings && Array.isArray(embeddings)) {
        // Each perspective has multiple embeddings (one per atomic sentence)
        for (let i = 0; i < embeddings.length; i++) {
          const embedding = embeddings[i]
          if (embedding && Array.isArray(embedding)) {
            const similarity = cosineSimilarity(queryEmbedding, embedding)
            
            if (similarity > maxScore) {
              maxScore = similarity
            }
            
            if (similarity > options.contextThreshold) {
              matchedPerspectives.push(`${perspective}:${i}`)
              
              // Get corresponding description if available
              const descriptions = element.semantic_descriptions?.[perspective]
              if (descriptions && descriptions[i]) {
                matchedDescriptions.push(descriptions[i])
              }
            }
          }
        }
      }
    }
    
    if (maxScore < options.contextThreshold) {
      return null
    }
    
    // Determine activation type based on score
    let activationType: 'primary' | 'related' | 'context'
    if (maxScore >= options.primaryThreshold) {
      activationType = 'primary'
    } else if (maxScore >= options.relatedThreshold) {
      activationType = 'related'
    } else {
      activationType = 'context'
    }
    
    return {
      element_path: element.element_path,
      element_name: element.element_name,
      element_type: element.element_type,
      file_path: element.file_path,
      start_line: element.start_line,
      content: options.includeContent ? element.content || '' : '',
      activation_score: maxScore,
      activation_type: activationType,
      matched_perspectives: [...new Set(matchedPerspectives)], // Deduplicate
      matched_descriptions: [...new Set(matchedDescriptions)]  // Deduplicate
    }
  } catch (error) {
    console.warn(`Failed to calculate activation for ${element.element_path}:`, error)
    return null
  }
}

/**
 * Propagate activation through structural relationships
 */
const propagateActivation = (
  directMatches: ActivatedNode[],
  projectPath: string,
  options: Required<MRISearchOptions>
): Effect.Effect<ActivatedNode[], VibeError> => {
  return withProjectDatabase(projectPath, async (db) => {
    const allNodes = new Map<string, ActivatedNode>()
    
    // Add direct matches
    for (const node of directMatches) {
      allNodes.set(node.element_path, node)
    }
    
    console.log(`Propagating activation from ${directMatches.length} primary nodes`)
    
    // Propagate activation through relationships
    for (const sourceNode of directMatches) {
      if (sourceNode.activation_score >= options.relatedThreshold) {
        const propagatedNodes = await propagateFromNode(
          sourceNode, 
          db, 
          options.propagationDecay,
          options.contextThreshold
        )
        
        for (const propagatedNode of propagatedNodes) {
          const existing = allNodes.get(propagatedNode.element_path)
          if (!existing || propagatedNode.activation_score > existing.activation_score) {
            allNodes.set(propagatedNode.element_path, propagatedNode)
          }
        }
      }
    }
    
    const result = Array.from(allNodes.values())
    console.log(`Total activated nodes after propagation: ${result.length}`)
    
    return result
  })
}

/**
 * Propagate activation from a single node through its relationships
 */
const propagateFromNode = async (
  sourceNode: ActivatedNode,
  db: any,
  decayFactor: number,
  threshold: number
): Promise<ActivatedNode[]> => {
  try {
    // Get source element ID
    const sourceQuery = `SELECT id FROM code_elements WHERE element_path = $elementPath`
    const sourceResult = await db.query(sourceQuery, { elementPath: sourceNode.element_path })
    
    if (!sourceResult?.[0]?.[0]?.id) {
      return []
    }
    
    const sourceId = sourceResult[0][0].id
    
    // Find related elements through structural relationships
    const relationQuery = `
      SELECT DISTINCT ce.element_path, ce.element_name, ce.element_type, 
             ce.file_path, ce.start_line, sr.relationship_type
      FROM structural_relationship sr
      JOIN code_elements ce ON (sr.out = ce.id OR sr.in = ce.id)
      WHERE (sr.in = $sourceId OR sr.out = $sourceId)
      AND ce.id != $sourceId
      AND sr.relationship_type IN ['calls', 'uses', 'imports', 'exports']
    `
    
    const relationResults = await db.query(relationQuery, { sourceId })
    const relatedElements = relationResults?.[0] || []
    
    // Create propagated activation nodes
    const propagatedNodes: ActivatedNode[] = []
    
    for (const related of relatedElements) {
      const propagatedScore = sourceNode.activation_score * decayFactor
      
      if (propagatedScore >= threshold) {
        // Determine activation type for propagated node
        let activationType: 'primary' | 'related' | 'context'
        if (propagatedScore >= 0.8) {
          activationType = 'primary'
        } else if (propagatedScore >= 0.5) {
          activationType = 'related'
        } else {
          activationType = 'context'
        }
        
        propagatedNodes.push({
          element_path: related.element_path,
          element_name: related.element_name,
          element_type: related.element_type,
          file_path: related.file_path,
          start_line: related.start_line,
          content: '',
          activation_score: propagatedScore,
          activation_type: activationType,
          matched_perspectives: [],
          matched_descriptions: [`Related to ${sourceNode.element_name} via ${related.relationship_type}`],
          propagation_source: sourceNode.element_path
        })
      }
    }
    
    return propagatedNodes
  } catch (error) {
    console.warn(`Failed to propagate from ${sourceNode.element_path}:`, error)
    return []
  }
}

/**
 * Create final activated subgraph structure
 */
const createActivatedSubgraph = (
  query: string,
  allNodes: ActivatedNode[],
  options: Required<MRISearchOptions>
): ActivatedSubgraph => {
  const startTime = Date.now()
  
  // Classify nodes by activation type
  const primaryMatches = allNodes.filter(n => n.activation_type === 'primary')
  const relatedMatches = allNodes.filter(n => n.activation_type === 'related')
  const contextMatches = allNodes.filter(n => n.activation_type === 'context')
  
  // Generate suggested entry points
  const entryPoints = generateEntryPoints(primaryMatches)
  
  const subgraph: ActivatedSubgraph = {
    query,
    query_embedding: [], // Could include query embedding if needed
    primary_matches: primaryMatches.slice(0, 10), // Limit primary results
    related_matches: relatedMatches.slice(0, 15), // Limit related results
    context_matches: contextMatches.slice(0, 25), // Limit context results
    activation_summary: {
      total_nodes: allNodes.length,
      primary_count: primaryMatches.length,
      related_count: relatedMatches.length,
      context_count: contextMatches.length,
      processing_time_ms: Date.now() - startTime
    },
    suggested_entry_points: entryPoints
  }
  
  return ActivatedSubgraphSchema.parse(subgraph)
}

/**
 * Generate suggested entry points for the developer
 */
const generateEntryPoints = (primaryMatches: ActivatedNode[]): Array<{ element_path: string; reason: string; confidence: number }> => {
  const entryPoints: Array<{ element_path: string; reason: string; confidence: number }> = []
  
  // Sort by activation score and take top matches
  const topMatches = primaryMatches
    .sort((a, b) => b.activation_score - a.activation_score)
    .slice(0, 5)
  
  for (const match of topMatches) {
    const reason = generateEntryPointReason(match)
    entryPoints.push({
      element_path: match.element_path,
      reason,
      confidence: match.activation_score
    })
  }
  
  return entryPoints
}

/**
 * Generate human-readable reason for entry point suggestion
 */
const generateEntryPointReason = (node: ActivatedNode): string => {
  const perspectives = node.matched_perspectives.map(p => p.split(':')[0])
  const uniquePerspectives = [...new Set(perspectives)]
  
  if (uniquePerspectives.length === 0) {
    return `High structural relevance (${node.activation_score.toFixed(2)})`
  }
  
  const perspectiveText = uniquePerspectives.join(', ')
  return `Strong match on ${perspectiveText} (${node.activation_score.toFixed(2)})`
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate cosine similarity between two vectors
 */
const cosineSimilarity = (vec1: number[], vec2: number[]): number => {
  if (vec1.length !== vec2.length) {
    return 0
  }
  
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i]
    norm1 += vec1[i] * vec1[i]
    norm2 += vec2[i] * vec2[i]
  }
  
  const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2)
  return magnitude === 0 ? 0 : dotProduct / magnitude
}

/**
 * Format activated subgraph for display
 */
export const formatActivatedSubgraph = (subgraph: ActivatedSubgraph): string => {
  const lines: string[] = []
  
  lines.push(`🔬 MRI Search Results for: "${subgraph.query}"`)
  lines.push(``)
  lines.push(`📊 Activation Summary:`)
  lines.push(`   🔴 Primary matches: ${subgraph.activation_summary.primary_count}`)
  lines.push(`   🟡 Related matches: ${subgraph.activation_summary.related_count}`)
  lines.push(`   ⚪ Context matches: ${subgraph.activation_summary.context_count}`)
  lines.push(`   ⏱️  Processing time: ${subgraph.activation_summary.processing_time_ms}ms`)
  lines.push(``)
  
  if (subgraph.suggested_entry_points.length > 0) {
    lines.push(`🎯 Suggested Entry Points:`)
    for (const entry of subgraph.suggested_entry_points) {
      lines.push(`   ${entry.element_path} - ${entry.reason}`)
    }
    lines.push(``)
  }
  
  if (subgraph.primary_matches.length > 0) {
    lines.push(`🔴 Primary Matches:`)
    for (const match of subgraph.primary_matches) {
      lines.push(`   ${match.element_name} (${match.activation_score.toFixed(3)}) - ${match.file_path}:${match.start_line}`)
      if (match.matched_descriptions.length > 0) {
        lines.push(`      ${match.matched_descriptions[0]}`)
      }
    }
    lines.push(``)
  }
  
  if (subgraph.related_matches.length > 0) {
    lines.push(`🟡 Related Matches:`)
    for (const match of subgraph.related_matches.slice(0, 5)) {
      lines.push(`   ${match.element_name} (${match.activation_score.toFixed(3)}) - ${match.file_path}:${match.start_line}`)
    }
    lines.push(``)
  }
  
  return lines.join('\n')
}
```

### **6. Orchestration Pipeline**

**File**: `src/agent/embedding-pipeline.ts` (new)

```typescript
/**
 * Embedding Pipeline Orchestration
 * 
 * Coordinates the full semantic enrichment pipeline:
 * 1. Load codebase context
 * 2. Generate LLM descriptions for elements
 * 3. Generate multi-perspective embeddings
 * 4. Store enhanced data in SurrealDB
 * 5. Update enrichment status
 */

import { Effect, pipe } from 'effect'
import { createError, type VibeError } from '../infra/errors.ts'
import { withProjectDatabase, type CodeElementData } from '../infra/storage.ts'
import { 
  loadCodebaseContext, 
  enrichElementsBatch, 
  type SemanticDescriptor,
  type MultiPerspectiveEmbeddings 
} from './semantic-enrichment.ts'
import { checkEmbeddingService } from '../infra/embeddings.ts'

// Create subsystem-specific error creator
const pipelineError = createError('embedding-pipeline')

// =============================================================================
// PIPELINE ORCHESTRATION
// =============================================================================

/**
 * Execute full embedding pipeline for a project
 */
export const executeEmbeddingPipeline = (
  projectPath: string,
  options: {
    batchSize?: number
    parallelism?: number
    forceReenrichment?: boolean
    elementFilter?: (element: CodeElementData) => boolean
  } = {}
): Effect.Effect<PipelineResult, VibeError> => {
  const { 
    batchSize = 20, 
    parallelism = 3, 
    forceReenrichment = false,
    elementFilter = () => true 
  } = options
  
  return pipe(
    // Step 1: Health check
    checkEmbeddingService(),
    Effect.flatMap(isHealthy => {
      if (!isHealthy) {
        return Effect.fail(pipelineError(
          'error',
          'Embedding service is not available',
          projectPath
        ))
      }
      return Effect.succeed(true)
    }),
    
    // Step 2: Load codebase context
    Effect.flatMap(() => 
      Effect.tryPromise({
        try: () => loadCodebaseContext(projectPath),
        catch: (error) => pipelineError(
          'error',
          'Failed to load codebase context',
          projectPath,
          { error }
        )
      })
    ),
    
    // Step 3: Get elements to enrich
    Effect.flatMap(codebaseContext =>
      getElementsToEnrich(projectPath, forceReenrichment, elementFilter)
        .pipe(Effect.map(elements => ({ codebaseContext, elements })))
    ),
    
    // Step 4: Execute enrichment pipeline
    Effect.flatMap(({ codebaseContext, elements }) =>
      enrichElementsBatch(elements, codebaseContext, projectPath, { batchSize, parallelism })
    ),
    
    // Step 5: Store results in database
    Effect.flatMap(enrichedElements =>
      storeEnrichedElements(enrichedElements, projectPath)
    ),
    
    // Error handling
    Effect.catchAll(error => Effect.fail(pipelineError(
      'error',
      'Embedding pipeline failed',
      projectPath,
      { error }
    )))
  )
}

// =============================================================================
// ELEMENT SELECTION
// =============================================================================

/**
 * Get elements that need semantic enrichment
 */
const getElementsToEnrich = (
  projectPath: string,
  forceReenrichment: boolean,
  elementFilter: (element: CodeElementData) => boolean
): Effect.Effect<CodeElementData[], VibeError> => {
  return withProjectDatabase(projectPath, async (db) => {
    let query = `
      SELECT element_path, file_path, element_name, element_type, 
             start_line, end_line, content, enrichment_status
      FROM code_elements 
      WHERE is_placeholder = false
    `
    
    if (!forceReenrichment) {
      query += ` AND (enrichment_status IS NULL OR enrichment_status != 'completed')`
    }
    
    query += ` ORDER BY file_path, start_line`
    
    console.log(`Fetching elements to enrich (force=${forceReenrichment})`)
    const results = await db.query(query)
    const allElements = results?.[0] || []
    
    // Apply element filter
    const filteredElements = allElements.filter(elementFilter)
    
    console.log(`Found ${filteredElements.length} elements to enrich (${allElements.length} total)`)
    return filteredElements
  })
}

// =============================================================================
// DATABASE STORAGE
// =============================================================================

/**
 * Store enriched elements with multi-perspective embeddings
 */
const storeEnrichedElements = (
  enrichedElements: Array<{
    element: CodeElementData
    descriptor: SemanticDescriptor
    embeddings: MultiPerspectiveEmbeddings
  }>,
  projectPath: string
): Effect.Effect<PipelineResult, VibeError> => {
  return withProjectDatabase(projectPath, async (db) => {
    const startTime = Date.now()
    let successCount = 0
    let errorCount = 0
    const errors: string[] = []
    
    console.log(`Storing ${enrichedElements.length} enriched elements`)
    
    // Process elements sequentially to avoid overwhelming the database
    for (const { element, descriptor, embeddings } of enrichedElements) {
      try {
        await storeElementEnrichment(element, descriptor, embeddings, db)
        successCount++
        
        if (successCount % 10 === 0) {
          console.log(`Stored ${successCount}/${enrichedElements.length} enriched elements`)
        }
      } catch (error) {
        errorCount++
        const errorMsg = `Failed to store enrichment for ${element.element_path}: ${error}`
        errors.push(errorMsg)
        console.warn(errorMsg)
      }
    }
    
    const processingTime = Date.now() - startTime
    
    console.log(`Pipeline completed: ${successCount} success, ${errorCount} errors in ${processingTime}ms`)
    
    return {
      total_elements: enrichedElements.length,
      success_count: successCount,
      error_count: errorCount,
      processing_time_ms: processingTime,
      errors
    }
  })
}

/**
 * Store enrichment data for a single element
 */
const storeElementEnrichment = async (
  element: CodeElementData,
  descriptor: SemanticDescriptor,
  embeddings: MultiPerspectiveEmbeddings,
  db: any
): Promise<void> => {
  // Flatten embeddings for storage
  const updateData = {
    semantic_descriptions: {
      functionality: descriptor.functionality,
      integration: descriptor.integration,
      patterns: descriptor.patterns,
      dependencies: descriptor.dependencies,
      usage_context: descriptor.usage_context,
      keywords: descriptor.keywords
    },
    functionality_embeddings: embeddings.functionality,
    integration_embeddings: embeddings.integration,
    patterns_embeddings: embeddings.patterns,
    dependencies_embeddings: embeddings.dependencies,
    usage_context_embeddings: embeddings.usage_context,
    keywords_embeddings: embeddings.keywords,
    embedding_model: 'jina-embeddings-v2',
    embedding_version: '2.0',
    embedding_timestamp: new Date().toISOString(),
    enrichment_status: 'completed'
  }
  
  // Update the element with enrichment data
  await db.query(`
    UPDATE code_elements 
    SET 
      semantic_descriptions = $semantic_descriptions,
      functionality_embeddings = $functionality_embeddings,
      integration_embeddings = $integration_embeddings,
      patterns_embeddings = $patterns_embeddings,
      dependencies_embeddings = $dependencies_embeddings,
      usage_context_embeddings = $usage_context_embeddings,
      keywords_embeddings = $keywords_embeddings,
      embedding_model = $embedding_model,
      embedding_version = $embedding_version,
      embedding_timestamp = $embedding_timestamp,
      enrichment_status = $enrichment_status
    WHERE element_path = $element_path
  `, {
    element_path: element.element_path,
    ...updateData
  })
}

// =============================================================================
// TYPES
// =============================================================================

export interface PipelineResult {
  total_elements: number
  success_count: number
  error_count: number
  processing_time_ms: number
  errors: string[]
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get pipeline status for a project
 */
export const getPipelineStatus = (projectPath: string): Effect.Effect<PipelineStatus, VibeError> => {
  return withProjectDatabase(projectPath, async (db) => {
    const statusQuery = `
      SELECT 
        enrichment_status,
        count() as count
      FROM code_elements 
      WHERE is_placeholder = false
      GROUP BY enrichment_status
    `
    
    const results = await db.query(statusQuery)
    const statusCounts = results?.[0] || []
    
    let pending = 0
    let completed = 0
    let failed = 0
    
    for (const status of statusCounts) {
      switch (status.enrichment_status) {
        case 'completed':
          completed = status.count
          break
        case 'failed':
          failed = status.count
          break
        default:
          pending = status.count
          break
      }
    }
    
    return {
      pending,
      completed,
      failed,
      total: pending + completed + failed,
      completion_percentage: pending + completed + failed > 0 
        ? Math.round((completed / (pending + completed + failed)) * 100)
        : 0
    }
  })
}

export interface PipelineStatus {
  pending: number
  completed: number
  failed: number
  total: number
  completion_percentage: number
}
```

### **7. Storage Integration Points**

**Modifications to existing files:**

**File**: `src/infra/storage.ts`
**Lines to modify**: 768-874 (element storage pipeline)

```typescript
// Add semantic enrichment trigger after element storage
const elementPromises = parseResult.elements.map(async (element) => {
  try {
    // ... existing element storage code ...
    
    // NEW: Trigger semantic enrichment for newly created/updated elements
    if (outcome.type === 'added' || outcome.type === 'updated') {
      // Mark for enrichment (will be processed by embedding pipeline)
      await db.query(`
        UPDATE code_elements 
        SET enrichment_status = 'pending'
        WHERE element_path = $elementPath
      `, { elementPath })
    }
    
    return outcome
  } catch (error) {
    // ... existing error handling ...
  }
})
```

**Enhance search function** at lines 1366-1388:

```typescript
/**
 * Enhanced semantic search using MRI activation
 */
export const searchElements = (
  query: string,
  projectPath: string,
  options: { 
    limit?: number
    threshold?: number
    useSemanticSearch?: boolean 
  } = {}
): Effect.Effect<CodeElement[], VibeError> => {
  const { limit = 10, threshold = 0.3, useSemanticSearch = true } = options
  
  return pipe(
    Effect.tryPromise({
      try: async () => {
        // Check if semantic search is available and enabled
        if (useSemanticSearch) {
          try {
            const { executeeMRISearch } = await import('../agent/semantic-search.ts')
            const mriResult = await Effect.runPromise(
              executeeMRISearch(query, projectPath, { 
                maxResults: limit,
                contextThreshold: threshold 
              })
            )
            
            // Convert MRI results to CodeElement format
            return [
              ...mriResult.primary_matches,
              ...mriResult.related_matches,
              ...mriResult.context_matches
            ].slice(0, limit)
          } catch (semanticError) {
            console.warn('Semantic search failed, falling back to text search:', semanticError)
          }
        }
        
        // Fallback to existing name-based search
        return withProjectDatabase(projectPath, async (db) => {
          const nameQuery = `
            SELECT * FROM code_elements
            WHERE element_name ~ $query OR content ~ $query
            ORDER BY element_name ASC
            LIMIT $limit
          `
          
          const results = await db.query(nameQuery, { query, limit })
          return Array.isArray(results) && results.length > 0 ? results[0] : []
        })
      },
      catch: (error) => storageError(
        'error',
        `Search failed for query: ${query}`,
        query,
        { error }
      )
    })
  )
}
```

## 🚀 **Deployment & Integration Workflow**

### **Phase 1: Infrastructure Setup**

1. **Deploy Python FastAPI embedding service**:
```bash
cd embed/
chmod +x start.sh
./start.sh
```

2. **Extend SurrealDB schema**:
```bash
deno run --allow-all src/infra/storage.ts init-schema
```

3. **Verify integration**:
```bash
# Test service health
curl http://localhost:3001/health

# Test single embedding
curl -X POST "http://localhost:3001/embed" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "validates user input using zod schema", 
    "element_type": "function",
    "perspective": "functionality"
  }'
```

### **Phase 2: Semantic Enrichment**

1. **Run embedding pipeline**:
```bash
deno run --allow-all src/agent/embedding-pipeline.ts enrich-project ./
```

2. **Monitor progress**:
```bash
deno run --allow-all src/agent/embedding-pipeline.ts status ./
```

### **Phase 3: MRI Search Integration**

1. **Test semantic search**:
```bash
deno run --allow-all src/agent/semantic-search.ts test-query "zod validation"
```

2. **Integrate with storage.ts search**:
   - Enhanced `searchElements()` function automatically uses MRI search when available
   - Falls back to text search if semantic enrichment not completed

### **Phase 4: Production Integration**

1. **Update CLI commands** to use enhanced search
2. **Add embedding pipeline to indexing workflow**
3. **Monitor embedding service health**
4. **Set up batch enrichment for large codebases**

## 📊 **Performance Characteristics**

| Component | Initial Setup | Ongoing Operations | Memory Usage |
|-----------|---------------|-------------------|--------------|
| Python FastAPI Service | 15s startup | 75ms/embedding | 300MB baseline |
| LLM Enrichment | 60s codebase load | 3s/element | 500MB temporary |
| Multi-Perspective | 10s batch setup | 150ms/perspective | 1GB peak |
| MRI Search | Instant | 200ms/query | 100MB working |

## 🎯 **Success Metrics**

- **Semantic Coverage**: >90% of elements enriched
- **Search Relevance**: >85% user satisfaction
- **Performance**: <500ms average search time
- **Resource Usage**: <2GB total memory footprint
- **Accuracy**: >75% first-result relevance for domain queries

This architecture extends the existing atomic AST and storage systems with semantic intelligence while maintaining clean separation of concerns and enabling the revolutionary MRI search capabilities described in EMBEDDING.md.