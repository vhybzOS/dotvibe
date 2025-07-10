import { executeTool, getAllTools } from './tool-registry.ts'

async function main() {
  console.log('🔧 Debug Runner - Testing Code Analysis Toolbox\n')
  
  try {
    // Test 1: List filesystem
    console.log('📁 Test 1: List filesystem')
    const files = await executeTool('list_filesystem', { path: '.' })
    console.log('Files in current directory:', files)
    console.log()
    
    // Test 2: Read a file (let's read our own debug runner)
    console.log('📄 Test 2: Read file')
    const content = await executeTool('read_file', { path: 'src/debug-runner.ts' })
    console.log(`File content length: ${content.length} characters`)
    console.log(`First 100 characters: ${content.slice(0, 100)}...`)
    console.log()
    
    // Test 3: List symbols in CLI file
    console.log('🔍 Test 3: List symbols in CLI file')
    const symbols = await executeTool('list_symbols_in_file', { path: 'src/cli.ts' })
    console.log('Symbols found:', symbols.length)
    symbols.forEach((symbol, index) => {
      console.log(`  ${index + 1}. ${symbol.name} (${symbol.kind}) - Lines ${symbol.startLine}-${symbol.endLine}`)
    })
    console.log()
    
    // Test 4: Get symbol details (try to find a function in cli.ts)
    if (symbols.length > 0) {
      console.log('📋 Test 4: Get symbol details')
      const firstSymbol = symbols[0]
      if (firstSymbol) {
        try {
          const details = await executeTool('get_symbol_details', { 
            path: 'src/cli.ts', 
            symbolName: firstSymbol.name 
          })
          console.log(`Symbol details for '${details.name}':`)
          console.log(`  Kind: ${details.kind}`)
          console.log(`  Location: Lines ${details.startLine}-${details.endLine}`)
          console.log(`  Content length: ${details.content.length} characters`)
          console.log(`  Content preview: ${details.content.slice(0, 200)}...`)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.log(`  Error getting details for '${firstSymbol.name}': ${errorMessage}`)
        }
      }
    } else {
      console.log('📋 Test 4: Skipped - No symbols found to test')
    }
    console.log()
    
    // Test 5: Create index entry (mock)
    console.log('💾 Test 5: Create index entry (mock)')
    const indexResult = await executeTool('create_index_entry', { 
      data: { 
        file: 'src/cli.ts', 
        symbol: 'main', 
        type: 'function' 
      } 
    })
    console.log('Index entry result:', indexResult)
    console.log()
    
    // Test 6: Show all available tools
    console.log('🛠️  Test 6: Available tools')
    const allTools = getAllTools()
    Object.entries(allTools).forEach(([name, tool]) => {
      console.log(`  ${name}: ${tool.description}`)
    })
    console.log()
    
    console.log('✅ All tests completed successfully!')
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : 'No stack trace available'
    console.error('❌ Error during testing:', errorMessage)
    console.error('Stack trace:', errorStack)
    Deno.exit(1)
  }
}

// Run the main function
if (import.meta.main) {
  await main()
}