// src/shims/zod-compat.ts
// Zod Compatibility Shim for Mastra Framework
//
// This shim solves the Zod v4 compatibility issue by providing a single
// source of truth for all Zod imports across the application stack.
// It re-exports all standard Zod v4 functionality while patching in the
// specific legacy exports that Mastra's zod-to-json-schema dependency requires.

// Re-export all the standard Zod v4 functionality for our own code
export * from "npm:zod@4.0.2";

// CRITICAL: Re-export the specific legacy export that zod-to-json-schema needs
// This is the exact export that's missing from Zod v4's main module
export { ZodFirstPartyTypeKind } from "npm:zod@4.0.2/v3";