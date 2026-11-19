import { useState } from 'react'
import { useKosPlatformStore, WorkspaceMember } from '@/stores/kosPlatform'
import { Switch, Surface } from '@heroui/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/Table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/Select'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import {
  BotIcon,
  Code2Icon,
  UsersIcon,
  UserPlusIcon,
  ShieldCheckIcon,
  LayersIcon,
  ClockIcon,
  KeyRoundIcon,
  CopyIcon,
  CheckIcon
} from 'lucide-react'
import { toast } from 'sonner'

const ROLE_PERMISSIONS: Record<WorkspaceMember['role'], string[]> = {
  Admin: ['Manage Workspaces', 'Edit Schema & Agents', 'Resolve Conflicts', 'Manage RBAC & Keys'],
  Editor: ['Ingest Documents', 'Configure Pipelines', 'Edit Agent Prompts', 'Query Knowledge'],
  Reviewer: ['Audit Conflicts', 'Verify Citations', 'Query Knowledge'],
  Viewer: ['Read-Only Graph & Vector Search', 'Chat with Agents']
}

export function AgentsView() {
  const agents = useKosPlatformStore((s) => s.agents)
  const updateAgentPrompt = useKosPlatformStore((s) => s.updateAgentPrompt)
  const [selectedAgentId, setSelectedAgentId] = useState<string>(agents[0]?.id || 'AGT-01')
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0]
  const [draftPrompt, setDraftPrompt] = useState<string>(selectedAgent?.systemPrompt || '')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleSelectAgent = (id: string, prompt: string) => {
    setSelectedAgentId(id)
    setDraftPrompt(prompt)
  }

  const handleSavePrompt = () => {
    if (!selectedAgent) return
    updateAgentPrompt(selectedAgent.id, draftPrompt, selectedAgent.retrievalMode)
    toast.success(`Updated system prompt for ${selectedAgent.name}`)
  }

  const handleCopyEmbed = (agentId: string) => {
    const snippet = `<script src="https://cdn.uncode.ai/copilot-widget.js" data-agent-id="${agentId}" async></script>`
    navigator.clipboard?.writeText(snippet)
    setCopiedId(agentId)
    toast.success('Copied embed snippet to clipboard')
    setTimeout(() => setCopiedId(null), 1800)
  }

  return (
    <div className="bg-background text-foreground flex h-full w-full flex-col overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-foreground text-xl font-semibold tracking-tight">
                Agents & Personas
              </h1>
              <Badge variant="secondary" className="text-xs font-normal">
                CopilotSDK • /v1/personas
              </Badge>
            </div>
            <p className="text-foreground mt-1 text-sm">
              Configure domain-bounded personas, retrieval modes, and embeddable widgets.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-3 lg:col-span-7">
            {agents.map((agent) => {
              const isSelected = selectedAgent?.id === agent.id
              return (
                <Card
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent.id, agent.systemPrompt)}
                  className={`cursor-pointer border transition-colors ${isSelected
                    ? 'border-accent bg-surface-secondary shadow-surface'
                    : 'border-border bg-surface hover:bg-surface-secondary'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="bg-secondary text-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                          <BotIcon className="size-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-foreground text-sm font-semibold">{agent.name}</h3>
                            <Badge variant="outline" className="text-[11px] uppercase">
                              {agent.retrievalMode}
                            </Badge>
                          </div>
                          <p className="text-foreground mt-0.5 text-xs">
                            {agent.role} • {agent.expression}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={agent.status === 'Active' ? 'default' : 'secondary'}
                        className="text-[11px]"
                      >
                        {agent.status}
                      </Badge>
                    </div>

                    <div className="border-border mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs">
                      <span className="text-foreground font-mono text-[11px]">
                        Scope: {agent.corpus}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-foreground">
                          {agent.queriesHandled.toLocaleString()} queries
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyEmbed(agent.id)
                          }}
                        >
                          {copiedId === agent.id ? (
                            <CheckIcon className="size-3" />
                          ) : (
                            <Code2Icon className="size-3" />
                          )}
                          Embed SDK
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {selectedAgent && (
            <Card className="border-border bg-card h-fit shadow-sm lg:col-span-5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{selectedAgent.name} Configuration</CardTitle>
                <CardDescription className="text-xs">
                  Customize system instructions and citation grounding policy.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-foreground mb-1.5 block text-xs font-medium">
                    Persona System Prompt
                  </label>
                  <Textarea
                    rows={5}
                    value={draftPrompt}
                    onChange={(e) => setDraftPrompt(e.target.value)}
                    className="text-xs leading-relaxed"
                  />
                </div>
                <Surface variant="secondary" className="border-border rounded-xl border p-3">
                  <span className="text-foreground block text-[11px] font-medium uppercase">
                    Embeddable Widget Snippet
                  </span>
                  <code className="text-foreground mt-1 block break-all font-mono text-[11px]">
                    {`<script src="https://cdn.uncode.ai/copilot-widget.js" data-agent-id="${selectedAgent.id}" async></script>`}
                  </code>
                </Surface>
                <Button size="sm" className="w-full" onClick={handleSavePrompt}>
                  Save Persona Policy
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export function PeopleView() {
  const members = useKosPlatformStore((s) => s.members)
  const inviteMember = useKosPlatformStore((s) => s.inviteMember)
  const updateMemberRole = useKosPlatformStore((s) => s.updateMemberRole)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('Engineering')
  const [role, setRole] = useState<WorkspaceMember['role']>('Editor')

  const handleInvite = () => {
    if (!name.trim() || !email.trim()) {
      toast.error('Enter both name and email to invite a team member')
      return
    }
    inviteMember(name.trim(), email.trim(), role, department.trim() || 'General')
    setName('')
    setEmail('')
    toast.success('Workspace invitation sent')
  }

  return (
    <div className="bg-background text-foreground flex h-full w-full flex-col overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-foreground text-xl font-semibold tracking-tight">
                People & Workspace RBAC
              </h1>
              <Badge variant="secondary" className="text-xs font-normal">
                Multi-Tenant Access • /v1/team/members
              </Badge>
            </div>
            <p className="text-foreground mt-1 text-sm">
              Manage role-based access controls, audit reviewer permissions, and tenant scoping.
            </p>
          </div>
        </div>

        {/* Invite Member Bar */}
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserPlusIcon className="size-4" />
              Invite Individual to Workspace
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <Input
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="work@enterprise.io"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              placeholder="Department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
            <Select
              value={role}
              onValueChange={(value) => setRole(value as WorkspaceMember['role'])}
            >
              <SelectTrigger aria-label="Member Role" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Editor">Editor</SelectItem>
                <SelectItem value="Reviewer">Reviewer</SelectItem>
                <SelectItem value="Viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleInvite} className="gap-1.5">
              <UsersIcon className="size-3.5" />
              Grant Access
            </Button>
          </CardContent>
        </Card>

        {/* RBAC Directory Table */}
        <Card className="border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Individual</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Role Assignment</TableHead>
                  <TableHead>Effective Permissions</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-foreground text-sm font-medium">{m.name}</span>
                        <span className="text-foreground text-xs">{m.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{m.department}</TableCell>
                    <TableCell>
                      <Select
                        value={m.role}
                        onValueChange={(value) => {
                          updateMemberRole(m.id, value as WorkspaceMember['role'])
                          toast.success(`Updated ${m.name}'s role to ${value}`)
                        }}
                      >
                        <SelectTrigger aria-label={`Role for ${m.name}`} className="h-8 w-32 text-xs font-medium">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Admin">Admin</SelectItem>
                          <SelectItem value="Editor">Editor</SelectItem>
                          <SelectItem value="Reviewer">Reviewer</SelectItem>
                          <SelectItem value="Viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {ROLE_PERMISSIONS[m.role].map((perm) => (
                          <Badge
                            key={perm}
                            variant="secondary"
                            className="text-[10px] font-normal"
                          >
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground text-xs">{m.lastActive}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  )
}

export function ContextView() {
  const ontologyTypes = useKosPlatformStore((s) => s.ontologyTypes)
  const toggleOntologyTemporal = useKosPlatformStore((s) => s.toggleOntologyTemporal)

  return (
    <div className="bg-background text-foreground flex h-full w-full flex-col overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-foreground text-xl font-semibold tracking-tight">
              Context & Ontology Schema
            </h1>
            <Badge variant="secondary" className="text-xs font-normal">
              GraphCore Temporal Graph
            </Badge>
          </div>
          <p className="text-foreground mt-1 text-sm">
            Manage entity extraction types, temporal validity windows (valid_from / valid_to), and
            confidence thresholds.
          </p>
        </div>

        <Card className="border-border bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity Label</TableHead>
                  <TableHead>Extraction Rule & Scope</TableHead>
                  <TableHead className="text-right">Indexed Nodes</TableHead>
                  <TableHead className="text-right">Avg Confidence</TableHead>
                  <TableHead className="text-right">Temporal Versioning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ontologyTypes.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        <LayersIcon className="mr-1 size-3" />
                        {item.code} ({item.label})
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground text-xs">
                      {item.description}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {item.extractedCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {(item.avgConfidence * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <ClockIcon className="text-foreground size-3.5" />
                        <Switch
                          isSelected={item.temporalTracking}
                          onChange={() => {
                            toggleOntologyTemporal(item.id)
                            toast.success(`Updated temporal tracking for ${item.label}`)
                          }}
                          aria-label={`Temporal tracking for ${item.label}`}
                          size="sm"
                        >
                          <Switch.Control>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  )
}

export function SettingsView() {
  const workspaces = useKosPlatformStore((s) => s.workspaces)
  const activeWorkspaceId = useKosPlatformStore((s) => s.activeWorkspaceId)
  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId) || workspaces[0]
  const [copiedKey, setCopiedKey] = useState(false)

  const sampleKey = `unc_live_${activeWs.id.replace(/[^a-z0-9]/gi, '_')}_9f82a4c1e`

  const handleCopyKey = () => {
    navigator.clipboard?.writeText(sampleKey)
    setCopiedKey(true)
    toast.success('Copied tenant API key')
    setTimeout(() => setCopiedKey(false), 1800)
  }

  return (
    <div className="bg-background text-foreground flex h-full w-full flex-col overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <h1 className="text-foreground text-xl font-semibold tracking-tight">
            Workspace & Platform Settings
          </h1>
          <p className="text-foreground mt-1 text-sm">
            Tenant isolation boundaries, API keys, and AlloyDB pgvector storage parameters.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheckIcon className="size-4" />
                Tenant Isolation Boundary
              </CardTitle>
              <CardDescription className="text-xs">
                Enforced across PGVector, KV, and Graph storage tables.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="border-border flex items-center justify-between border-b py-1.5">
                <span className="text-foreground">Workspace Name</span>
                <span className="text-foreground font-medium">{activeWs.name}</span>
              </div>
              <div className="border-border flex items-center justify-between border-b py-1.5">
                <span className="text-foreground">Tenant Namespace ID</span>
                <span className="text-foreground font-mono">{activeWs.id}</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-foreground">Storage Engine</span>
                <Badge variant="secondary" className="text-[11px] font-normal">
                  AlloyDB Omni PGVector + Graph
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <KeyRoundIcon className="size-4" />
                Tenant API Key (/v1/keys)
              </CardTitle>
              <CardDescription className="text-xs">
                Use this key for StreamOS webhooks, CopilotSDK widgets, and browser extensions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Surface variant="secondary" className="border-border flex items-center justify-between rounded-xl border px-3 py-2">
                <code className="text-foreground truncate font-mono text-xs">{sampleKey}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={handleCopyKey}
                >
                  {copiedKey ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                  Copy
                </Button>
              </Surface>
              <p className="text-foreground text-[11px]">
                Scoped strictly to <span className="font-mono">{activeWs.id}</span> with row level
                security.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
