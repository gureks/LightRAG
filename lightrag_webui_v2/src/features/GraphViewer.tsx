import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { SigmaContainer, useRegisterEvents, useSigma } from '@react-sigma/core'
import { Settings as SigmaSettings } from 'sigma/settings'
import { GraphSearchOption, OptionItem } from '@react-sigma/graph-search'
import {
  EdgeArrowProgram,
  EdgeLineProgram,
  EdgeRectangleProgram,
  NodePointProgram,
  NodeCircleProgram
} from 'sigma/rendering'
import { NodeBorderProgram } from '@sigma/node-border'
import { EdgeCurvedArrowProgram, createEdgeCurveProgram } from '@sigma/edge-curve'

import FocusOnNode from '@/components/graph/FocusOnNode'
import LayoutsControl from '@/components/graph/LayoutsControl'
import GraphControl from '@/components/graph/GraphControl'
import ZoomControl from '@/components/graph/ZoomControl'
import FullScreenControl from '@/components/graph/FullScreenControl'
import Settings from '@/components/graph/Settings'
import GraphSearch from '@/components/graph/GraphSearch'
import GraphLabels from '@/components/graph/GraphLabels'
import PropertiesView from '@/components/graph/PropertiesView'
import SettingsDisplay from '@/components/graph/SettingsDisplay'
import Legend from '@/components/graph/Legend'
import LegendButton from '@/components/graph/LegendButton'

import { useSettingsStore } from '@/stores/settings'
import { useGraphStore } from '@/stores/graph'
import { DEFAULT_CITATIONS } from '@/stores/kosPlatform'
import useIsDarkMode from '@/hooks/useIsDarkMode'
import {
  labelColorDarkTheme,
  labelColorLightTheme,
  edgeColorDarkTheme,
  EDGE_PERF_LIMIT
} from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/Table'
import {
  NetworkIcon,
  Columns2Icon,
  DatabaseIcon,
  SearchIcon,
  ClockIcon,
  SparklesIcon
} from 'lucide-react'
import { toast } from 'sonner'

import '@react-sigma/core/lib/style.css'
import '@react-sigma/graph-search/lib/style.css'

type FabricViewMode = 'graph' | 'split' | 'vector'

interface VectorChunkEntry {
  id: string
  entityNode: string
  docTitle: string
  snippet: string
  similarityScore: number
  validFrom: string
  validTo: string | null
  dimensions: string
}

const DEFAULT_VECTOR_CHUNKS: VectorChunkEntry[] = DEFAULT_CITATIONS.map((c, idx) => ({
  id: `vec-${c.id}`,
  entityNode: c.entities[0] || 'GraphCore',
  docTitle: c.title,
  snippet: c.excerpt,
  similarityScore: c.confidence,
  validFrom: c.updatedAt,
  validTo: null,
  dimensions: idx % 2 === 0 ? '[0.041, -0.118, 0.294, ... 1024d]' : '[-0.089, 0.204, 0.172, ... 1024d]'
})).concat([
  {
    id: 'vec-c4',
    entityNode: 'Conflict-Resolution-Engine',
    docTitle: 'GraphCore_Contradiction_Audit_Spec.md',
    snippet:
      'Temporal append-only edges track valid_from and valid_to intervals so superseded claims remain auditable without deleting historical provenance.',
    similarityScore: 0.91,
    validFrom: '2026-03-01',
    validTo: null,
    dimensions: '[0.112, 0.054, -0.301, ... 1024d]'
  }
])

const createSigmaSettings = (
  isDarkTheme: boolean,
  enableEdgeEvents: boolean
): Partial<SigmaSettings> => ({
  allowInvalidContainer: true,
  defaultNodeType: 'border',
  defaultEdgeType: 'rect',
  renderEdgeLabels: false,
  hideEdgesOnMove: true,
  edgeProgramClasses: {
    rect: EdgeRectangleProgram,
    line: EdgeLineProgram,
    arrow: EdgeArrowProgram,
    curvedArrow: EdgeCurvedArrowProgram,
    curvedNoArrow: createEdgeCurveProgram()
  },
  nodeProgramClasses: {
    point: NodePointProgram,
    default: NodePointProgram,
    circle: NodeCircleProgram,
    border: NodeBorderProgram
  },
  labelGridCellSize: 60,
  labelRenderedSizeThreshold: 12,
  enableEdgeEvents,
  defaultEdgeColor: isDarkTheme ? edgeColorDarkTheme : '#d3d3d3',
  labelColor: {
    color: isDarkTheme ? labelColorDarkTheme : labelColorLightTheme,
    attribute: 'labelColor'
  },
  edgeLabelColor: {
    color: isDarkTheme ? labelColorDarkTheme : labelColorLightTheme,
    attribute: 'labelColor'
  },
  edgeLabelSize: 8,
  labelSize: 12
})

const GraphEvents = ({
  onDoubleClickNode
}: {
  onDoubleClickNode?: (nodeId: string) => void
}) => {
  const registerEvents = useRegisterEvents()
  const sigma = useSigma()
  const [draggedNode, setDraggedNode] = useState<string | null>(null)

  useEffect(() => {
    registerEvents({
      downNode: (e) => {
        setDraggedNode(e.node)
        sigma.getGraph().setNodeAttribute(e.node, 'highlighted', true)
      },
      doubleClickNode: (e) => {
        e.preventSigmaDefault()
        useGraphStore.getState().setSelectedNode(e.node, true)
        useGraphStore.getState().setFocusedNode(e.node)
        onDoubleClickNode?.(e.node)
      },
      mousemovebody: (e) => {
        if (!draggedNode) return
        const pos = sigma.viewportToGraph(e)
        sigma.getGraph().setNodeAttribute(draggedNode, 'x', pos.x)
        sigma.getGraph().setNodeAttribute(draggedNode, 'y', pos.y)

        e.preventSigmaDefault()
        e.original.preventDefault()
        e.original.stopPropagation()
      },
      mouseup: () => {
        if (draggedNode) {
          setDraggedNode(null)
          sigma.getGraph().removeNodeAttribute(draggedNode, 'highlighted')
        }
      },
      mousedown: (e) => {
        const mouseEvent = e.original as MouseEvent
        if (mouseEvent.buttons !== 0 && !sigma.getCustomBBox()) {
          sigma.setCustomBBox(sigma.getBBox())
        }
      }
    })
  }, [registerEvents, sigma, draggedNode, onDoubleClickNode])

  return null
}

const GraphViewer = () => {
  const sigmaRef = useRef<any>(null)
  const prevTheme = useRef<string>('')

  const [viewMode, setViewMode] = useState<FabricViewMode>('graph')
  const [vectorFilter, setVectorFilter] = useState('')
  const [expandedSubgraphNode, setExpandedSubgraphNode] = useState<string | null>(null)

  const selectedNode = useGraphStore.use.selectedNode()
  const focusedNode = useGraphStore.use.focusedNode()
  const moveToSelectedNode = useGraphStore.use.moveToSelectedNode()
  const isFetching = useGraphStore.use.isFetching()
  const isLayoutComputing = useGraphStore.use.isLayoutComputing()

  const showPropertyPanel = useSettingsStore.use.showPropertyPanel()
  const showNodeSearchBar = useSettingsStore.use.showNodeSearchBar()
  const enableNodeDrag = useSettingsStore.use.enableNodeDrag()
  const showLegend = useSettingsStore.use.showLegend()
  const theme = useSettingsStore.use.theme()
  const enableEdgeEvents = useSettingsStore.use.enableEdgeEvents()
  const graphEdgeCount = useGraphStore.use.graphEdgeCount()

  const effectiveEdgeEvents = enableEdgeEvents && graphEdgeCount <= EDGE_PERF_LIMIT
  const [isThemeSwitching, setIsThemeSwitching] = useState(false)
  const isDarkMode = useIsDarkMode()

  const memoizedSigmaSettings = useMemo(
    () => createSigmaSettings(isDarkMode, effectiveEdgeEvents),
    [isDarkMode, effectiveEdgeEvents]
  )

  useEffect(() => {
    const isThemeChange = prevTheme.current && prevTheme.current !== theme
    if (isThemeChange) {
      prevTheme.current = theme
      const switchTimer = setTimeout(() => setIsThemeSwitching(true), 0)
      const timer = setTimeout(() => {
        setIsThemeSwitching(false)
      }, 150)

      return () => {
        clearTimeout(switchTimer)
        clearTimeout(timer)
      }
    }
    prevTheme.current = theme
  }, [theme])

  useEffect(() => {
    return () => {
      const sigma = useGraphStore.getState().sigmaInstance
      if (sigma) {
        try {
          sigma.kill()
          useGraphStore.getState().setSigmaInstance(null)
        } catch (error) {
          console.error('Error cleaning up sigma instance:', error)
        }
      }
    }
  }, [])

  const onSearchFocus = useCallback((value: GraphSearchOption | null) => {
    if (value === null) useGraphStore.getState().setFocusedNode(null)
    else if (value.type === 'nodes') useGraphStore.getState().setFocusedNode(value.id)
  }, [])

  const onSearchSelect = useCallback((value: GraphSearchOption | null) => {
    if (value === null) {
      useGraphStore.getState().setSelectedNode(null)
    } else if (value.type === 'nodes') {
      useGraphStore.getState().setSelectedNode(value.id, true)
    }
  }, [])

  const handleDoubleClickNode = useCallback((nodeId: string) => {
    setExpandedSubgraphNode(nodeId)
    toast.info(`Expanded 2-hop entity neighborhood for node "${nodeId}"`)
  }, [])

  const autoFocusedNode = useMemo(() => focusedNode ?? selectedNode, [focusedNode, selectedNode])
  const searchInitSelectedNode = useMemo(
    (): OptionItem | null => (selectedNode ? { type: 'nodes', id: selectedNode } : null),
    [selectedNode]
  )

  const filteredVectorChunks = useMemo(() => {
    const q = vectorFilter.trim().toLowerCase()
    if (!q) return DEFAULT_VECTOR_CHUNKS
    return DEFAULT_VECTOR_CHUNKS.filter(
      (c) =>
        c.entityNode.toLowerCase().includes(q) ||
        c.docTitle.toLowerCase().includes(q) ||
        c.snippet.toLowerCase().includes(q)
    )
  }, [vectorFilter])

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      {/* Top-Center Knowledge Fabric Mode Switcher (Knowledge Graph | Split View | Vector Space) */}
      <div className="border-border bg-card z-20 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-xs font-semibold">Knowledge Fabric</span>
          <Badge variant="secondary" className="text-[11px] font-normal">
            AlloyDB PGVector + GraphCore
          </Badge>
          {expandedSubgraphNode && (
            <Badge variant="outline" className="gap-1 font-mono text-[10px]">
              <SparklesIcon className="size-3" />
              Subgraph Focus: {expandedSubgraphNode}
            </Badge>
          )}
        </div>

        <div
          className="border-border bg-muted/40 inline-flex items-center rounded-md border p-0.5"
          role="group"
          aria-label="Knowledge Fabric View Mode"
        >
          <button
            type="button"
            onClick={() => setViewMode('graph')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'graph'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <NetworkIcon className="size-3.5" />
            <span>Knowledge Graph</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'split'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Columns2Icon className="size-3.5" />
            <span>Split View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('vector')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'vector'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <DatabaseIcon className="size-3.5" />
            <span>Vector Space</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Graph, Split, or Vector Space */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* 2D Node-Link Knowledge Graph Pane (always mounted so Sigma WebGL context stays intact) */}
        <div
          className={`relative h-full overflow-hidden ${
            viewMode === 'vector'
              ? 'hidden'
              : viewMode === 'split'
                ? 'border-border w-full border-r lg:w-3/5'
                : 'w-full'
          }`}
        >
          <SigmaContainer
            settings={memoizedSigmaSettings}
            className="!bg-background !size-full overflow-hidden"
            ref={sigmaRef}
          >
            <GraphControl />

            {enableNodeDrag && <GraphEvents onDoubleClickNode={handleDoubleClickNode} />}

            <FocusOnNode node={autoFocusedNode} move={moveToSelectedNode} />

            <div className="absolute top-2 left-2 flex items-start gap-2">
              <GraphLabels />
              {showNodeSearchBar && !isThemeSwitching && (
                <GraphSearch
                  value={searchInitSelectedNode}
                  onFocus={onSearchFocus}
                  onChange={onSearchSelect}
                />
              )}
            </div>

            <div className="bg-background/80 border-border absolute bottom-2 left-2 flex flex-col rounded-xl border backdrop-blur-md">
              <LayoutsControl />
              <ZoomControl />
              <FullScreenControl />
              <LegendButton />
              <Settings />
            </div>

            {showPropertyPanel && (
              <div className="absolute top-2 right-2 z-10">
                <PropertiesView />
              </div>
            )}

            {showLegend && (
              <div className="absolute right-2 bottom-10 z-0">
                <Legend className="bg-background/80 backdrop-blur-md" />
              </div>
            )}

            <SettingsDisplay />
          </SigmaContainer>

          {(isFetching || isThemeSwitching || isLayoutComputing) && (
            <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center">
              <div className="text-center">
                <div className="border-primary mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"></div>
                <p className="text-xs">
                  {isThemeSwitching
                    ? 'Switching Theme...'
                    : isFetching
                      ? 'Loading Graph Data...'
                      : 'Computing Layout...'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Dense Vector Space Explorer Pane (visible in 'split' or 'vector' modes) */}
        {(viewMode === 'split' || viewMode === 'vector') && (
          <div
            className={`bg-background flex h-full flex-col overflow-y-auto p-4 ${
              viewMode === 'split' ? 'w-full lg:w-2/5' : 'w-full'
            }`}
          >
            <Card className="border-border bg-card shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      Dense Vector Embeddings Explorer (AlloyDB PGVector)
                    </CardTitle>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      Inspect cosine similarity scores, 1024-d Titan v2 embeddings, and linked
                      knowledge graph entities.
                    </p>
                  </div>
                  <div className="relative w-56">
                    <SearchIcon className="text-muted-foreground absolute top-2.5 left-2.5 size-3.5" />
                    <Input
                      value={vectorFilter}
                      onChange={(e) => setVectorFilter(e.target.value)}
                      placeholder="Filter vector chunks..."
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entity Node</TableHead>
                        <TableHead>Document & Chunk</TableHead>
                        <TableHead className="text-right">Cosine Score</TableHead>
                        <TableHead>Temporal Window</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVectorChunks.map((vec) => (
                        <TableRow key={vec.id}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className="w-fit font-mono text-[11px]">
                                {vec.entityNode}
                              </Badge>
                              <span className="text-muted-foreground font-mono text-[10px]">
                                {vec.dimensions}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-md">
                            <div className="text-foreground text-xs font-medium">
                              {vec.docTitle}
                            </div>
                            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                              {vec.snippet}
                            </p>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs font-semibold">
                            {(vec.similarityScore * 100).toFixed(1)}%
                          </TableCell>
                          <TableCell>
                            <div className="text-muted-foreground flex items-center gap-1 font-mono text-[11px]">
                              <ClockIcon className="size-3" />
                              <span>{vec.validFrom} → current</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {viewMode === 'split' && (
              <div className="border-border bg-muted/20 mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  Tip: Click any node in the graph to inspect properties, or double-click to expand
                  its 2-hop neighborhood.
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setViewMode('graph')}
                >
                  Full Graph
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default GraphViewer
