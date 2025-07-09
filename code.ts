// Sample TypeScript code for testing embedding functionality

import { Effect, pipe } from 'effect'

/**
 * Async function that fetches user data from an API
 */
export const fetchUserData = (userId: string): Effect.Effect<User, FetchError> =>
  Effect.tryPromise({
    try: () => fetch(`/api/users/${userId}`).then(res => res.json()),
    catch: (error) => createFetchError(error, `Failed to fetch user ${userId}`)
  })

/**
 * Synchronous function that validates email format
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Error handling utility for API responses
 */
export const handleApiError = (error: unknown): ApiError => {
  if (error instanceof Error) {
    return {
      _tag: 'ApiError',
      message: error.message,
      code: 'UNKNOWN_ERROR'
    }
  }
  return {
    _tag: 'ApiError', 
    message: 'Unknown error occurred',
    code: 'UNKNOWN_ERROR'
  }
}

/**
 * Complex async operation with error recovery
 */
export const processUserRegistration = (userData: UserRegistrationData) =>
  pipe(
    validateUserData(userData),
    Effect.flatMap(validData => createUser(validData)),
    Effect.flatMap(user => sendWelcomeEmail(user.email)),
    Effect.catchAll(error => 
      pipe(
        logError(error),
        Effect.flatMap(() => Effect.fail(error))
      )
    )
  )

/**
 * Utility function for array processing
 */
export const filterActiveUsers = (users: User[]): User[] =>
  users.filter(user => user.status === 'active' && user.lastLoginAt > Date.now() - 30 * 24 * 60 * 60 * 1000)

/**
 * Database connection helper
 */
export const connectToDatabase = (): Effect.Effect<Database, ConnectionError> =>
  Effect.tryPromise({
    try: () => new DatabaseClient().connect(),
    catch: (error) => createConnectionError(error, 'Database connection failed')
  })

// Type definitions
interface User {
  id: string
  email: string
  name: string
  status: 'active' | 'inactive'
  lastLoginAt: number
}

interface UserRegistrationData {
  email: string
  name: string
  password: string
}

interface FetchError {
  _tag: 'FetchError'
  message: string
  userId?: string
}

interface ApiError {
  _tag: 'ApiError'
  message: string
  code: string
}

interface ConnectionError {
  _tag: 'ConnectionError'
  message: string
}

interface Database {
  query: (sql: string) => Promise<any>
  close: () => Promise<void>
}

// Mock implementations
const createFetchError = (error: unknown, message: string): FetchError => ({
  _tag: 'FetchError',
  message: error instanceof Error ? error.message : message
})

const createConnectionError = (error: unknown, message: string): ConnectionError => ({
  _tag: 'ConnectionError', 
  message: error instanceof Error ? error.message : message
})

const validateUserData = (data: UserRegistrationData) => Effect.succeed(data)
const createUser = (data: UserRegistrationData) => Effect.succeed({ id: '1', ...data, status: 'active' as const, lastLoginAt: Date.now() })
const sendWelcomeEmail = (email: string) => Effect.succeed(void 0)
const logError = (error: unknown) => Effect.succeed(void 0)

class DatabaseClient {
  connect() {
    return Promise.resolve({
      query: (sql: string) => Promise.resolve([]),
      close: () => Promise.resolve()
    })
  }
}