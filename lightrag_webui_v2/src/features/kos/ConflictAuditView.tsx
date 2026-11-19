import { useState } from 'react'
import { useKosPlatformStore, type ConflictItem } from '@/stores/kosPlatform'
import { Drawer, Chip, ToggleButton, ToggleButtonGroup, Surface } from '@heroui/react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/Table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { toast } from 'sonner'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ScaleIcon,
  FileTextIcon,
  CalendarIcon,
  UserIcon,
  ShieldCheckIcon
} from 'lucide-react'

export default function ConflictAuditView() {
  const conflicts = useKosPlatformStore((s) => s.conflicts)
  const resolveConflict = useKosPlatformStore((s) => s.resolveConflict)

  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'unresolved' | 'resolved'>('all')

  const selectedConflict: ConflictItem | null =
    conflicts.find((c) => c.id === selectedConflictId) ?? null

  const filteredConflicts = conflicts.filter((c) => {
    if (statusFilter === 'unresolved') return c.status === 'unresolved'
    if (statusFilter === 'resolved') return c.status !== 'unresolved'
    return true
  })

  const handleResolve = (
    id: string,
    resolution: 'authoritative_a' | 'authoritative_b' | 'keep_both',
    label: string
  ) => {
    resolveConflict(id, resolution)
    toast.success(`Conflict ${id} updated: ${label}`)
  }

  const renderStatusChip = (status: ConflictItem['status']) => {
    switch (status) {
      case 'unresolved':
        return (
          <Chip size="sm" color="warning" variant="soft">
            Unresolved
          </Chip>
        )
      case 'authoritative_a':
        return (
          <Chip size="sm" color="success" variant="soft">
            Claim A Authoritative
          </Chip>
        )
      case 'authoritative_b':
        return (
          <Chip size="sm" color="success" variant="soft">
            Claim B Authoritative
          </Chip>
        )
      case 'keep_both':
        return (
          <Chip size="sm" color="default" variant="secondary">
            Kept Both (Scoped)
          </Chip>
        )
    }
  }

  return (
    <div className="bg-background text-foreground flex h-full w-full flex-col gap-6 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            Conflict & Contradiction Audit
          </h1>
          <p className="text-foreground text-sm">
            Ingest-time semantic & temporal discrepancy ledger. Click any row to inspect provenance claims and resolve authority in the side drawer.
          </p>
        </div>

        <ToggleButtonGroup
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([statusFilter])}
          onSelectionChange={(keys) => {
            const first = Array.from(keys)[0] as 'all' | 'unresolved' | 'resolved' | undefined
            if (first) setStatusFilter(first)
          }}
          size="sm"
        >
          {(['all', 'unresolved', 'resolved'] as const).map((filter, idx) => (
            <ToggleButton key={filter} id={filter} className="text-foreground text-xs capitalize">
              {idx > 0 && <ToggleButtonGroup.Separator />}
              {filter}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>

      {/* Tabular Discrepancy List */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">Detected Knowledge Discrepancies</CardTitle>
              <CardDescription className="text-xs">
                Showing {filteredConflicts.length} of {conflicts.length} audited relationship edges
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              GraphCore Contradiction Engine · Phase 2 Preview
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div
            tabIndex={0}
            role="region"
            aria-label="Contradiction audit table"
            className="border-border overflow-x-auto rounded-lg border"
          >
            <Table>
              <TableHeader className="bg-secondary/40 sticky top-0 z-10">
                <TableRow>
                  <TableHead scope="col" className="w-24">ID</TableHead>
                  <TableHead scope="col">Entity & Topic</TableHead>
                  <TableHead scope="col">Conflicting Sources</TableHead>
                  <TableHead scope="col" className="w-32">AI Score</TableHead>
                  <TableHead scope="col" className="w-28">Severity</TableHead>
                  <TableHead scope="col" className="w-40">Resolution Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredConflicts.map((item) => (
                  <TableRow
                    key={item.id}
                    onClick={() => setSelectedConflictId(item.id)}
                    className="hover:bg-secondary/40 cursor-pointer transition-colors"
                  >
                    <TableCell className="font-mono text-xs font-semibold">
                      {item.id}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.entity}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {item.entityType}
                          </Badge>
                        </div>
                        <span className="text-foreground text-xs">{item.topic}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="truncate font-medium">A: {item.claimA.sourceDoc}</span>
                        <span className="text-foreground truncate">
                          B: {item.claimB.sourceDoc}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <span className="text-sm font-semibold">
                        {(item.contradictionScore * 100).toFixed(0)}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="sm"
                        color={
                          item.severity === 'High'
                            ? 'danger'
                            : item.severity === 'Medium'
                              ? 'warning'
                              : 'default'
                        }
                        variant="soft"
                      >
                        {item.severity}
                      </Chip>
                    </TableCell>
                    <TableCell>{renderStatusChip(item.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Right-Aligned Progressive Disclosure Overlay Drawer */}
      <Drawer.Backdrop
        isOpen={selectedConflict !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedConflictId(null)
        }}
      >
        <Drawer.Content placement="right">
          <Drawer.Dialog className="border-border bg-background text-foreground w-full max-w-xl border-l shadow-lg">
            <Drawer.CloseTrigger />
            {selectedConflict && (
              <>
                <Drawer.Header className="border-border border-b pb-4">
                  <div className="flex items-center gap-2">
                    <ScaleIcon className="text-primary size-5" />
                    <Drawer.Heading className="text-base font-bold">
                      {selectedConflict.id} · {selectedConflict.entity}
                    </Drawer.Heading>
                  </div>
                  <p className="text-foreground mt-1 text-xs">
                    {selectedConflict.topic} · Detected {selectedConflict.detectedAt}
                  </p>
                </Drawer.Header>

                <Drawer.Body className="flex flex-col gap-5 py-4">
                  {/* AI Scoring & Analysis */}
                  <Surface variant="secondary" className="border-border rounded-2xl border p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-foreground flex items-center gap-1.5 text-xs font-semibold">
                        <AlertTriangleIcon className="size-4" />
                        AI Contradiction Score:{' '}
                        {(selectedConflict.contradictionScore * 100).toFixed(0)}%
                      </span>
                      {renderStatusChip(selectedConflict.status)}
                    </div>
                    <p className="text-foreground mt-2 text-xs leading-relaxed">
                      {selectedConflict.aiReasoning}
                    </p>
                  </Surface>

                  {/* Claim A Card */}
                  <div className="border-border bg-card flex flex-col gap-2.5 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="default">Claim A</Badge>
                      <span className="text-foreground text-xs tabular-nums">
                        Extraction Confidence:{' '}
                        <strong className="text-foreground">
                          {(selectedConflict.claimA.confidence * 100).toFixed(0)}%
                        </strong>
                      </span>
                    </div>
                    <p className="text-foreground text-sm font-medium leading-relaxed">
                      “{selectedConflict.claimA.statement}”
                    </p>
                    <div className="text-foreground flex flex-wrap items-center gap-4 pt-1 text-xs">
                      <span className="flex items-center gap-1">
                        <FileTextIcon className="size-3.5" />
                        {selectedConflict.claimA.sourceDoc}
                      </span>
                      <span className="flex items-center gap-1">
                        <UserIcon className="size-3.5" />
                        {selectedConflict.claimA.author}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="size-3.5" />
                        valid_from: {selectedConflict.claimA.validFrom}
                      </span>
                    </div>
                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant={
                          selectedConflict.status === 'authoritative_a' ? 'default' : 'outline'
                        }
                        onClick={() =>
                          handleResolve(
                            selectedConflict.id,
                            'authoritative_a',
                            'Claim A marked as Authoritative'
                          )
                        }
                        className="w-full"
                      >
                        <ShieldCheckIcon className="size-4" />
                        Mark Claim A as Authoritative
                      </Button>
                    </div>
                  </div>

                  {/* Claim B Card */}
                  <div className="border-border bg-card flex flex-col gap-2.5 rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">Claim B</Badge>
                      <span className="text-foreground text-xs tabular-nums">
                        Extraction Confidence:{' '}
                        <strong className="text-foreground">
                          {(selectedConflict.claimB.confidence * 100).toFixed(0)}%
                        </strong>
                      </span>
                    </div>
                    <p className="text-foreground text-sm font-medium leading-relaxed">
                      “{selectedConflict.claimB.statement}”
                    </p>
                    <div className="text-foreground flex flex-wrap items-center gap-4 pt-1 text-xs">
                      <span className="flex items-center gap-1">
                        <FileTextIcon className="size-3.5" />
                        {selectedConflict.claimB.sourceDoc}
                      </span>
                      <span className="flex items-center gap-1">
                        <UserIcon className="size-3.5" />
                        {selectedConflict.claimB.author}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarIcon className="size-3.5" />
                        valid_from: {selectedConflict.claimB.validFrom}
                      </span>
                    </div>
                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant={
                          selectedConflict.status === 'authoritative_b' ? 'default' : 'outline'
                        }
                        onClick={() =>
                          handleResolve(
                            selectedConflict.id,
                            'authoritative_b',
                            'Claim B marked as Authoritative'
                          )
                        }
                        className="w-full"
                      >
                        <ShieldCheckIcon className="size-4" />
                        Mark Claim B as Authoritative
                      </Button>
                    </div>
                  </div>
                </Drawer.Body>

                <Drawer.Footer className="border-border flex items-center justify-between border-t pt-3">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      handleResolve(
                        selectedConflict.id,
                        'keep_both',
                        'Kept both claims with temporal/contextual scope'
                      )
                    }
                  >
                    <CheckCircle2Icon className="size-4" />
                    Keep Both
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedConflictId(null)}>
                    Close Drawer
                  </Button>
                </Drawer.Footer>
              </>
            )}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </div>
  )
}
