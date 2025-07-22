/**
 * Perfect EmbedAnything FFI Wrapper for Deno
 * Ultra-Functioning API: withConfig() returns { embed, query }
 */

// Configuration types matching PERFECT Rust implementation
export interface EmbedAnythingConfig {
  model_architecture: string    // "jina", "bert", "clip"
  model_id: string             // "jinaai/jina-embeddings-v2-small-en"
  revision?: string            // "main" or specific commit
  batch_size?: number          // Processing batch size
}

export type RankingStrategy = "Cosine" | "Euclidean" | "Manhattan" | "Dot"

export interface GlobalConfig {
  dbFilePath: string
  ranking: RankingStrategy
  embedding: EmbedAnythingConfig
  threshold: number
  limit: number
}

export interface SearchMatch {
  id: string
  similarity_score: number
}

// PERFECT FFI Bridge to Rust
class EmbedAnythingFFI {
  private lib: Deno.DynamicLibrary<{
    with_config: {
      parameters: ["buffer"]
      result: "i32"
    }
    embed: {
      parameters: ["buffer"]
      result: "pointer"  // Returns direct C string pointer
    }
    query: {
      parameters: ["buffer"]
      result: "pointer"  // Returns direct JSON string pointer
    }
    free_cstring: {
      parameters: ["pointer"]
      result: "void"     // Memory cleanup
    }
    cleanup: {
      parameters: []
      result: "void"
    }
  }>

  constructor() {
    // Try multiple library paths for cross-platform support
    const libraryPaths = [
      "./target/release/libembed_any_surreal_thing.so", // Development (current dir)
      "../data/libembed_any_surreal_thing.so",     // Production
      "../data/libembed_any_surreal_thing.dylib",  // macOS
      "../data/libembed_any_surreal_thing.dll",    // Windows
    ]

    let lib = null
    for (const path of libraryPaths) {
      try {
        lib = Deno.dlopen(path, {
          with_config: { parameters: ["buffer"], result: "i32" },
          embed: { parameters: ["buffer"], result: "pointer" },
          query: { parameters: ["buffer"], result: "pointer" },
          free_cstring: { parameters: ["pointer"], result: "void" },
          cleanup: { parameters: [], result: "void" },
        })
        break
      } catch (e) {
        continue // Try next path
      }
    }

    if (!lib) {
      throw new Error("Could not load EmbedAnything library from any path")
    }

    this.lib = lib
  }

  // Helper: Convert pointer to string and free C memory
  private ptrToString(ptr: Deno.PointerValue): string | null {
    if (ptr === null) {
      return null
    }

    try {
      // Read the C string from the pointer
      const view = new Deno.UnsafePointerView(ptr!)
      const string = view.getCString()
      
      // Free the C memory to prevent leaks
      this.lib.symbols.free_cstring(ptr)
      
      return string
    } catch {
      return null
    }
  }

  // Initialize with configuration
  initialize(config: GlobalConfig): boolean {
    const configData = {
      db_file_path: config.dbFilePath,  // Match Rust field names
      ranking: config.ranking,
      embedding: config.embedding,
      threshold: config.threshold,
      limit: config.limit,
    }
    
    const configJson = JSON.stringify(configData)
    const configBytes = new TextEncoder().encode(configJson + '\0')
    
    const result = this.lib.symbols.with_config(configBytes)
    return result === 0
  }

  // PERFECT embed: text -> ID string
  embed(text: string): string | null {
    const textBytes = new TextEncoder().encode(text + '\0')
    const ptr = this.lib.symbols.embed(textBytes)
    return this.ptrToString(ptr)
  }

  // PERFECT query: text -> SearchMatch[]
  query(text: string): SearchMatch[] {
    const textBytes = new TextEncoder().encode(text + '\0')
    const ptr = this.lib.symbols.query(textBytes)
    const jsonString = this.ptrToString(ptr)
    
    if (!jsonString) {
      return []
    }
    
    try {
      return JSON.parse(jsonString) as SearchMatch[]
    } catch {
      return [] // JSON parse error
    }
  }

  // Cleanup resources
  cleanup(): void {
    this.lib.symbols.cleanup()
  }
}

// PERFECT Main API: withConfig returns configured interface
export const withConfig = (config: GlobalConfig) => {
  const ffi = new EmbedAnythingFFI()
  
  if (!ffi.initialize(config)) {
    throw new Error("Failed to initialize EmbedAnything with provided config")
  }

  return {
    embed: (text: string): string => {
      const id = ffi.embed(text)
      if (!id) {
        throw new Error("Failed to embed text")
      }
      return id
    },

    query: (text: string): SearchMatch[] => {
      return ffi.query(text)
    },

    cleanup: (): void => {
      ffi.cleanup()
    }
  }
}

// Export all types for external use
export type { EmbedAnythingConfig, RankingStrategy, GlobalConfig, SearchMatch }

// Example usage:
/*
const embedder = withConfig({
  dbFilePath: ".vibe/code.db",
  ranking: "Cosine",
  embedding: {
    model_architecture: "jina",
    model_id: "jinaai/jina-embeddings-v2-small-en",
    revision: "main"
  },
  threshold: 0.7,
  limit: 10
})

const id = embedder.embed("async function processData() {}")
const results = embedder.query("async processing")

// Always cleanup when done
embedder.cleanup()
*/