/**
 * Syntax errors test fixture
 * Used for testing AST parser error handling
 * 
 * Note: This file contains intentional syntax errors for testing
 */

// Valid code before errors
export const validConstant = 'This is valid'

export function validFunction(): string {
  return 'This works fine'
}

// Syntax Error 1: Missing closing brace
export function missingBrace() {
  const x = 1
  if (x > 0) {
    return true
  // Missing closing brace here

// Syntax Error 2: Invalid generic syntax
export function invalidGeneric<<T>(item: T): T {
  return item
}

// Syntax Error 3: Incomplete interface
export interface IncompleteInterface {
  name: string
  getValue(
  // Missing parameter list and return type

// Syntax Error 4: Malformed arrow function
export const malformedArrow = (x: number ==> {
  return x * 2
}

// Syntax Error 5: Invalid property access
export const invalidAccess = someObject..property.value

// Syntax Error 6: Unclosed string literal
export const unclosedString = 'This string is never closed

// Syntax Error 7: Invalid number literal
export const invalidNumber = 123.456.789

// Syntax Error 8: Mismatched parentheses
export function mismatchedParens(): void {
  const result = (1 + 2) * (3 + 4
  return result
}

// Syntax Error 9: Invalid import statement
import { missing, comma from './other-file.ts'

// Syntax Error 10: Incomplete class declaration
export class IncompleteClass {
  constructor(
    // Missing parameter list

  method() {
    // Valid method but class is incomplete

// More valid code after errors (to test recovery)
export const anotherValid = 42

export interface ValidInterface {
  id: string
  name: string
}