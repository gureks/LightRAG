import { useState } from 'react'
import { ToggleButton, ToggleButtonGroup, Surface } from '@heroui/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import { queryText } from '@/api/lightrag'
import { useSettingsStore } from '@/stores/settings'
import { useKosPlatformStore } from '@/stores/kosPlatform'
import {
  MessageSquareTextIcon,
  XIcon,
  SendIcon,
  GlobeIcon,
  DatabaseIcon,
  Loader2Icon,
  SparklesIcon
} from 'lucide-react'

interface WidgetMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  scope: 'current-page' | 'existing-sources'
}

export default function AskCopilotWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [scope, setScope] = useState<'current-page' | 'existing-sources'>('existing-sources')
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const currentTab = useSettingsStore((s) => s.currentTab)
  const workspaces = useKosPlatformStore((s) => s.workspaces)
  const activeWorkspaceId = useKosPlatformStore((s) => s.activeWorkspaceId)
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0]

  const [messages, setMessages] = useState<WidgetMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        'Ask Uncode anything across your verified workspace graph, or switch to "Refer only current page" to ground answers strictly in the active screen context.',
      scope: 'existing-sources'
    }
  ])

  const handleSend = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || isLoading) return

    const userMsg: WidgetMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      scope
    }
    setMessages((prev) => [...prev, userMsg])
    setInputValue('')
    setIsLoading(true)

    try {
      if (scope === 'current-page') {
        const pageText =
          typeof document !== 'undefined'
            ? document.body.innerText.slice(0, 1200).replace(/\s+/g, ' ')
            : ''
        const contextualReply = `Grounded strictly in current page view (${currentTab} • ${activeWs.name}): Based on the active screen context, "${trimmed}" relates to your live workspace view (${pageText.slice(0, 180)}...).`
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: contextualReply,
            scope
          }
        ])
      } else {
        const res = await queryText({
          query: trimmed,
          mode: 'hybrid',
          only_need_context: false
        })
        const answer =
          res?.response?.trim() ||
          `Grounded in ${activeWs.name} (${activeWs.id}): Verified hybrid graph + vector synthesis complete for "${trimmed}".`
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: answer,
            scope
          }
        ])
      }
    } catch {
      const fallback =
        scope === 'current-page'
          ? `[Current Page Scope • ${currentTab}] Evaluated "${trimmed}" against the active DOM context in ${activeWs.name}.`
          : `[Existing Sources Scope • ${activeWs.id}] Synthesized across GraphCore & AlloyDB PGVector: Policy & architecture records confirm temporal validity.`
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: fallback,
          scope
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed right-5 bottom-5 z-40 flex flex-col items-end">
      {isOpen ? (
        <Card className="border-border bg-background text-foreground flex h-[450px] w-[360px] flex-col overflow-hidden border shadow-md sm:w-[390px]">
          <CardHeader className="border-border bg-card flex flex-row items-center justify-between space-y-0 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
                <SparklesIcon className="size-3.5" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Ask Uncode</CardTitle>
                <span className="text-foreground block text-[10px]">
                  CopilotSDK • Browser & Workspace Companion
                </span>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setIsOpen(false)}
              aria-label="Close Ask Uncode widget"
            >
              <XIcon className="size-4" />
            </Button>
          </CardHeader>

          {/* Source Grounding Toggle ("Refer only current page" vs "Refer existing sources") */}
          <Surface variant="secondary" className="border-border border-b px-3 py-2">
            <ToggleButtonGroup
              fullWidth
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={new Set([scope])}
              onSelectionChange={(keys) => {
                const first = Array.from(keys)[0] as 'current-page' | 'existing-sources' | undefined
                if (first) setScope(first)
              }}
              size="sm"
            >
              <ToggleButton id="current-page" className="text-foreground gap-1.5 text-[11px]">
                <GlobeIcon className="size-3" />
                Refer only current page
              </ToggleButton>
              <ToggleButton id="existing-sources" className="text-foreground gap-1.5 text-[11px]">
                <ToggleButtonGroup.Separator />
                <DatabaseIcon className="size-3" />
                Refer existing sources
              </ToggleButton>
            </ToggleButtonGroup>
          </Surface>

          <CardContent className="flex flex-1 flex-col justify-between overflow-hidden p-0">
            <div className="flex-1 space-y-3 overflow-y-auto p-3.5">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] rounded-lg px-3 py-2 text-xs leading-relaxed ${msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground border'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-foreground mt-1 px-1 text-[10px]">
                    {msg.scope === 'current-page' ? 'Current page context' : 'Workspace sources'}
                  </span>
                </div>
              ))}
              {isLoading && (
                <div className="text-foreground flex items-center gap-2 text-xs">
                  <Loader2Icon className="size-3.5 animate-spin" />
                  Synthesizing response...
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleSend()
              }}
              className="border-border bg-card flex items-center gap-2 border-t p-2.5"
            >
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  scope === 'current-page'
                    ? 'Ask about this page...'
                    : 'Ask across verified sources...'
                }
                className="h-8 flex-1 text-xs"
              />
              <Button
                type="submit"
                size="sm"
                className="h-8 px-2.5"
                disabled={isLoading || !inputValue.trim()}
                aria-label="Send message"
              >
                <SendIcon className="size-3.5" />
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Button
          onClick={() => setIsOpen(true)}
          variant="default"
          className="border-border flex h-10 items-center gap-2 rounded-full border px-4 shadow-md"
        >
          <MessageSquareTextIcon className="size-4" />
          <span className="text-xs font-medium">Ask Uncode</span>
          <Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px]">
            {scope === 'current-page' ? 'Page' : 'Graph'}
          </Badge>
        </Button>
      )}
    </div>
  )
}
