#!/usr/bin/env -S deno run --allow-read --allow-write
/**
 * Generate src/version.ts from deno.json version
 * This ensures compiled binaries have the correct version embedded
 */

import { resolve } from '@std/path'

const generateVersionFile = async () => {
  try {
    // Read version from deno.json
    const denoConfigPath = resolve('deno.json')
    const denoConfigText = await Deno.readTextFile(denoConfigPath)
    const denoConfig = JSON.parse(denoConfigText)
    const version = denoConfig.version

    if (!version) {
      throw new Error('No version found in deno.json')
    }

    // Generate version.ts content
    const versionFileContent = `/**
 * Auto-generated version file
 * DO NOT EDIT - Generated from deno.json by scripts/generate-version.ts
 * 
 * @generated
 */

export const VERSION = '${version}' as const
export const BUILD_DATE = '${new Date().toISOString()}' as const
`

    // Write to src/version.ts
    const versionFilePath = resolve('src', 'version.ts')
    await Deno.writeTextFile(versionFilePath, versionFileContent)

    console.log(`✅ Generated src/version.ts with version: ${version}`)
  } catch (error) {
    console.error('❌ Failed to generate version file:', error)
    Deno.exit(1)
  }
}

// Run if this is the main module
if (import.meta.main) {
  await generateVersionFile()
}