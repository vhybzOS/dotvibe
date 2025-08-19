/**
 * Classes and interfaces test fixture
 * Used for testing class/interface parsing and inheritance relationships
 */

// Simple interface
export interface User {
  id: string
  name: string
  email: string
}

// Generic interface
export interface Repository<T> {
  findById(id: string): Promise<T | null>
  save(entity: T): Promise<T>
  delete(id: string): Promise<void>
}

// Interface with inheritance
export interface AdminUser extends User {
  permissions: string[]
  lastLogin: Date
}

// Simple class
export class UserService {
  private users: User[] = []
  
  constructor(private repository: Repository<User>) {}
  
  async createUser(userData: Omit<User, 'id'>): Promise<User> {
    const user: User = {
      id: Math.random().toString(36),
      ...userData
    }
    await this.repository.save(user)
    this.users.push(user)
    return user
  }
  
  getUserById(id: string): User | undefined {
    return this.users.find(user => user.id === id)
  }
  
  private validateUser(user: User): boolean {
    return user.name.length > 0 && user.email.includes('@')
  }
}

// Abstract class
export abstract class BaseEntity {
  protected id: string
  protected createdAt: Date
  
  constructor(id: string) {
    this.id = id
    this.createdAt = new Date()
  }
  
  abstract validate(): boolean
  
  getId(): string {
    return this.id
  }
}

// Class inheritance
export class Product extends BaseEntity {
  constructor(
    id: string,
    private name: string,
    private price: number
  ) {
    super(id)
  }
  
  validate(): boolean {
    return this.name.length > 0 && this.price > 0
  }
  
  getPrice(): number {
    return this.price
  }
}

// Class implementing interface
export class InMemoryUserRepository implements Repository<User> {
  private users = new Map<string, User>()
  
  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null
  }
  
  async save(user: User): Promise<User> {
    this.users.set(user.id, user)
    return user
  }
  
  async delete(id: string): Promise<void> {
    this.users.delete(id)
  }
}

// Type alias
export type UserRole = 'admin' | 'user' | 'guest'

// Enum
export enum UserStatus {
  Active = 'active',
  Inactive = 'inactive',
  Suspended = 'suspended'
}