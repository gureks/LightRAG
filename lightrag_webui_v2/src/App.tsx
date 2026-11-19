import { useState, useCallback, useEffect, useRef } from 'react'
import ThemeProvider from '@/components/ThemeProvider'
import TabVisibilityProvider from '@/contexts/TabVisibilityProvider'
import ApiKeyAlert from '@/components/ApiKeyAlert'
import StatusIndicator from '@/components/status/StatusIndicator'
import { SiteInfo } from '@/lib/constants'
import { entryHomeHref } from '@/lib/pathPrefix'
import { useBackendState, useAuthStore } from '@/stores/state'
import { useSettingsStore } from '@/stores/settings'
import { getAuthStatus } from '@/api/lightrag'
import {
  activateLoginIdentityFromToken,
  useIdentityEpochStore
} from '@/lib/loginIdentity'
import {
  markVersionCheckedFromLogin,
  wasVersionCheckedThisPageLoad
} from '@/lib/versionCheckCache'
import SiteHeader from '@/features/SiteHeader'
import { InvalidApiKeyError, RequireApiKeError } from '@/api/lightrag'
import { ZapIcon } from 'lucide-react'
import { Spinner } from '@heroui/react'

import GraphViewer from '@/features/GraphViewer'
import DocumentManager from '@/features/DocumentManager'
import RetrievalView from '@/features/RetrievalView'
import WorkspaceSidebar from '@/features/kos/WorkspaceSidebar'
import HomeView from '@/features/kos/HomeView'
import LiveDataSyncView from '@/features/kos/LiveDataSyncView'
import ConflictAuditView from '@/features/kos/ConflictAuditView'
import { AgentsView, PeopleView, ContextView, SettingsView } from '@/features/kos/AdminViews'
import AskCopilotWidget from '@/features/kos/AskCopilotWidget'

import { Tabs, TabsContent } from '@/components/ui/Tabs'
import ErrorBoundary from '@/components/ErrorBoundary'
import usePageRestoreGeneration from '@/hooks/usePageRestoreGeneration'

function App() {
  const message = useBackendState.use.message()
  const enableHealthCheck = useSettingsStore.use.enableHealthCheck()
  const currentTab = useSettingsStore.use.currentTab()
  const [apiKeyAlertOpen, setApiKeyAlertOpen] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const identityEpoch = useIdentityEpochStore((s) => s.epoch)
  const versionCheckRef = useRef(false)
  const healthCheckInitializedRef = useRef(false)
  const pageRestoreGeneration = usePageRestoreGeneration()

  const handleApiKeyAlertOpenChange = useCallback((open: boolean) => {
    setApiKeyAlertOpen(open)
    if (!open) {
      useBackendState.getState().clear()
    }
  }, [])

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const performHealthCheck = async () => {
      try {
        if (isMountedRef.current) {
          await useBackendState.getState().check()
        }
      } catch (error) {
        console.error('Health check error:', error)
      }
    }

    useBackendState.getState().setHealthCheckFunction(performHealthCheck)

    if (!enableHealthCheck || apiKeyAlertOpen) {
      useBackendState.getState().clearHealthCheckTimer()
      if (!enableHealthCheck && !apiKeyAlertOpen) {
        useBackendState.getState().probeApiDocsCapability()
      }
      return
    }

    if (!healthCheckInitializedRef.current) {
      healthCheckInitializedRef.current = true
    }

    useBackendState.getState().resetHealthCheckTimer()

    return () => {
      useBackendState.getState().clearHealthCheckTimer()
    }
  }, [enableHealthCheck, apiKeyAlertOpen, pageRestoreGeneration])

  useEffect(() => {
    const checkVersion = async () => {
      if (versionCheckRef.current) return
      versionCheckRef.current = true

      if (wasVersionCheckedThisPageLoad()) {
        setInitializing(false)
        return
      }

      try {
        setInitializing(true)

        const token = localStorage.getItem('LIGHTRAG-API-TOKEN')
        const status = await getAuthStatus()

        if (!status.auth_configured && status.access_token) {
          activateLoginIdentityFromToken(status.access_token)
          useAuthStore.getState().login(
            status.access_token,
            true,
            status.core_version,
            status.api_version,
            status.webui_title || null,
            status.webui_description || null
          )
        } else if (
          token &&
          (status.core_version ||
            status.api_version ||
            status.webui_title ||
            status.webui_description)
        ) {
          const isGuestMode =
            status.auth_mode === 'disabled' || useAuthStore.getState().isGuestMode
          useAuthStore.getState().login(
            token,
            isGuestMode,
            status.core_version,
            status.api_version,
            status.webui_title || null,
            status.webui_description || null
          )
        }

        markVersionCheckedFromLogin()
      } catch (error) {
        console.error('Failed to get version info:', error)
      } finally {
        setInitializing(false)
      }
    }

    checkVersion()
  }, [])

  const handleTabChange = useCallback(
    (tab: string) => useSettingsStore.getState().setCurrentTab(tab as any),
    []
  )

  const [previousMessage, setPreviousMessage] = useState(message)
  if (message !== previousMessage) {
    setPreviousMessage(message)
    if (message && (message.includes(InvalidApiKeyError) || message.includes(RequireApiKeError))) {
      setApiKeyAlertOpen(true)
    }
  }

  return (
    <ThemeProvider>
      <TabVisibilityProvider>
        {initializing ? (
          <div className="flex h-screen w-screen flex-col">
            <header className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 flex h-10 w-full border-b px-4 backdrop-blur">
              <div className="min-w-[200px] w-auto flex items-center">
                <a
                  href={entryHomeHref(window.location.pathname)}
                  className="flex items-center gap-2"
                >
                  <ZapIcon className="text-primary size-4" aria-hidden="true" />
                  <span className="font-bold md:inline-block">{SiteInfo.name}</span>
                </a>
              </div>
              <div className="flex h-10 flex-1 items-center justify-center"></div>
              <nav className="flex w-[200px] items-center justify-end"></nav>
            </header>

            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Spinner color="accent" size="lg" className="mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">Initializing...</p>
              </div>
            </div>
          </div>
        ) : (
          <main className="bg-background text-foreground flex h-screen w-screen overflow-hidden">
            <Tabs
              value={currentTab}
              defaultValue={currentTab}
              className="!m-0 flex grow flex-col overflow-hidden !p-0"
              onValueChange={handleTabChange}
            >
              <SiteHeader />
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <WorkspaceSidebar />
                <div className="relative grow overflow-hidden">
                  <TabsContent
                    value="home"
                    className="absolute top-0 right-0 bottom-0 left-0 overflow-auto"
                  >
                    <ErrorBoundary>
                      <HomeView />
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent
                    value="documents"
                    className="absolute top-0 right-0 bottom-0 left-0 overflow-auto"
                  >
                    <ErrorBoundary>
                      <DocumentManager />
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent
                    value="knowledge-graph"
                    className="absolute top-0 right-0 bottom-0 left-0 overflow-hidden"
                  >
                    <ErrorBoundary>
                      <GraphViewer />
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent
                    value="retrieval"
                    className="absolute top-0 right-0 bottom-0 left-0 overflow-hidden"
                  >
                    <ErrorBoundary>
                      <RetrievalView key={identityEpoch} />
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent
                    value="data-integrations"
                    className="absolute top-0 right-0 bottom-0 left-0 overflow-auto"
                  >
                    <ErrorBoundary>
                      <LiveDataSyncView />
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent
                    value="conflict-queue"
                    className="absolute top-0 right-0 bottom-0 left-0 overflow-auto"
                  >
                    <ErrorBoundary>
                      <ConflictAuditView />
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent
                    value="agents"
                    className="absolute top-0 right-0 bottom-0 left-0 overflow-auto"
                  >
                    <ErrorBoundary>
                      <AgentsView />
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent
                    value="people"
                    className="absolute top-0 right-0 bottom-0 left-0 overflow-auto"
                  >
                    <ErrorBoundary>
                      <PeopleView />
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent
                    value="context"
                    className="absolute top-0 right-0 bottom-0 left-0 overflow-auto"
                  >
                    <ErrorBoundary>
                      <ContextView />
                    </ErrorBoundary>
                  </TabsContent>
                  <TabsContent
                    value="settings"
                    className="absolute top-0 right-0 bottom-0 left-0 overflow-auto"
                  >
                    <ErrorBoundary>
                      <SettingsView />
                    </ErrorBoundary>
                  </TabsContent>
                </div>
              </div>
            </Tabs>
            {enableHealthCheck && <StatusIndicator />}
            <AskCopilotWidget />
            <ApiKeyAlert open={apiKeyAlertOpen} onOpenChange={handleApiKeyAlertOpenChange} />
          </main>
        )}
      </TabVisibilityProvider>
    </ThemeProvider>
  )
}

export default App
