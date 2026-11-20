/**
 * Clerk Auth & Token Bridge for LightRAG WebUI v2.
 *
 * Keeps Clerk optional at runtime: when VITE_CLERK_PUBLISHABLE_KEY is unset,
 * WebUI v2 operates seamlessly in local AUTH_ACCOUNTS / guest / API-key mode.
 */

export const CLERK_PUBLISHABLE_KEY: string =
  (import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim() || ''

export function isClerkConfigured(): boolean {
  return CLERK_PUBLISHABLE_KEY.length > 0
}

type ClerkTokenGetter = () => Promise<string | null>

let registeredTokenGetter: ClerkTokenGetter | null = null

export function registerClerkTokenGetter(getter: ClerkTokenGetter | null): void {
  registeredTokenGetter = getter
}

export async function getFreshClerkToken(): Promise<string | null> {
  if (!registeredTokenGetter) return null
  try {
    return await registeredTokenGetter()
  } catch {
    return null
  }
}
