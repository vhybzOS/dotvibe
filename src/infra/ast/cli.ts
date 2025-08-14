/**
 * AST System CLI
 *
 * Command-line interface for testing and debugging AST parsing operations.
 *
 * @tested_by tests/core/ast-cli.test.ts
 */

import { Effect } from 'effect'
import { AST } from './index.ts'
import { detectLanguage } from './utils.ts'

/**
 * CLI command handler
 */
if (import.meta.main) {
  const args = Deno.args
  const command = args[0]
  const filePath = args[1]
  
  if (!command || !filePath) {
    console.log('Usage: deno run --allow-all src/infra/ast/cli.ts <command> <file>')
    console.log('Commands:')
    console.log('  parse-file <file>           - Parse file with relationships')
    console.log('  discover-relationships <file> - Discover relationships only')
    console.log('  analyze-data-flow <file>    - Analyze data flow only')
    console.log('  extract-elements <file>     - Extract elements only')
    console.log('')
    console.log('Options:')
    console.log('  --verbose, -v               - Enable verbose output')
    Deno.exit(1)
  }
  
  const verboseFlag = args.includes('--verbose') || args.includes('-v')
  if (verboseFlag) {
    console.log(`🔍 Running ${command} on ${filePath} with verbose output enabled`)
  }

  const runCommand = async () => {
    const ast = new AST()
    
    try {
      const content = await Deno.readTextFile(filePath)
      const language = detectLanguage(filePath)
      const absolutePath = filePath.startsWith('/') ? filePath : `${Deno.cwd()}/${filePath}`
      
      switch (command) {
        case 'parse-file': {
          console.log('🔍 Parsing file with relationships and data flow analysis...')
          const result = await ast.parseFileWithRelationships(content, language, absolutePath)
          
          console.log('📊 Parse Result:')
          console.log(`   File: ${result.filePath}`)
          console.log(`   Elements: ${result.elements.length}`)
          console.log(`   Relationships: ${result.relationships.length}`)
          console.log(`   Data Flows: ${result.dataFlows.length}`)
          console.log(`   Processing Time: ${result.processingTime}ms`)
          
          if (result.errors.length > 0) {
            console.log(`   Errors: ${result.errors.length}`)
            result.errors.forEach((error) => console.log(`     - ${error}`))
          }
          
          if (verboseFlag) {
            console.log('\n📋 Elements:')
            result.elements.forEach((element, index) => {
              console.log(`   ${index + 1}. ${element.element_name} (${element.element_type}) ${element.start_line}:${element.end_line}`)
            })
            
            if (result.relationships.length > 0) {
              console.log('\n🔗 Relationships:')
              result.relationships.forEach((rel, index) => {
                console.log(`   ${index + 1}. ${rel.from} --${rel.relationship_type}--> ${rel.to}`)
              })
            }
            
            if (result.dataFlows.length > 0) {
              console.log('\n🌊 Data Flows:')
              result.dataFlows.forEach((flow, index) => {
                console.log(`   ${index + 1}. ${flow.from} ~~${flow.flow_type}~~> ${flow.to}`)
              })
            }
          }
          break
        }
        
        case 'discover-relationships': {
          console.log('🔍 Discovering relationships...')
          const parseResult = await ast.parseToResult(content, language, absolutePath)
          const relationships = await ast.discoverRelationships(parseResult)
          
          console.log(`🔗 Found ${relationships.length} relationships:`)
          relationships.forEach((rel, index) => {
            console.log(`   ${index + 1}. ${rel.from} --${rel.relationship_type}--> ${rel.to}`)
            if (verboseFlag && rel.context) {
              console.log(`      Context: ${JSON.stringify(rel.context, null, 2)}`)
            }
          })
          break
        }
        
        case 'analyze-data-flow': {
          console.log('🔍 Analyzing data flow...')
          const parseResult = await ast.parseToResult(content, language, absolutePath)
          const dataFlows = await ast.analyzeDataFlow(parseResult)
          
          console.log(`🌊 Found ${dataFlows.length} data flows:`)
          dataFlows.forEach((flow, index) => {
            console.log(`   ${index + 1}. ${flow.from} ~~${flow.flow_type}~~> ${flow.to}`)
            if (verboseFlag && flow.flow_metadata) {
              console.log(`      Metadata: ${JSON.stringify(flow.flow_metadata, null, 2)}`)
            }
          })
          break
        }
        
        case 'extract-elements': {
          console.log('🔍 Extracting elements...')
          const parseResult = await ast.parseToResult(content, language, absolutePath)
          
          console.log(`📋 Found ${parseResult.elements.length} elements:`)
          parseResult.elements.forEach((element, index) => {
            console.log(`   ${index + 1}. ${element.element_name} (${element.element_type}) ${element.start_line}:${element.end_line}`)
            if (verboseFlag) {
              console.log(`      ID: ${element.id}`)
              console.log(`      File: ${element.file_path}`)
              if (element.search_phrases && element.search_phrases.length > 0) {
                console.log(`      Search phrases: ${element.search_phrases.join(', ')}`)
              }
              if (element.parameters && element.parameters.length > 0) {
                console.log(`      Parameters: ${element.parameters.join(', ')}`)
              }
            }
          })
          break
        }
        
        default: {
          console.error(`Unknown command: ${command}`)
          Deno.exit(1)
        }
      }
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`)
      Deno.exit(1)
    }
  }

  await runCommand()
}