/**
 * Unicode and special character test fixture
 * Used for testing Unicode handling in AST parsing
 */

// Unicode in identifiers (where allowed)
const ελληνικά = 'Greek text'
const 中文 = 'Chinese text'
const العربية = 'Arabic text'
const русский = 'Russian text'

// Unicode in strings
export const unicodeStrings = {
  emoji: '👋 Hello 🌍',
  symbols: '© ® ™ € £ ¥',
  math: '∑ ∫ ∂ √ ∞',
  arrows: '← → ↑ ↓ ⇐ ⇒',
  special: 'café naïve résumé'
}

// Unicode in comments
/* 
 * Multi-line comment with Unicode:
 * 🚀 This is a rocket
 * 💡 This is a lightbulb
 * 🔥 This is fire
 */

// Function with Unicode content
export function processUnicode(text: string): string {
  // Handle different Unicode categories
  const normalized = text.normalize('NFC')
  
  // Remove combining marks
  const withoutAccents = normalized.replace(/[\u0300-\u036f]/g, '')
  
  // Convert to lowercase for comparison
  return withoutAccents.toLowerCase()
}

// Class with Unicode methods
export class UnicodeProcessor {
  private readonly patterns = {
    // Emoji pattern
    emoji: /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu,
    // CJK pattern
    cjk: /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff]/g,
    // Arabic pattern
    arabic: /[\u0600-\u06ff\u0750-\u077f]/g
  }
  
  /**
   * Extract emoji from text
   */
  extractEmoji(text: string): string[] {
    return text.match(this.patterns.emoji) || []
  }
  
  /**
   * Check if text contains CJK characters
   */
  hasCJK(text: string): boolean {
    return this.patterns.cjk.test(text)
  }
  
  /**
   * Process multilingual text
   */
  processMultilingual(texts: Record<string, string>): Record<string, number> {
    const result: Record<string, number> = {}
    
    for (const [lang, text] of Object.entries(texts)) {
      result[lang] = Array.from(text).length // Proper Unicode length
    }
    
    return result
  }
}

// Template literal with Unicode
export const generateUnicodeMessage = (name: string, emoji: string) => `
Hello ${name}! ${emoji}

Your message contains:
- Length: ${Array.from(name).length} characters
- Emoji: ${emoji}
- Timestamp: ${new Date().toISOString()}

Thank you! 🙏
`

// Regular expression with Unicode flags
export const unicodeRegexes = {
  wordBoundary: /\b[\p{L}\p{N}]+\b/gu,
  whitespace: /\p{White_Space}+/gu,
  punctuation: /\p{P}/gu,
  symbol: /\p{S}/gu
}

// Edge case: Zero-width characters
export const zeroWidthTest = 'invisible\u200B\u200C\u200Dchars'

// Edge case: Surrogate pairs
export const surrogatePairs = '𝕳𝖊𝖑𝖑𝖔 𝖂𝖔𝖗𝖑𝖉' // Mathematical bold script

// Edge case: Bidirectional text
export const bidirectionalText = 'English العربية English'