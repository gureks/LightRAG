import { create } from 'zustand'

export interface WorkspaceTenant {
  id: string
  name: string
  environment: 'Production' | 'Staging' | 'Development'
  docCount: number
  entityCount: number
  edgeCount: number
  queriesUsed: number
  queriesLimit: number
  tokensUsedM: number
  tokensLimitM: number
}

export interface ConflictItem {
  id: string
  entity: string
  entityType: 'ORG' | 'POLICY' | 'METRIC' | 'EVENT' | 'PERSON'
  topic: string
  claimA: {
    statement: string
    sourceDoc: string
    author: string
    validFrom: string
    confidence: number
  }
  claimB: {
    statement: string
    sourceDoc: string
    author: string
    validFrom: string
    confidence: number
  }
  contradictionScore: number
  severity: 'High' | 'Medium' | 'Low'
  status: 'unresolved' | 'authoritative_a' | 'authoritative_b' | 'keep_both'
  detectedAt: string
  aiReasoning: string
}

export interface StreamPipeline {
  id: string
  name: string
  sourceType: 'RSS/Atom' | 'REST Webhook' | 'Kafka' | 'S3 Bucket' | 'GitHub' | 'Confluence'
  endpoint: string
  status: 'active' | 'paused' | 'degraded'
  latencyMs: number
  cacheHitRate: number
  successRate: number
  docsIngested: number
  chunksGenerated: number
  modelConfidence: number
  lastSync: string
  schedule: string
}

export interface PersonaAgent {
  id: string
  name: string
  role: string
  expression: 'CopilotSDK' | 'PersonaCast' | 'IntelLayer' | 'LearnOS' | 'ContentForge'
  retrievalMode: 'hybrid' | 'local' | 'global' | 'mix' | 'naive'
  systemPrompt: string
  corpus: string
  status: 'Active' | 'Draft'
  queriesHandled: number
  avgConfidence: number
}

export interface WorkspaceMember {
  id: string
  name: string
  email: string
  role: 'Admin' | 'Editor' | 'Reviewer' | 'Viewer'
  department: string
  status: 'Active' | 'Invited'
  lastActive: string
  permissions: string[]
}

export interface OntologyEntityType {
  id: string
  code: string
  label: string
  description: string
  extractedCount: number
  avgConfidence: number
  temporalTracking: boolean
}

export interface CitationSourceItem {
  id: string
  title: string
  docId: string
  excerpt: string
  confidence: number
  updatedAt: string
  entities: string[]
  relations: Array<{ from: string; type: string; to: string }>
}

interface KosPlatformState {
  workspaces: WorkspaceTenant[]
  activeWorkspaceId: string
  setActiveWorkspaceId: (id: string) => void

  conflicts: ConflictItem[]
  resolveConflict: (
    id: string,
    resolution: 'authoritative_a' | 'authoritative_b' | 'keep_both'
  ) => void

  pipelines: StreamPipeline[]
  togglePipelineStatus: (id: string) => void
  addPipeline: (pipeline: Omit<StreamPipeline, 'id' | 'docsIngested' | 'chunksGenerated' | 'lastSync'>) => void

  agents: PersonaAgent[]
  activePersonaId: string
  setActivePersonaId: (id: string) => void
  updateAgentPrompt: (id: string, systemPrompt: string, retrievalMode: PersonaAgent['retrievalMode']) => void

  members: WorkspaceMember[]
  inviteMember: (name: string, email: string, role: WorkspaceMember['role'], department: string) => void
  updateMemberRole: (id: string, role: WorkspaceMember['role']) => void

  ontologyTypes: OntologyEntityType[]
  toggleOntologyTemporal: (id: string) => void
}

const INITIAL_WORKSPACES: WorkspaceTenant[] = [
  {
    id: 'space1',
    name: 'Uncode Core Fabric (space1)',
    environment: 'Production',
    docCount: 148,
    entityCount: 7421,
    edgeCount: 25654,
    queriesUsed: 8420,
    queriesLimit: 10000,
    tokensUsedM: 14.2,
    tokensLimitM: 20.0
  },
  {
    id: 'fin-reg-india',
    name: 'Financial & Regulatory Intel',
    environment: 'Production',
    docCount: 412,
    entityCount: 12840,
    edgeCount: 38910,
    queriesUsed: 4150,
    queriesLimit: 10000,
    tokensUsedM: 7.8,
    tokensLimitM: 20.0
  },
  {
    id: 'enterprise-sop',
    name: 'Enterprise SOP & Policy Hub',
    environment: 'Staging',
    docCount: 86,
    entityCount: 3190,
    edgeCount: 9420,
    queriesUsed: 1290,
    queriesLimit: 5000,
    tokensUsedM: 2.1,
    tokensLimitM: 10.0
  }
]

const INITIAL_CONFLICTS: ConflictItem[] = [
  {
    id: 'CONF-101',
    entity: 'Enterprise Data Retention Policy',
    entityType: 'POLICY',
    topic: 'Customer Telemetry & Audit Log Retention Window',
    claimA: {
      statement: 'All tenant query audit logs and provenance traces must be retained for 365 days in AlloyDB cold partitions.',
      sourceDoc: 'Security_Compliance_Handbook_2026_v4.pdf',
      author: 'CISO Governance Team',
      validFrom: '2026-03-01',
      confidence: 0.96
    },
    claimB: {
      statement: 'Customer query telemetry and raw session logs are purged after 90 days unless Enterprise Archival is enabled.',
      sourceDoc: 'Platform_Operations_SOP_v2.1.docx',
      author: 'Platform SRE Team',
      validFrom: '2025-11-14',
      confidence: 0.89
    },
    contradictionScore: 0.94,
    severity: 'High',
    status: 'unresolved',
    detectedAt: '2026-11-19 22:15 IST',
    aiReasoning:
      'Temporal overlap detected on predicate [RETENTION_PERIOD] for entity [Enterprise Data Retention Policy]. Claim A (2026-03-01) supersedes Claim B (2025-11-14) by 107 days with higher extraction confidence (0.96 vs 0.89).'
  },
  {
    id: 'CONF-102',
    entity: 'RBI Repo Rate Benchmark',
    entityType: 'METRIC',
    topic: 'Q3 FY26 Monetary Policy Benchmark Rate',
    claimA: {
      statement: 'The Monetary Policy Committee maintained the policy repo rate at 6.50% with a neutral stance.',
      sourceDoc: 'RBI_MPC_Statement_Q2.pdf',
      author: 'Reserve Bank Bulletin',
      validFrom: '2026-08-08',
      confidence: 0.98
    },
    claimB: {
      statement: 'The policy repo rate was adjusted by 25 bps to 6.25% following easing inflation projections.',
      sourceDoc: 'Macro_Desk_Flash_Brief_Nov2026.md',
      author: 'Macro Research Desk',
      validFrom: '2026-11-04',
      confidence: 0.93
    },
    contradictionScore: 0.91,
    severity: 'High',
    status: 'unresolved',
    detectedAt: '2026-11-19 20:40 IST',
    aiReasoning:
      'Numeric value conflict (6.50% vs 6.25%) on [RBI Repo Rate Benchmark]. Both edges currently have valid_to = NULL. Marking Claim B as authoritative will close Claim A with valid_to = 2026-11-04.'
  },
  {
    id: 'CONF-103',
    entity: 'CopilotSDK Rate Limit Tier (Growth)',
    entityType: 'POLICY',
    topic: 'Per-Minute Request Quota for Growth Plan',
    claimA: {
      statement: 'Growth tier tenants are allocated 500 requests/minute via the Redis sliding-window limiter.',
      sourceDoc: 'KnowledgeOS_Master_Implementation_Plan.md',
      author: 'Core Architecture',
      validFrom: '2026-05-18',
      confidence: 0.97
    },
    claimB: {
      statement: 'Growth tier API keys default to 300 RPM burst capacity on shared edge endpoints.',
      sourceDoc: 'Billing_Tier_Matrix_Draft.xlsx',
      author: 'Product Ops',
      validFrom: '2026-04-10',
      confidence: 0.82
    },
    contradictionScore: 0.84,
    severity: 'Medium',
    status: 'unresolved',
    detectedAt: '2026-11-19 18:12 IST',
    aiReasoning:
      'Parameter mismatch on [RATE_LIMIT_RPM] for [Growth Tier] (500 RPM vs 300 RPM). Master Implementation Plan carries higher authority weight.'
  },
  {
    id: 'CONF-104',
    entity: 'Vector Embedding Dimensionality',
    entityType: 'METRIC',
    topic: 'Default PGVector HNSW Index Dimension',
    claimA: {
      statement: 'AlloyDB PGVector tables use 1536-dimensional embeddings via gemini-embedding-001.',
      sourceDoc: 'AlloyDB_Deployment_Spec.md',
      author: 'Infra Team',
      validFrom: '2026-11-19',
      confidence: 0.99
    },
    claimB: {
      statement: 'Bedrock Titan Embed Text v2 outputs 1024-dimensional vectors for local NanoVectorDB storage.',
      sourceDoc: 'Legacy_Bedrock_Config.md',
      author: 'DevOps',
      validFrom: '2026-05-01',
      confidence: 0.91
    },
    contradictionScore: 0.76,
    severity: 'Low',
    status: 'keep_both',
    detectedAt: '2026-11-18 14:30 IST',
    aiReasoning:
      'Environment-scoped difference: 1536d applies to Gemini + AlloyDB profile while 1024d applies to legacy AWS Bedrock profile.'
  }
]

const INITIAL_PIPELINES: StreamPipeline[] = [
  {
    id: 'STR-01',
    name: 'Regulatory & Policy RSS Stream',
    sourceType: 'RSS/Atom',
    endpoint: 'https://rbi.org.in/feeds/press-releases.xml',
    status: 'active',
    latencyMs: 420,
    cacheHitRate: 94.2,
    successRate: 99.8,
    docsIngested: 1420,
    chunksGenerated: 18450,
    modelConfidence: 0.96,
    lastSync: '2 mins ago',
    schedule: 'Every 5m (Prefect)'
  },
  {
    id: 'STR-02',
    name: 'Enterprise GitHub Docs Webhook',
    sourceType: 'GitHub',
    endpoint: 'webhook://github.com/gureks/KnowledgeOS/docs',
    status: 'active',
    latencyMs: 310,
    cacheHitRate: 96.8,
    successRate: 100.0,
    docsIngested: 342,
    chunksGenerated: 4890,
    modelConfidence: 0.98,
    lastSync: 'Just now',
    schedule: 'Real-time Push'
  },
  {
    id: 'STR-03',
    name: 'Kafka Market Signals Topic',
    sourceType: 'Kafka',
    endpoint: 'kafka://pkc-cluster.ap-south-1.aws:9092/intel-events',
    status: 'active',
    latencyMs: 185,
    cacheHitRate: 91.5,
    successRate: 99.4,
    docsIngested: 8930,
    chunksGenerated: 42100,
    modelConfidence: 0.93,
    lastSync: '14 secs ago',
    schedule: 'Continuous Stream'
  },
  {
    id: 'STR-04',
    name: 'Confluence Engineering Wiki Sync',
    sourceType: 'Confluence',
    endpoint: 'https://uncode.atlassian.net/wiki/rest/api/content',
    status: 'paused',
    latencyMs: 640,
    cacheHitRate: 88.4,
    successRate: 97.9,
    docsIngested: 615,
    chunksGenerated: 9120,
    modelConfidence: 0.91,
    lastSync: '3 hours ago',
    schedule: 'Hourly Cron'
  },
  {
    id: 'STR-05',
    name: 'S3 Compliance Archive Bucket',
    sourceType: 'S3 Bucket',
    endpoint: 's3://uncode-enterprise-vault-ap-south-1/filings/',
    status: 'active',
    latencyMs: 530,
    cacheHitRate: 95.1,
    successRate: 99.6,
    docsIngested: 2180,
    chunksGenerated: 31400,
    modelConfidence: 0.95,
    lastSync: '11 mins ago',
    schedule: 'Every 15m'
  }
]

const INITIAL_AGENTS: PersonaAgent[] = [
  {
    id: 'AGT-01',
    name: 'Uncode Enterprise Analyst',
    role: 'Default Hybrid Graph + Vector Synthesis',
    expression: 'CopilotSDK',
    retrievalMode: 'hybrid',
    systemPrompt:
      'You are Uncode Enterprise Analyst. Synthesize answers strictly from the verified knowledge graph and vector chunks. Always cite primary source documents and highlight any temporal changes or policy supersessions.',
    corpus: 'Uncode Core Fabric (space1)',
    status: 'Active',
    queriesHandled: 5420,
    avgConfidence: 0.95
  },
  {
    id: 'AGT-02',
    name: 'Compliance & Audit Verifier',
    role: 'Strict Contradiction & Policy Auditor',
    expression: 'IntelLayer',
    retrievalMode: 'mix',
    systemPrompt:
      'Act as a regulatory and compliance auditor. Prioritize authoritative documents with the latest valid_from timestamp. Flag any ambiguity or conflicting claims across documents.',
    corpus: 'Financial & Regulatory Intel',
    status: 'Active',
    queriesHandled: 1890,
    avgConfidence: 0.97
  },
  {
    id: 'AGT-03',
    name: 'Executive Brief Narrator',
    role: 'Concise Decision Summary Voice',
    expression: 'PersonaCast',
    retrievalMode: 'global',
    systemPrompt:
      'Deliver concise executive briefings with 3 key takeaways, strategic implications, and high-level entity relationships.',
    corpus: 'Uncode Core Fabric (space1)',
    status: 'Active',
    queriesHandled: 1110,
    avgConfidence: 0.93
  },
  {
    id: 'AGT-04',
    name: 'SOP Onboarding Coach',
    role: 'Interactive Step-by-Step Guide',
    expression: 'LearnOS',
    retrievalMode: 'local',
    systemPrompt:
      'Guide team members through standard operating procedures step-by-step, verifying prerequisite concepts from the knowledge graph.',
    corpus: 'Enterprise SOP & Policy Hub',
    status: 'Draft',
    queriesHandled: 340,
    avgConfidence: 0.92
  }
]

const INITIAL_MEMBERS: WorkspaceMember[] = [
  {
    id: 'USR-01',
    name: 'Gurek Singh',
    email: 'gurek@uncode.ai',
    role: 'Admin',
    department: 'Platform Architecture',
    status: 'Active',
    lastActive: 'Online now',
    permissions: ['Full Graph CRUD', 'Conflict Resolution', 'StreamOS Admin', 'RBAC & API Keys']
  },
  {
    id: 'USR-02',
    name: 'Ananya Sharma',
    email: 'ananya@uncode.ai',
    role: 'Reviewer',
    department: 'Risk & Compliance',
    status: 'Active',
    lastActive: '18 mins ago',
    permissions: ['Conflict Resolution', 'Document Upload', 'Query & Audit Export']
  },
  {
    id: 'USR-03',
    name: 'Rohan Mehta',
    email: 'rohan@uncode.ai',
    role: 'Editor',
    department: 'Data Engineering',
    status: 'Active',
    lastActive: '1 hour ago',
    permissions: ['StreamOS Pipelines', 'Document Upload', 'Ontology Tuning']
  },
  {
    id: 'USR-04',
    name: 'Priya Nair',
    email: 'priya@uncode.ai',
    role: 'Viewer',
    department: 'Product Strategy',
    status: 'Invited',
    lastActive: 'Pending invite',
    permissions: ['Chat & Search', 'Graph Read-Only']
  }
]

const INITIAL_ONTOLOGY: OntologyEntityType[] = [
  {
    id: 'ONT-1',
    code: 'ORG',
    label: 'Organization / Institution',
    description: 'Companies, regulatory bodies, teams, and third-party vendors.',
    extractedCount: 1840,
    avgConfidence: 0.97,
    temporalTracking: true
  },
  {
    id: 'ONT-2',
    code: 'POLICY',
    label: 'Policy / Regulation / SOP',
    description: 'Compliance rules, SLAs, internal procedures, and statutory mandates.',
    extractedCount: 1290,
    avgConfidence: 0.95,
    temporalTracking: true
  },
  {
    id: 'ONT-3',
    code: 'METRIC',
    label: 'Financial / Operational Metric',
    description: 'Benchmarks, latencies, quotas, pricing tiers, and KPIs.',
    extractedCount: 1620,
    avgConfidence: 0.94,
    temporalTracking: true
  },
  {
    id: 'ONT-4',
    code: 'CONCEPT',
    label: 'Technical / Domain Concept',
    description: 'Architectural components, algorithms, and product capabilities.',
    extractedCount: 1510,
    avgConfidence: 0.92,
    temporalTracking: false
  },
  {
    id: 'ONT-5',
    code: 'PERSON',
    label: 'Person / Author / Stakeholder',
    description: 'Key decision makers, document authors, and domain owners.',
    extractedCount: 680,
    avgConfidence: 0.96,
    temporalTracking: false
  },
  {
    id: 'ONT-6',
    code: 'EVENT',
    label: 'Milestone / Release / Filing Event',
    description: 'Time-anchored releases, audits, incidents, and announcements.',
    extractedCount: 481,
    avgConfidence: 0.93,
    temporalTracking: true
  }
]

export const DEFAULT_CITATIONS: CitationSourceItem[] = [
  {
    id: 'CIT-1',
    title: 'KnowledgeOS — Master Implementation Plan.md',
    docId: 'doc-master-plan-01',
    excerpt:
      'GraphCore is the structural intelligence layer that all five KnowledgeOS products query. It combines dense vector search in AlloyDB PGVector with temporal entity-relationship traversal.',
    confidence: 0.96,
    updatedAt: '2026-11-19',
    entities: ['GraphCore', 'StreamOS', 'CopilotSDK', 'AlloyDB PGVector'],
    relations: [
      { from: 'StreamOS', type: 'FEEDS_INCREMENTAL_UPDATES', to: 'GraphCore' },
      { from: 'GraphCore', type: 'POWERS_HYBRID_QUERY', to: 'CopilotSDK' },
      { from: 'GraphCore', type: 'STORES_VECTORS_IN', to: 'AlloyDB PGVector' }
    ]
  },
  {
    id: 'CIT-2',
    title: 'GraphCore — Schema & Temporal Versioning Spec.md',
    docId: 'doc-graphcore-spec-02',
    excerpt:
      'Every relationship edge carries tenant_id, valid_from, valid_to, source_doc_id, author, and extraction confidence (0.0–1.0) to support point-in-time traversal and contradiction detection.',
    confidence: 0.94,
    updatedAt: '2026-11-19',
    entities: ['GraphCore', 'Temporal Versioning', 'Conflict Engine', 'Tenant Isolation'],
    relations: [
      { from: 'GraphCore', type: 'ENFORCES', to: 'Tenant Isolation' },
      { from: 'Temporal Versioning', type: 'DETECTS', to: 'Conflict Engine' }
    ]
  },
  {
    id: 'CIT-3',
    title: 'StreamOS — Live Connector & Signal Pipeline.md',
    docId: 'doc-streamos-spec-03',
    excerpt:
      'StreamOS normalizes RSS, Webhook, and Kafka feeds with pre-ingest SHA-256 deduplication and achieves <60s publish-to-query latency.',
    confidence: 0.92,
    updatedAt: '2026-11-18',
    entities: ['StreamOS', 'SHA-256 Dedup', 'Prefect Workflows', 'Signal Engine'],
    relations: [
      { from: 'StreamOS', type: 'EXECUTES', to: 'SHA-256 Dedup' },
      { from: 'Prefect Workflows', type: 'ORCHESTRATES', to: 'Signal Engine' }
    ]
  }
]

export const useKosPlatformStore = create<KosPlatformState>((set) => ({
  workspaces: INITIAL_WORKSPACES,
  activeWorkspaceId: 'space1',
  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  conflicts: INITIAL_CONFLICTS,
  resolveConflict: (id, resolution) =>
    set((state) => ({
      conflicts: state.conflicts.map((item) =>
        item.id === id ? { ...item, status: resolution } : item
      )
    })),

  pipelines: INITIAL_PIPELINES,
  togglePipelineStatus: (id) =>
    set((state) => ({
      pipelines: state.pipelines.map((p) =>
        p.id === id
          ? { ...p, status: p.status === 'active' ? 'paused' : 'active', lastSync: 'Just now' }
          : p
      )
    })),
  addPipeline: (pipeline) =>
    set((state) => ({
      pipelines: [
        {
          ...pipeline,
          id: `STR-0${state.pipelines.length + 1}`,
          docsIngested: 0,
          chunksGenerated: 0,
          lastSync: 'Initialized just now'
        },
        ...state.pipelines
      ]
    })),

  agents: INITIAL_AGENTS,
  activePersonaId: 'AGT-01',
  setActivePersonaId: (id) => set({ activePersonaId: id }),
  updateAgentPrompt: (id, systemPrompt, retrievalMode) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, systemPrompt, retrievalMode } : a
      )
    })),

  members: INITIAL_MEMBERS,
  inviteMember: (name, email, role, department) =>
    set((state) => ({
      members: [
        ...state.members,
        {
          id: `USR-0${state.members.length + 1}`,
          name,
          email,
          role,
          department,
          status: 'Invited',
          lastActive: 'Invited just now',
          permissions:
            role === 'Admin'
              ? ['Full Graph CRUD', 'Conflict Resolution', 'StreamOS Admin', 'RBAC & API Keys']
              : role === 'Editor'
                ? ['StreamOS Pipelines', 'Document Upload', 'Ontology Tuning']
                : role === 'Reviewer'
                  ? ['Conflict Resolution', 'Document Upload', 'Query & Audit Export']
                  : ['Chat & Search', 'Graph Read-Only']
        }
      ]
    })),
  updateMemberRole: (id, role) =>
    set((state) => ({
      members: state.members.map((m) => (m.id === id ? { ...m, role } : m))
    })),

  ontologyTypes: INITIAL_ONTOLOGY,
  toggleOntologyTemporal: (id) =>
    set((state) => ({
      ontologyTypes: state.ontologyTypes.map((o) =>
        o.id === id ? { ...o, temporalTracking: !o.temporalTracking } : o
      )
    }))
}))
