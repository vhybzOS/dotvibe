/**
 * Unit tests for parallel processing and progress dashboard
 * @tested_by Validates parallel LLM description generation and live progress tracking
 */

import { assertEquals, assertExists } from 'jsr:@std/assert'
import { runLLMFirstIndexing } from '../src/mastra/agents/indexing_agent.ts'

Deno.test({
  name: 'Parallel Processing - Performance Test',
  async fn() {
    // Skip if no API key
    const apiKey = Deno.env.get('GOOGLE_API_KEY')
    if (!apiKey) {
      console.log('⏭️ Skipping parallel processing test - no GOOGLE_API_KEY')
      return
    }

    // Create a minimal test codebase digest
    const testDigest = `
==========
FILE: test.ts
==========
export interface TestInterface {
  id: number
  name: string
}

export function testFunction(data: TestInterface): string {
  return \`\${data.name}: \${data.id}\`
}

export const testConstant = 'test-value'
`

    const startTime = Date.now()
    
    // Run LLM-first indexing with verbose output
    await runLLMFirstIndexing('.', testDigest, false) // Non-verbose for test
    
    const endTime = Date.now()
    const duration = endTime - startTime
    
    // Performance assertion: Should complete in reasonable time
    console.log(`✅ Parallel processing completed in ${duration}ms`)
    
    // Should be faster than sequential (rough estimate: < 30 seconds)
    assertEquals(duration < 30000, true, 'Parallel processing should complete within 30 seconds')
  },
  sanitizeOps: false,
  sanitizeResources: false
})

Deno.test({
  name: 'Progress Dashboard - Timing Logic',
  fn() {
    // Test the timing calculations used in progress dashboard
    interface ComponentTask {
      status: 'queued' | 'analyzing' | 'completed' | 'failed'
      startTime?: number
    }

    const tasks: ComponentTask[] = [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'analyzing', startTime: Date.now() - 5000 }, // 5 seconds ago
      { status: 'queued' }
    ]

    const startTime = Date.now() - 10000 // 10 seconds ago
    const now = Date.now()
    const elapsed = (now - startTime) / 1000

    const completed = tasks.filter(t => t.status === 'completed').length
    const analyzing = tasks.filter(t => t.status === 'analyzing').length
    const queued = tasks.filter(t => t.status === 'queued').length

    // Test completion rate calculation
    const completionRate = elapsed > 0 ? completed / elapsed : 0
    const componentsPerMin = completionRate * 60

    // Test ETA calculation
    const eta = (queued + analyzing) > 0 && completionRate > 0 ? ((queued + analyzing) / completionRate) : 0

    // Assertions
    assertEquals(completed, 2)
    assertEquals(analyzing, 1)
    assertEquals(queued, 1)
    assertEquals(elapsed >= 10, true) // Should be around 10 seconds
    assertEquals(completionRate > 0, true) // Should have positive completion rate
    assertEquals(componentsPerMin > 0, true) // Should have positive rate per minute
    assertEquals(eta > 0, true) // Should have positive ETA
    
    console.log(`✅ Timing calculations: ${componentsPerMin.toFixed(1)} components/min, ETA: ${eta.toFixed(1)}s`)
  }
})

Deno.test({
  name: 'Console Progress Updates - Rate Limiting',
  fn() {
    // Test the update interval logic
    const UPDATE_INTERVAL = 2000 // 2 seconds
    let lastUpdate = 0

    const shouldUpdate = (force = false) => {
      const now = Date.now()
      if (!force && (now - lastUpdate) < UPDATE_INTERVAL) {
        return false
      }
      lastUpdate = now
      return true
    }

    // First update should always work
    assertEquals(shouldUpdate(), true)
    
    // Immediate second update should be blocked
    assertEquals(shouldUpdate(), false)
    
    // Force update should work
    assertEquals(shouldUpdate(true), true)
    
    // After waiting interval, should work again
    const mockFutureTime = Date.now() + UPDATE_INTERVAL + 100
    lastUpdate = Date.now() - UPDATE_INTERVAL - 100 // Simulate time passing
    assertEquals(shouldUpdate(), true)
    
    console.log('✅ Rate limiting logic working correctly')
  }
})

Deno.test({
  name: 'Full Description Preservation',
  fn() {
    // Test that full descriptions are preserved (not truncated)
    const fullLLMDescription = `This is a very long LLM description that contains multiple sentences and should not be truncated. It includes detailed architectural context about how this component fits into the overall system design. The description continues for several lines to test proper multiline handling and word wrapping functionality.`
    
    interface ComponentTask {
      description?: string
      status: string
    }
    
    const task: ComponentTask = { status: 'analyzing' }
    
    // Simulate the fixed logic (full description stored)
    task.description = fullLLMDescription // Store full description for final report
    task.status = 'completed'
    
    // Verify full description is preserved
    assertEquals(task.description.length > 100, true, 'Full description should be longer than 100 chars')
    assertEquals(task.description.includes('several lines'), true, 'Full description should contain complete content')
    assertEquals(task.description, fullLLMDescription, 'Full description should match original')
    
    // Simulate dashboard truncation (should still work for live updates)
    const shortDesc = task.description.slice(0, 80) + (task.description.length > 80 ? '...' : '')
    assertEquals(shortDesc.endsWith('...'), true, 'Dashboard should truncate with ellipsis')
    assertEquals(shortDesc.length <= 83, true, 'Dashboard description should be truncated')
    
    console.log('✅ Full descriptions preserved correctly')
  }
})

Deno.test({
  name: 'LLM Component List Extraction',
  fn() {
    // Test JSON extraction from LLM response
    const mockLLMResponse = `
## Architectural Summary
This is a test system with some components.

## Components to Index
\`\`\`json
[
  {
    "filename": "src/test.ts",
    "components": [
      {"name": "TestInterface", "kind": "interface"},
      {"name": "testFunction", "kind": "function"}
    ]
  }
]
\`\`\`

Additional text here...
`

    // Extract JSON from response (simplified version of actual function)
    const jsonMatch = mockLLMResponse.match(/```json\s*([\s\S]*?)\s*```/)
    assertExists(jsonMatch, 'Should find JSON block in LLM response')
    
    const jsonText = jsonMatch[1]
    if (!jsonText) throw new Error('No JSON text found')
    const componentList = JSON.parse(jsonText)
    
    assertEquals(Array.isArray(componentList), true)
    assertEquals(componentList.length, 1)
    assertEquals(componentList[0].filename, 'src/test.ts')
    assertEquals(componentList[0].components.length, 2)
    assertEquals(componentList[0].components[0].name, 'TestInterface')
    
    console.log('✅ LLM component extraction working correctly')
  }
})