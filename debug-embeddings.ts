import { loadEmbeddingConfig } from './src/embeddings.ts'
import { Effect } from 'effect'

const result = await Effect.runPromise(Effect.either(loadEmbeddingConfig()))
console.log('Result:', result)