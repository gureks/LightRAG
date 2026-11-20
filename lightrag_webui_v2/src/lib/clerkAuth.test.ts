import { describe, expect, test } from 'bun:test'
import {
  getFreshClerkToken,
  isClerkConfigured,
  registerClerkTokenGetter
} from '@/lib/clerkAuth'
import { useKosPlatformStore } from '@/stores/kosPlatform'

describe('clerkAuth & dynamic workspaces', () => {
  test('isClerkConfigured defaults to false when VITE_CLERK_PUBLISHABLE_KEY is unset', () => {
    expect(isClerkConfigured()).toBe(false)
  })

  test('registerClerkTokenGetter bridges fresh tokens safely', async () => {
    registerClerkTokenGetter(null)
    expect(await getFreshClerkToken()).toBeNull()

    registerClerkTokenGetter(async () => 'clerk_jwt_123')
    expect(await getFreshClerkToken()).toBe('clerk_jwt_123')

    registerClerkTokenGetter(null)
  })

  test('setWorkspaces updates dynamic workspaces and activeWorkspaceId', () => {
    const store = useKosPlatformStore.getState()
    store.setWorkspaces([
      {
        id: 'org_acme',
        name: 'Acme Corp',
        environment: 'Production',
        docCount: 0,
        entityCount: 0,
        edgeCount: 0,
        queriesUsed: 0,
        queriesLimit: 10000,
        tokensUsedM: 0,
        tokensLimitM: 50
      }
    ])
    const updated = useKosPlatformStore.getState()
    expect(updated.workspaces.map((w) => w.id)).toEqual(['org_acme'])
    expect(updated.activeWorkspaceId).toBe('org_acme')
  })
})
