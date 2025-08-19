/**
 * Simple function test fixture
 * Used for testing basic AST parsing and element extraction
 */

// Simple function
export function simpleFunction(param: string): string {
  return param.toUpperCase()
}

// Async function
export async function asyncFunction(data: any): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 100))
}

// Arrow function
export const arrowFunction = (x: number, y: number): number => {
  return x + y
}

// Generic function
export function genericFunction<T>(item: T): T {
  return item
}

// Function with optional parameters
export function optionalParams(required: string, optional?: number): string {
  return optional ? `${required}-${optional}` : required
}

// Private function (not exported)
function privateFunction(): void {
  console.log('private')
}

// Function with destructuring
export function destructuringParams({ name, age }: { name: string; age: number }): string {
  return `${name} is ${age} years old`
}

// Higher-order function
export function higherOrderFunction(callback: (x: number) => number): (y: number) => number {
  return (y: number) => callback(y * 2)
}