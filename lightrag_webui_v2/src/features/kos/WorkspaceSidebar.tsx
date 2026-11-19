import { useSettingsStore, type Tab } from '@/stores/settings'
import { useKosPlatformStore } from '@/stores/kosPlatform'
import { Chip, ToggleButton, ToggleButtonGroup, Surface } from '@heroui/react'
import Progress from '@/components/ui/Progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  HomeIcon,
  NetworkIcon,
  RadioIcon,
  FileTextIcon,
  MessageSquareIcon,
  AlertTriangleIcon,
  BotIcon,
  UsersIcon,
  LayersIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon
} from 'lucide-react'
import { useState } from 'react'

interface NavItem {
  id: Tab
  label: string
  icon: React.ComponentType<{ className?: string }>
  section: 'core' | 'governance'
  badge?: number
}

export default function WorkspaceSidebar() {
  const currentTab = useSettingsStore.use.currentTab()
  const setCurrentTab = useSettingsStore.use.setCurrentTab()
  const theme = useSettingsStore.use.theme()
  const setTheme = useSettingsStore.use.setTheme()

  const workspaces = useKosPlatformStore((s) => s.workspaces)
  const activeWorkspaceId = useKosPlatformStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useKosPlatformStore((s) => s.setActiveWorkspaceId)
  const conflicts = useKosPlatformStore((s) => s.conflicts)

  const [collapsed, setCollapsed] = useState(false)

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0]
  const unresolvedCount = conflicts.filter((c) => c.status === 'unresolved').length
  const quotaPercent = Math.round(
    (activeWorkspace.queriesUsed / activeWorkspace.queriesLimit) * 100
  )

  const navItems: NavItem[] = [
    { id: 'home', label: 'Home', icon: HomeIcon, section: 'core' },
    { id: 'knowledge-graph', label: 'Knowledge Graph', icon: NetworkIcon, section: 'core' },
    { id: 'data-integrations', label: 'Data Integrations', icon: RadioIcon, section: 'core' },
    { id: 'documents', label: 'Documentation Uploads', icon: FileTextIcon, section: 'core' },
    { id: 'retrieval', label: 'Chat', icon: MessageSquareIcon, section: 'core' },
    {
      id: 'conflict-queue',
      label: 'Conflict Queue',
      icon: AlertTriangleIcon,
      section: 'governance',
      badge: unresolvedCount
    },
    { id: 'agents', label: 'Agents', icon: BotIcon, section: 'governance' },
    { id: 'people', label: 'People', icon: UsersIcon, section: 'governance' },
    { id: 'context', label: 'Context', icon: LayersIcon, section: 'governance' },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, section: 'governance' }
  ]

  return (
    <aside
      aria-label="Workspace navigation"
      className={cn(
        'border-border bg-background text-foreground flex h-full shrink-0 flex-col justify-between border-r transition-all duration-150 select-none',
        collapsed ? 'w-14' : 'w-60'
      )}
    >
      {/* Top: Workspace Changer */}
      <div className="flex flex-col gap-2 p-2.5">
        <div className="flex items-center justify-between gap-1.5">
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <Select value={activeWorkspaceId} onValueChange={setActiveWorkspaceId}>
                <SelectTrigger
                  aria-label="Select workspace"
                  className="h-9 w-full border-border bg-secondary/40 px-2.5 text-xs font-semibold"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>
                      {ws.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            tooltip={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((prev) => !prev)}
            className="size-8 shrink-0"
          >
            {collapsed ? (
              <PanelLeftOpenIcon className="size-4" />
            ) : (
              <PanelLeftCloseIcon className="size-4" />
            )}
          </Button>
        </div>

        {/* Navigation Groups */}
        <nav aria-label="Main navigation" className="mt-1 flex flex-col gap-0.5">
          {!collapsed && (
            <span className="text-foreground px-2 py-1 text-[11px] font-medium tracking-wider uppercase">
              Knowledge Fabric
            </span>
          )}
          {navItems
            .filter((item) => item.section === 'core')
            .map((item) => {
              const Icon = item.icon
              const isActive = currentTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentTab(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                    isActive
                      ? 'bg-secondary text-foreground font-semibold'
                      : 'text-foreground hover:bg-secondary/50 hover:text-foreground'
                  )}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className={cn('size-4 shrink-0', isActive ? 'text-primary' : '')} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </span>
                </button>
              )
            })}

          {!collapsed && (
            <span className="text-foreground mt-3 px-2 py-1 text-[11px] font-medium tracking-wider uppercase">
              Governance & Studio
            </span>
          )}
          {navItems
            .filter((item) => item.section === 'governance')
            .map((item) => {
              const Icon = item.icon
              const isActive = currentTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentTab(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                    isActive
                      ? 'bg-secondary text-foreground font-semibold'
                      : 'text-foreground hover:bg-secondary/50 hover:text-foreground'
                  )}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className={cn('size-4 shrink-0', isActive ? 'text-primary' : '')} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </span>
                  {!collapsed && item.badge !== undefined && item.badge > 0 && (
                    <Chip size="sm" color="warning" variant="soft" className="h-5 px-1.5 text-xs">
                      {item.badge}
                    </Chip>
                  )}
                </button>
              )
            })}
        </nav>
      </div>

      {/* Bottom: Tenant API Quota & Theme Toggle */}
      <div className="border-border flex flex-col gap-2.5 border-t p-3">
        {!collapsed && (
          <Surface variant="secondary" className="border-border flex flex-col gap-1.5 rounded-2xl border p-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Tenant API Quota</span>
              <span className="text-foreground tabular-nums">{quotaPercent}%</span>
            </div>
            <Progress value={quotaPercent} aria-label="Tenant API Quota usage" className="h-1.5" />
            <div className="text-foreground flex items-center justify-between text-[11px] tabular-nums">
              <span>
                {activeWorkspace.queriesUsed.toLocaleString()} /{' '}
                {activeWorkspace.queriesLimit.toLocaleString()} reqs
              </span>
              <span>{activeWorkspace.tokensUsedM}M tok</span>
            </div>
          </Surface>
        )}

        <div className="flex items-center justify-between">
          {!collapsed && (
            <span className="text-foreground text-xs font-medium">
              Appearance
            </span>
          )}
          <ToggleButtonGroup
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={new Set([theme === 'dark' ? 'dark' : 'light'])}
            onSelectionChange={(keys) => {
              const first = Array.from(keys)[0] as 'light' | 'dark' | undefined
              if (first) setTheme(first)
            }}
            size="sm"
          >
            <ToggleButton id="light" aria-label="Light mode" className="text-foreground gap-1 px-2 text-xs">
              <SunIcon className="size-3.5" />
              {!collapsed && <span>Light</span>}
            </ToggleButton>
            <ToggleButton id="dark" aria-label="Dark mode" className="text-foreground gap-1 px-2 text-xs">
              <ToggleButtonGroup.Separator />
              <MoonIcon className="size-3.5" />
              {!collapsed && <span>Dark</span>}
            </ToggleButton>
          </ToggleButtonGroup>
        </div>
      </div>
    </aside>
  )
}
