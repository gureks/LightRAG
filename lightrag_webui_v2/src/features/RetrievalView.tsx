import { useCallback, useState } from 'react'
import { useSettingsStore } from '@/stores/settings'
import { useQuerySettingsStore } from '@/stores/querySettings'
import { useWebuiRetrievalHistoryStore } from '@/stores/webuiRetrievalHistory'
import { useKosPlatformStore, DEFAULT_CITATIONS, CitationSourceItem } from '@/stores/kosPlatform'
import QuerySettings from '@/components/retrieval/QuerySettings'
import MessageList from '@/features/retrieval/MessageList'
import QueryComposer from '@/features/retrieval/QueryComposer'
import { useQuerySession } from '@/features/retrieval/useQuerySession'
import { useTranslation } from 'react-i18next'
import { prepareQueryInput, SUPPORTED_QUERY_MODES } from '@/features/retrieval/queryInput'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/Select'
import { Drawer, Surface } from '@heroui/react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/Tooltip'
import {
  SettingsIcon,
  NetworkIcon,
  BotIcon,
  BookOpenCheckIcon,
  SparklesIcon,
  ArrowUpRightIcon
} from 'lucide-react'

const SUGGESTED_FOLLOW_UPS = [
  'Summarize AlloyDB Omni retention rules with citations',
  'Highlight unresolved temporal conflicts for ACME-Global',
  'Trace entity neighborhood for Tenant Isolation Policy'
]

/**
 * The ADMIN query page: composes the shared query session, message list and
 * composer with a progressive-disclosure Settings Drawer, Cited Sources Sub-Graph
 * Drawer, and `/mode` prefix override.
 */
export default function RetrievalView() {
  const { t } = useTranslation()
  const currentTab = useSettingsStore.use.currentTab()
  const isRetrievalTabActive = currentTab === 'retrieval'

  const queryMode = useQuerySettingsStore((s) => s.querySettings.mode)
  const agents = useKosPlatformStore((s) => s.agents)
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id || 'ag-1')
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(true)
  const [isSubgraphDrawerOpen, setIsSubgraphDrawerOpen] = useState(false)
  const [activeCitation, setActiveCitation] = useState<CitationSourceItem>(DEFAULT_CITATIONS[0])

  const getQuerySettingsSnapshot = useCallback(
    () => useQuerySettingsStore.getState().querySettings,
    []
  )

  const onUserPromptUsed = useCallback((prompt: string) => {
    useSettingsStore.getState().addUserPromptToHistory(prompt)
  }, [])

  const session = useQuerySession({
    historyStore: useWebuiRetrievalHistoryStore,
    getQuerySettingsSnapshot,
    onUserPromptUsed
  })

  // A leading `/mode ` prefix overrides the query mode for this one request.
  // The workspace entry uses the same shared preparation contract.
  const handleSend = useCallback(
    (input: string): string | null => {
      const prepared = prepareQueryInput(input, getQuerySettingsSnapshot().mode)
      if (!prepared.ok) {
        return t(`retrievePanel.retrieval.${prepared.error}`, {
          modes: SUPPORTED_QUERY_MODES.join(', ')
        })
      }

      // The displayed user message keeps the original input (prefix and all);
      // the request carries the stripped query — same as before extraction.
      void session.submitQuery(prepared.query, {
        modeOverride: prepared.modeOverride,
        displayedInput: input
      })
      return null
    },
    [getQuerySettingsSnapshot, session, t]
  )

  const handleOpenCitationSubgraph = (citation: CitationSourceItem) => {
    setActiveCitation(citation)
    setIsSubgraphDrawerOpen(true)
  }

  // Match DocumentManager's 24px content padding plus its 8px inner-card
  // margin. The resulting 32px clearance also stays above StatusIndicator.
  return (
    <div className="flex size-full gap-2 overflow-hidden px-2 pb-8">
      <div className="flex min-h-0 min-w-0 grow flex-col gap-3">
        {/* Top Progressive-Disclosure Chat Action Bar */}
        <div className="border-border bg-card flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <BotIcon className="text-foreground size-4" />
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger aria-label="Active Persona Agent" className="h-7 w-52 text-xs font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((ag) => (
                    <SelectItem key={ag.id} value={ag.id}>
                      {ag.name} ({ag.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="secondary" className="text-[11px] font-normal uppercase">
              Mode: {queryMode}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Citation Pills with Hover Tooltip & Sub-Graph Trigger */}
            <TooltipProvider delayDuration={150}>
              <div className="hidden items-center gap-1 md:flex">
                {DEFAULT_CITATIONS.map((cit) => (
                  <Tooltip key={cit.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => handleOpenCitationSubgraph(cit)}
                        className="border-border bg-default text-foreground hover:bg-default-hover inline-flex cursor-pointer items-center gap-1 rounded-xl border px-2 py-1 text-[11px] font-medium transition-colors"
                      >
                        <BookOpenCheckIcon className="size-3" />
                        <span>[{cit.id}]</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[min(20rem,calc(100vw-2rem))] space-y-1 p-2.5 text-xs">
                      <div className="font-semibold">{cit.title}</div>
                      <p className="text-foreground text-[11px]">{cit.excerpt}</p>
                      <div className="text-foreground flex items-center justify-between pt-1 font-mono text-[10px]">
                        <span>Node: {cit.entities[0] || 'GraphCore'}</span>
                        <span>Score: {(cit.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>

            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setIsSubgraphDrawerOpen(true)}
            >
              <NetworkIcon className="size-3.5" />
              <span>Cited Sub-Graph</span>
            </Button>

            <Button
              size="sm"
              variant={isSettingsDrawerOpen ? 'default' : 'outline'}
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setIsSettingsDrawerOpen((prev) => !prev)}
              aria-label="Toggle Chat Parameters Panel"
            >
              <SettingsIcon className="size-3.5" />
              <span>Parameters</span>
            </Button>
          </div>
        </div>

        <MessageList
          messages={session.messages}
          isLoading={session.isLoading}
          queryProgress={session.queryProgress}
          isActive={isRetrievalTabActive}
          onRedoQuery={(prompt) => {
            handleSend(prompt)
          }}
          onOpenCitations={() => setIsSubgraphDrawerOpen(true)}
          emptyState={
            <div className="flex max-w-lg flex-col items-center gap-3 text-center">
              <div className="text-foreground text-base">
                {t('retrievePanel.retrieval.startPrompt')}
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {SUGGESTED_FOLLOW_UPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleSend(chip)}
                    className="border-border bg-surface text-foreground hover:bg-default inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors"
                  >
                    <SparklesIcon className="size-3" />
                    <span>{chip}</span>
                  </button>
                ))}
              </div>
            </div>
          }
        />

        {/* Follow-up Suggestion Chips when conversation is active */}
        {session.messages.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <span className="text-foreground text-[11px] font-medium">Follow-ups:</span>
            {SUGGESTED_FOLLOW_UPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleSend(chip)}
                className="border-border bg-surface text-foreground hover:bg-default inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors"
              >
                <span>{chip}</span>
                <ArrowUpRightIcon className="size-3" />
              </button>
            ))}
          </div>
        )}

        <QueryComposer
          isLoading={session.isLoading}
          stopDisabled={session.stopDisabled}
          onSend={handleSend}
          onStop={session.handleStop}
          onClear={session.clearMessages}
        />
      </div>

      {/* Right-Side Retrieval Parameters Panel (matches original WebUI) */}
      {isSettingsDrawerOpen && (
        <aside
          aria-label="Retrieval Parameters"
          className="flex h-full shrink-0 overflow-hidden"
        >
          <QuerySettings />
        </aside>
      )}

      {/* Progressive Disclosure Drawer 2: Cited Sources Sub-Graph Inspector */}
      <Drawer.Backdrop isOpen={isSubgraphDrawerOpen} onOpenChange={setIsSubgraphDrawerOpen}>
        <Drawer.Content placement="right">
          <Drawer.Dialog className="border-border bg-background text-foreground w-full max-w-lg border-l shadow-lg">
            <Drawer.CloseTrigger />
            <Drawer.Header className="border-border border-b pb-3">
              <Drawer.Heading className="text-base font-semibold">
                Cited Sources & Entity Sub-Graph
              </Drawer.Heading>
              <p className="text-foreground text-xs">
                Provenance subgraph and verified document chunks grounding this response.
              </p>
            </Drawer.Header>

            <Drawer.Body className="space-y-4 overflow-y-auto py-4">
              {/* Interactive 2D Entity Sub-Graph Preview */}
              <Surface variant="secondary" className="border-border rounded-2xl border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-foreground text-xs font-semibold">
                    Focused Entity Sub-Graph ({activeCitation.entities[0] || 'GraphCore'})
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    valid_to: null (current)
                  </Badge>
                </div>
                <svg
                  viewBox="0 0 360 150"
                  className="border-border bg-background h-36 w-full rounded border"
                  role="img"
                  aria-label="Cited entity relationship subgraph"
                >
                  <line
                    x1="85"
                    y1="75"
                    x2="180"
                    y2="42"
                    stroke="currentColor"
                    strokeOpacity="0.28"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="85"
                    y1="75"
                    x2="180"
                    y2="110"
                    stroke="currentColor"
                    strokeOpacity="0.28"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="180"
                    y1="42"
                    x2="285"
                    y2="75"
                    stroke="currentColor"
                    strokeOpacity="0.28"
                    strokeWidth="1.5"
                  />
                  <circle cx="85" cy="75" r="22" className="fill-primary/15 stroke-primary" />
                  <text
                    x="85"
                    y="78"
                    textAnchor="middle"
                    className="fill-foreground text-[9px] font-medium"
                  >
                    {(activeCitation.entities[0] || 'GraphCore').slice(0, 12)}
                  </text>
                  <circle cx="180" cy="42" r="18" className="fill-secondary stroke-border" />
                  <text
                    x="180"
                    y="45"
                    textAnchor="middle"
                    className="fill-foreground text-[8px]"
                  >
                    AlloyDB Omni
                  </text>
                  <circle cx="180" cy="110" r="18" className="fill-secondary stroke-border" />
                  <text
                    x="180"
                    y="113"
                    textAnchor="middle"
                    className="fill-foreground text-[8px]"
                  >
                    Tenant RLS
                  </text>
                  <circle cx="285" cy="75" r="20" className="fill-secondary stroke-border" />
                  <text
                    x="285"
                    y="78"
                    textAnchor="middle"
                    className="fill-foreground text-[8px]"
                  >
                    GraphCore
                  </text>
                </svg>
              </Surface>

              {/* Cited Chunks List */}
              <div className="space-y-2.5">
                <h4 className="text-foreground text-xs font-medium uppercase">
                  Verified Source Chunks ({DEFAULT_CITATIONS.length})
                </h4>
                {DEFAULT_CITATIONS.map((cit) => {
                  const isSelected = cit.id === activeCitation.id
                  return (
                    <div
                      key={cit.id}
                      onClick={() => setActiveCitation(cit)}
                      className={`cursor-pointer rounded-2xl border p-3 transition-colors ${isSelected
                        ? 'border-accent bg-surface-secondary'
                        : 'border-border bg-surface hover:bg-surface-secondary'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-foreground text-xs font-semibold">
                          [{cit.id}] {cit.title}
                        </span>
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {(cit.confidence * 100).toFixed(0)}% match
                        </Badge>
                      </div>
                      <p className="text-foreground mt-1.5 text-xs leading-relaxed">
                        {cit.excerpt}
                      </p>
                      <div className="text-foreground mt-2 flex items-center justify-between font-mono text-[10px]">
                        <span>Entity: {cit.entities[0] || 'GraphCore'}</span>
                        <span>valid_from: {cit.updatedAt}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  )
}
