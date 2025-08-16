/**
 * Large file test fixture
 * Used for testing performance with large files
 * This file will be extended programmatically to test >1MB files
 */

// Base class that will be replicated many times
export class BaseTestClass {
  private id: string
  private name: string
  private data: any[]
  
  constructor(id: string, name: string) {
    this.id = id
    this.name = name
    this.data = []
  }
  
  getId(): string {
    return this.id
  }
  
  getName(): string {
    return this.name
  }
  
  addData(item: any): void {
    this.data.push(item)
  }
  
  getData(): any[] {
    return [...this.data]
  }
  
  processData(processor: (item: any) => any): any[] {
    return this.data.map(processor)
  }
  
  filterData(predicate: (item: any) => boolean): any[] {
    return this.data.filter(predicate)
  }
  
  clearData(): void {
    this.data = []
  }
  
  toString(): string {
    return `${this.name}[${this.id}]: ${this.data.length} items`
  }
}