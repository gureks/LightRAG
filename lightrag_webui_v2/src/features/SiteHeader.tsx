import Button from '@/components/ui/Button'
import { entryHomeHref } from '@/lib/pathPrefix'
import { SiteInfo, backendBaseUrl } from '@/lib/constants'
import AppSettings from '@/components/AppSettings'
import { TabsList, TabsTrigger } from '@/components/ui/Tabs'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore, useBackendState } from '@/stores/state'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { navigationService } from '@/services/navigation'
import { ZapIcon, LogOutIcon, BookOpenIcon } from 'lucide-react'
import { Chip } from '@heroui/react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import TouchDescriptionPopover from '@/components/ui/TouchDescriptionPopover'

interface NavigationTabProps {
  value: string
  currentTab: string
  children: React.ReactNode
}

function NavigationTab({ value, currentTab, children }: NavigationTabProps) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        'cursor-pointer px-2.5 py-1 transition-all',
        currentTab === value
          ? '!bg-primary !text-primary-foreground'
          : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
      )}
    >
      {children}
    </TabsTrigger>
  )
}

function TabsNavigation() {
  const currentTab = useSettingsStore.use.currentTab()
  const { t } = useTranslation()

  return (
    <div className="flex h-8 self-center">
      <TabsList className="h-full gap-2">
        <NavigationTab value="home" currentTab={currentTab}>
          Home
        </NavigationTab>
        <NavigationTab value="documents" currentTab={currentTab}>
          {t('header.documents')}
        </NavigationTab>
        <NavigationTab value="knowledge-graph" currentTab={currentTab}>
          {t('header.knowledgeGraph')}
        </NavigationTab>
        <NavigationTab value="retrieval" currentTab={currentTab}>
          {t('header.retrieval')}
        </NavigationTab>
      </TabsList>
    </div>
  )
}

export default function SiteHeader() {
  const { t } = useTranslation()
  const { isGuestMode, coreVersion, apiVersion, username, webuiTitle, webuiDescription } = useAuthStore()
  const theme = useSettingsStore.use.theme()
  const apiDocsCapability = useBackendState.use.apiDocsCapability()
  const apiDocsUrl = `${backendBaseUrl}/docs?theme=${theme === 'system' ? 'auto' : theme}`

  const versionDisplay = (coreVersion && apiVersion)
    ? `${coreVersion}/${apiVersion}`
    : null

  const hasWarning = apiVersion?.endsWith('⚠️')
  const versionTooltip = hasWarning
    ? t('header.frontendNeedsRebuild')
    : versionDisplay ? `v${versionDisplay}` : ''

  const handleLogout = () => {
    navigationService.navigateToUnauthenticated()
  }

  return (
    <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 flex h-10 w-full border-b px-4 backdrop-blur">
      <div className="min-w-[200px] w-auto flex items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a href={entryHomeHref(window.location.pathname)} className="flex items-center">
                <ZapIcon className="mr-2 size-4 text-primary" aria-hidden="true" />
                <span className="font-bold md:inline-block">{SiteInfo.name}</span>
                {webuiTitle && (
                  <>
                    <span className="mx-1 text-xs text-muted-foreground" aria-hidden="true">|</span>
                    <span className="text-sm font-medium">{webuiTitle}</span>
                  </>
                )}
              </a>
            </TooltipTrigger>
            {webuiDescription && (
              <TooltipContent side="bottom">
                {webuiDescription}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        <TouchDescriptionPopover description={webuiDescription} />
      </div>

      <div className="flex h-10 flex-1 items-center justify-center">
        <TabsNavigation />
        {isGuestMode && (
          <Chip color="warning" variant="soft" size="sm" className="ml-2 self-center">
            {t('login.guestMode', 'Guest Mode')}
          </Chip>
        )}
      </div>

      <nav className="w-[200px] flex items-center justify-end">
        <div className="flex items-center gap-2">
          {versionDisplay && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground mr-1 cursor-default">
                    v{versionDisplay}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {versionTooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {apiDocsCapability === 'available' && (
            <Button variant="ghost" size="icon" side="bottom" tooltip={t('header.apiDocs')}>
              <a href={apiDocsUrl} target="_blank" rel="noopener noreferrer">
                <BookOpenIcon className="size-4" aria-hidden="true" />
              </a>
            </Button>
          )}
          <AppSettings />
          {!isGuestMode && (
            <Button
              variant="ghost"
              size="icon"
              side="bottom"
              tooltip={`${t('header.logout')} (${username})`}
              onClick={handleLogout}
            >
              <LogOutIcon className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </nav>
    </header>
  )
}
