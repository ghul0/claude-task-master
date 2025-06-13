/**
 * Provider-related constants for Task Master application
 */

/**
 * List of AI providers that don't require API keys for authentication.
 * These providers either use local models or have alternative authentication methods.
 * @type {string[]}
 */
export const PROVIDERS_WITHOUT_API_KEY = ['ollama', 'claude-code'];