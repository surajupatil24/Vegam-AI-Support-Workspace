import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  LuCheck,
  LuChevronRight,
  LuCopy,
  LuLogOut,
  LuRefreshCw,
  LuSearch,
  LuSparkles,
} from 'react-icons/lu'

import apiClient from '@/lib/api'
import { formatStableDateTime } from '@/lib/datetime'
import { useAuthStore } from '@/lib/store'

type TicketTracker = string
type TicketPriorityTone = 'critical' | 'high' | 'medium'
type StepStatus = 'done' | 'running' | 'waiting'
type SourceMode = 'saved' | 'live' | 'mixed'

interface TicketComment {
  id: string
  author: string
  badge: string
  content: string
  timestamp: string
}

interface WorkspaceFile {
  id: string
  name: string
  size: string
  kind: 'attachment' | 'log'
}

interface SimilarTicket {
  id: string
  title: string
  similarity: number
}

interface InvestigationStep {
  id: string
  label: string
  status: StepStatus
}

interface InvestigationCard {
  id: string
  title: string
  description: string
  status: StepStatus
}

interface InvestigationReport {
  issueSummary: string
  possibleRootCause: string
  recommendedInvestigation: string[]
  recommendedFix: string[]
  codeReferences: string[]
  clientReply: string
  redmineComment: string
  closureNotes: string
}

interface InvestigationTicket {
  id: string
  number: string
  title: string
  tracker: TicketTracker
  priorityLabel: string
  priorityTone: TicketPriorityTone
  project: string
  module: string
  statusLabel: string
  assignedTo: string
  createdAt: string
  updatedAt: string
  description: string
  comments: TicketComment[]
  attachments: WorkspaceFile[]
  logs: WorkspaceFile[]
  similarTickets: SimilarTicket[]
  keyInsights: string[]
  relatedModules: string[]
  steps: InvestigationStep[]
  investigationCards: InvestigationCard[]
  report: InvestigationReport
}

interface AssignedTicketResponse {
  id: number
  redmine_id: number
  subject: string
  tracker: string
  priority: string
  status: string
  module: string
  description: string
  created_at: string
  updated_at: string
}

interface TicketDetailCommentResponse {
  id: number | string
  author: string
  content: string
  created_at: string
}

interface TicketDetailResponse extends AssignedTicketResponse {
  comments?: TicketDetailCommentResponse[]
}

interface InvestigationWorkspaceProps {
  initialTicketId?: string
  demoMode?: boolean
}

const DEFAULT_TICKET_ID = '90857'

function buildSteps(stage: 'analysis' | 'verification'): InvestigationStep[] {
  if (stage === 'verification') {
    return [
      { id: 's1', label: 'Read Ticket', status: 'done' },
      { id: 's2', label: 'Search Similar', status: 'done' },
      { id: 's3', label: 'Code Analysis', status: 'done' },
      { id: 's4', label: 'AI Analysis', status: 'done' },
      { id: 's5', label: 'Claude Analysis', status: 'running' },
      { id: 's6', label: 'Final Report', status: 'waiting' },
    ]
  }

  return [
    { id: 's1', label: 'Read Ticket', status: 'done' },
    { id: 's2', label: 'Search Similar', status: 'done' },
    { id: 's3', label: 'Code Analysis', status: 'done' },
    { id: 's4', label: 'AI Analysis', status: 'running' },
    { id: 's5', label: 'Claude Analysis', status: 'waiting' },
    { id: 's6', label: 'Final Report', status: 'waiting' },
  ]
}

function buildCards(stage: 'analysis' | 'verification'): InvestigationCard[] {
  return [
    {
      id: 'c1',
      title: 'Similar Tickets',
      description: 'Historical BASF incidents have been matched and ranked by relevance.',
      status: 'done',
    },
    {
      id: 'c2',
      title: 'Code Analysis',
      description: 'Authentication, session, and mobile shell paths have been reviewed for regressions.',
      status: 'done',
    },
    {
      id: 'c3',
      title: 'AI Analysis',
      description: 'ChatGPT is synthesizing comments, logs, and linked evidence into a root-cause proposal.',
      status: stage === 'analysis' ? 'running' : 'done',
    },
    {
      id: 'c4',
      title: 'Claude Analysis',
      description: 'Secondary verification is cross-checking the investigation and proposed fix.',
      status: stage === 'verification' ? 'running' : 'waiting',
    },
    {
      id: 'c5',
      title: 'Final Report',
      description: 'Client-ready and Redmine-ready responses are prepared from the investigation output.',
      status: 'waiting',
    },
  ]
}

const SAVED_TICKETS: InvestigationTicket[] = [
  {
    id: '90857',
    number: '#90857',
    title: 'Users experiencing crashes when logging in through mobile app',
    tracker: 'Bug',
    priorityLabel: 'Critical',
    priorityTone: 'critical',
    project: 'BASF Digital - Berlin',
    module: 'Mobile Application',
    statusLabel: 'Investigation in Progress',
    assignedTo: 'Support Engineer',
    createdAt: '2026-08-09T10:15:00',
    updatedAt: '2026-08-09T10:32:00',
    description:
      'Users are experiencing crashes when logging in through the mobile app immediately after entering credentials. Reproduced on iOS 16.5 and Android 13 using production accounts.',
    comments: [
      {
        id: '90857-comment-1',
        author: 'Engineer John',
        badge: 'Internal',
        content: 'Confirmed issue on iOS 16.5. Crash occurs after credential submit and before dashboard render.',
        timestamp: '2026-08-09T10:20:00',
      },
      {
        id: '90857-comment-2',
        author: 'QA Team',
        badge: 'Internal',
        content: 'Reproducible on Android as well. Session token expires before app state hydrates.',
        timestamp: '2026-08-09T10:25:00',
      },
    ],
    attachments: [
      { id: '90857-a1', name: 'error_log.txt', size: '12 KB', kind: 'attachment' },
      { id: '90857-a2', name: 'screenshot_1.png', size: '245 KB', kind: 'attachment' },
    ],
    logs: [
      { id: '90857-l1', name: 'crash_report.log', size: '18 KB', kind: 'log' },
      { id: '90857-l2', name: 'session_trace.txt', size: '6 KB', kind: 'log' },
    ],
    similarTickets: [
      { id: '#0010', title: 'Login crash on iOS 15.6', similarity: 92 },
      { id: '#0012', title: 'Android app crash after login', similarity: 88 },
      { id: '#1936', title: 'Crash on credential submit', similarity: 85 },
    ],
    keyInsights: [
      'Most similar ticket: #0010 with 92% similarity.',
      'Issue reproduces on both iOS and Android devices.',
      'Symptoms point to token validation before home screen render.',
    ],
    relatedModules: ['Authentication', 'Mobile App', 'Session', 'Crash Handling'],
    steps: buildSteps('analysis'),
    investigationCards: buildCards('analysis'),
    report: {
      issueSummary:
        'Customer users crash during mobile login because the app receives a valid response but fails to persist a fresh session token before dashboard bootstrapping.',
      possibleRootCause:
        'A timezone offset regression in the authentication and session flow marks newly issued tokens as expired. The mobile shell then crashes while retrying a protected request during hydration.',
      recommendedInvestigation: [
        'Replay the login flow with production-like timezone offsets and device clocks.',
        'Validate session bootstrap order in the mobile shell after authentication success.',
        'Compare token parsing between the current release and the last known good build.',
      ],
      recommendedFix: [
        'Normalize auth expiry timestamps to UTC before session validation.',
        'Guard protected-route hydration until token persistence completes.',
        'Add regression coverage for mobile login on iOS 16 and Android 13.',
      ],
      codeReferences: [
        'AuthenticationService.ts:88 - login response normalization',
        'SessionService.ts:142 - expiry offset calculation',
        'MobileShell.tsx:61 - protected route hydration',
      ],
      clientReply:
        'Hi Team,\n\nWe are actively investigating the reported login crash in the mobile application. Our current analysis indicates the issue is related to session handling immediately after authentication. We are validating the fix path now and will share a confirmed update shortly.\n\nRegards,\nSamixa Support',
      redmineComment:
        'AI investigation suggests a probable authentication and session regression. Similar incidents point to token expiry parsing during mobile login bootstrap. Engineering validation is in progress and a remediation plan is being prepared.',
      closureNotes:
        'Resolved by correcting session token expiry normalization and delaying protected-route hydration until auth persistence completes. Regression tests were added for iOS and Android login flows.',
    },
  },
  {
    id: '90867',
    number: '#90867',
    title: 'App login failure on Android 13 devices',
    tracker: 'SR',
    priorityLabel: 'High',
    priorityTone: 'high',
    project: 'BASF BCG - Ludwigshafen',
    module: 'Authentication Gateway',
    statusLabel: 'Claude Verification Running',
    assignedTo: 'Support Engineer',
    createdAt: '2026-08-09T11:05:00',
    updatedAt: '2026-08-09T11:48:00',
    description:
      'Android 13 users receive a login failure banner after entering valid credentials. The request returns 200, but the device remains unauthenticated until the app restarts.',
    comments: [
      {
        id: '90867-comment-1',
        author: 'Field Support',
        badge: 'Internal',
        content: 'Customer confirmed issue only on Android 13 and newer. Android 12 is unaffected.',
        timestamp: '2026-08-09T11:12:00',
      },
      {
        id: '90867-comment-2',
        author: 'Release Manager',
        badge: 'Internal',
        content: 'Behavior started after the last auth gateway rollout.',
        timestamp: '2026-08-09T11:20:00',
      },
    ],
    attachments: [
      { id: '90867-a1', name: 'android_network_trace.txt', size: '16 KB', kind: 'attachment' },
      { id: '90867-a2', name: 'customer_screen.mp4', size: '3.2 MB', kind: 'attachment' },
    ],
    logs: [
      { id: '90867-l1', name: 'gateway_trace.log', size: '22 KB', kind: 'log' },
      { id: '90867-l2', name: 'auth_retry.log', size: '9 KB', kind: 'log' },
    ],
    similarTickets: [
      { id: '#1124', title: 'Android token refresh loop', similarity: 90 },
      { id: '#1278', title: 'Gateway response accepted, session missing', similarity: 84 },
      { id: '#1936', title: 'Crash on credential submit', similarity: 80 },
    ],
    keyInsights: [
      'Most similar ticket: #1124 with 90% similarity.',
      'Issue affects Android 13 and newer devices only.',
      'The failure started after the last auth gateway rollout.',
    ],
    relatedModules: ['Android Client', 'Auth Gateway', 'Refresh Token', 'Session Cache'],
    steps: buildSteps('verification'),
    investigationCards: buildCards('verification'),
    report: {
      issueSummary:
        'Android 13 devices accept login responses but do not persist the authenticated session until the app relaunches.',
      possibleRootCause:
        'A race condition between token refresh hydration and Android-specific secure storage writes likely leaves the session cache empty on first login.',
      recommendedInvestigation: [
        'Capture storage-write timing on Android 13 with debug instrumentation.',
        'Compare refresh callback ordering between Android 12 and Android 13.',
        'Validate whether gateway retries mask the first successful login response.',
      ],
      recommendedFix: [
        'Serialize secure storage and in-memory session updates on login success.',
        'Delay success-state UI changes until session persistence completes.',
        'Add Android 13 regression coverage for login and app restart flows.',
      ],
      codeReferences: [
        'GatewayAuthClient.kt:134 - refresh response handling',
        'SecureSessionStore.kt:59 - persisted session write order',
        'AndroidLoginViewModel.kt:91 - optimistic auth state update',
      ],
      clientReply:
        'Hi Team,\n\nWe have isolated the Android 13 login issue to a post-authentication session persistence problem. The API is accepting the credentials, but the device session is not being finalized reliably on first login. We are validating the remediation and will update you with timing shortly.\n\nRegards,\nSamixa Support',
      redmineComment:
        'Verification indicates an Android-specific session persistence race after auth gateway success. Claude cross-check is validating the proposed fix before implementation.',
      closureNotes:
        'Resolved by serializing secure storage writes and delaying the login success transition until session persistence completes on Android 13 devices.',
    },
  },
]

function getSavedTicket(ticketId: string): InvestigationTicket | undefined {
  return SAVED_TICKETS.find((ticket) => ticket.id === ticketId)
}

function normalizeTracker(value: string): TicketTracker {
  if (/service request/i.test(value)) {
    return 'SR'
  }

  return value || 'Bug'
}

function getPriorityTone(priority: string): TicketPriorityTone {
  if (/critical|urgent/i.test(priority)) {
    return 'critical'
  }

  if (/high/i.test(priority)) {
    return 'high'
  }

  return 'medium'
}

function createGenericTicket(summary: AssignedTicketResponse, assignee: string): InvestigationTicket {
  return {
    id: String(summary.redmine_id),
    number: `#${summary.redmine_id}`,
    title: summary.subject,
    tracker: normalizeTracker(summary.tracker),
    priorityLabel: summary.priority || 'Normal',
    priorityTone: getPriorityTone(summary.priority || 'Normal'),
    project: summary.module || 'Allowed Project',
    module: summary.module || 'Unspecified Module',
    statusLabel: summary.status || 'Open',
    assignedTo: assignee || 'Support Engineer',
    createdAt: summary.created_at || '',
    updatedAt: summary.updated_at || '',
    description: summary.description || 'No Redmine description is available for this ticket yet.',
    comments: [],
    attachments: [],
    logs: [],
    similarTickets: [],
    keyInsights: [
      `Current status: ${summary.status || 'Unknown'}`,
      `Priority: ${summary.priority || 'Unknown'}`,
      'Live ticket data loaded without saved investigation history.',
    ],
    relatedModules: [summary.module || 'Assigned Module'],
    steps: buildSteps('analysis'),
    investigationCards: buildCards('analysis'),
    report: {
      issueSummary: summary.subject,
      possibleRootCause:
        'Live ticket details are available, but this case does not yet have saved AI investigation notes in the workspace.',
      recommendedInvestigation: [
        'Review the latest Redmine comments and reproduction steps.',
        'Check recent changes in the affected module.',
        'Attach any additional screenshots, logs, or traces needed for analysis.',
      ],
      recommendedFix: [
        'Validate the exact failure path with the assigned engineer.',
        'Document the confirmed root cause and remediation in Redmine.',
      ],
      codeReferences: ['No code references have been linked to this ticket yet.'],
      clientReply:
        'Hi Team,\n\nWe have started the investigation and are collecting the latest technical evidence for this issue. We will share the confirmed findings and next steps as soon as validation is complete.\n\nRegards,\nSamixa Support',
      redmineComment:
        'Initial workspace restored. Live ticket data is available, and the investigation is ready for engineering review.',
      closureNotes:
        'Document the final root cause, tested fix, and validation notes here once the ticket is resolved.',
    },
  }
}

function mergeAssignedTicket(summary: AssignedTicketResponse, assignee: string): InvestigationTicket {
  return createGenericTicket(summary, assignee)
}

function mergeTicketDetail(ticket: InvestigationTicket, detail: TicketDetailResponse): InvestigationTicket {
  return {
    ...ticket,
    title: detail.subject || ticket.title,
    tracker: normalizeTracker(detail.tracker || ticket.tracker),
    priorityLabel: detail.priority || ticket.priorityLabel,
    priorityTone: getPriorityTone(detail.priority || ticket.priorityLabel),
    project: detail.module || ticket.project,
    module: detail.module || ticket.module,
    statusLabel: detail.status || ticket.statusLabel,
    description: detail.description || ticket.description,
    createdAt: detail.created_at || ticket.createdAt,
    updatedAt: detail.updated_at || ticket.updatedAt,
    comments:
      detail.comments?.map((comment) => ({
        id: String(comment.id),
        author: comment.author || 'Redmine User',
        badge: 'Redmine',
        content: comment.content || 'No comment content provided.',
        timestamp: comment.created_at || '',
      })) || ticket.comments,
  }
}

function priorityToneClass(tone: TicketPriorityTone): string {
  if (tone === 'critical') {
    return 'border-red-500/40 bg-red-500/10 text-red-200'
  }

  if (tone === 'high') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-200'
  }

  return 'border-slate-700 bg-slate-800 text-slate-200'
}

function stepDotClass(status: StepStatus): string {
  if (status === 'done') {
    return 'border-emerald-400 bg-emerald-400'
  }

  if (status === 'running') {
    return 'border-blue-400 bg-slate-950 ring-4 ring-blue-500/20'
  }

  return 'border-slate-600 bg-slate-900'
}

function stepTextClass(status: StepStatus): string {
  if (status === 'done') {
    return 'text-emerald-200'
  }

  if (status === 'running') {
    return 'text-blue-200'
  }

  return 'text-slate-400'
}

function cardStatusChip(status: StepStatus): string {
  if (status === 'done') {
    return 'bg-emerald-500/10 text-emerald-200'
  }

  if (status === 'running') {
    return 'bg-blue-500/10 text-blue-200'
  }

  return 'bg-slate-800 text-slate-300'
}

function sourceMessage(mode: SourceMode): string {
  if (mode === 'live') {
    return 'Live Redmine data loaded successfully.'
  }

  if (mode === 'mixed') {
    return 'Live Redmine ticket data loaded successfully.'
  }

  return 'Demo workspace loaded.'
}

function CopyBlock(props: {
  title: string
  value: string
  copyKey: string
  copiedKey: string | null
  onCopy: (key: string, value: string) => void
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">{props.title}</h4>
        <button
          onClick={() => props.onCopy(props.copyKey, props.value)}
          className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
        >
          <LuCopy className="h-3.5 w-3.5" />
          {props.copiedKey === props.copyKey ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-slate-100">{props.value}</pre>
    </div>
  )
}

export default function InvestigationWorkspace({
  initialTicketId = DEFAULT_TICKET_ID,
  demoMode = false,
}: InvestigationWorkspaceProps) {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const logout = useAuthStore((state) => state.logout)

  const routeTicketId = Array.isArray(router.query.ticketId) ? router.query.ticketId[0] : router.query.ticketId
  const activeTicketId = routeTicketId || initialTicketId

  const [tickets, setTickets] = useState<InvestigationTicket[]>(demoMode ? SAVED_TICKETS : [])
  const [selectedTicketId, setSelectedTicketId] = useState<string>(activeTicketId)
  const [sourceMode, setSourceMode] = useState<SourceMode>(demoMode ? 'saved' : 'live')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    setSelectedTicketId(activeTicketId)
  }, [activeTicketId])

  useEffect(() => {
    let isCancelled = false

    async function loadWorkspace() {
      setLoading(true)
      setLoadError('')

      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null

      if (demoMode) {
        if (!isCancelled) {
          const demoTicket = getSavedTicket(activeTicketId) || SAVED_TICKETS[0]
          setTickets(SAVED_TICKETS)
          setSelectedTicketId(demoTicket.id)
          setSourceMode('saved')
          setLoading(false)
        }
        return
      }

      if (!token) {
        if (!isCancelled) {
          setTickets([])
          setSelectedTicketId('')
          setSourceMode('live')
          setLoadError('Please log in with your Redmine account to view assigned tickets.')
          setLoading(false)
          void router.replace('/login')
        }
        return
      }

      try {
        let assigneeName = user?.full_name || ''

        if (!assigneeName) {
          try {
            const meResponse = await apiClient.get('/auth/me')
            assigneeName = meResponse.data.full_name || ''
            if (!isCancelled) {
              setUser(meResponse.data)
            }
          } catch {
            assigneeName = user?.full_name || ''
          }
        }

        const [assignedResult, detailResult] = await Promise.allSettled([
          apiClient.get('/tickets/assigned'),
          apiClient.get(`/tickets/${activeTicketId}`),
        ])

        if (isCancelled) {
          return
        }

        const assignedTickets =
          assignedResult.status === 'fulfilled'
            ? ((assignedResult.value.data.tickets as AssignedTicketResponse[]) || []).map((ticket) =>
                mergeAssignedTicket(ticket, assigneeName)
              )
            : []

        let mergedTickets = assignedTickets
        let nextMode: SourceMode = 'live'

        if (detailResult.status === 'fulfilled') {
          const detail = detailResult.value.data as TicketDetailResponse
          const existing = mergedTickets.find((ticket) => ticket.id === String(detail.redmine_id))
          const base = existing || mergeAssignedTicket(detail, assigneeName)
          const detailedTicket = mergeTicketDetail(base, detail)

          mergedTickets = mergedTickets.some((ticket) => ticket.id === detailedTicket.id)
            ? mergedTickets.map((ticket) => (ticket.id === detailedTicket.id ? detailedTicket : ticket))
            : [detailedTicket, ...mergedTickets]
        }

        const resolvedTicketId =
          mergedTickets.find((ticket) => ticket.id === activeTicketId)?.id ||
          mergedTickets[0]?.id ||
          ''

        setTickets(mergedTickets)
        setSelectedTicketId(resolvedTicketId)
        setSourceMode(nextMode)

        if (resolvedTicketId && resolvedTicketId !== activeTicketId) {
          void router.replace(`/investigation/${resolvedTicketId}`)
        }

        if (mergedTickets.length === 0) {
          setLoadError('No assigned Redmine tickets matched the allowed projects, statuses, and tracker types for this user.')
        } else if (assignedResult.status === 'rejected' && detailResult.status === 'rejected') {
          setLoadError('Live Redmine data could not be loaded. Please refresh or log in again.')
        } else if (assignedResult.status === 'rejected' || detailResult.status === 'rejected') {
          setLoadError('Part of the live Redmine data could not be loaded. Some ticket details may be incomplete.')
        }
      } catch {
        if (!isCancelled) {
          setTickets([])
          setSelectedTicketId('')
          setSourceMode('live')
          setLoadError('Live Redmine data could not be loaded. Please refresh or log in again.')
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    void loadWorkspace()

    return () => {
      isCancelled = true
    }
  }, [activeTicketId, demoMode, reloadCount, router, setUser, user?.full_name])

  const selectedTicket = useMemo(() => {
    return tickets.find((ticket) => ticket.id === selectedTicketId) || tickets[0]
  }, [selectedTicketId, tickets])

  const handleTicketSelect = async (ticketId: string) => {
    setSelectedTicketId(ticketId)
    await router.push(`/investigation/${ticketId}`)
  }

  const handleRefresh = () => {
    setReloadCount((value) => value + 1)
  }

  const handleLogout = async () => {
    logout()
    await router.push('/login')
  }

  const handleCopy = async (key: string, value: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return
    }

    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current))
    }, 1500)
  }

  const displayAssignee = user?.full_name || user?.username || 'Support Engineer'

  if (!selectedTicket) {
    return (
      <>
        <Head>
          <title>Investigation Workspace</title>
        </Head>

        <div className="min-h-screen bg-slate-950 text-white">
          <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-6 py-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
                  <LuSparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-200">Vegam Support AI</p>
                  <h1 className="text-3xl font-semibold text-white">Investigation Workspace</h1>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-right">
                  <p className="text-sm font-medium text-white">{displayAssignee}</p>
                  <p className="text-xs text-slate-400">{demoMode ? 'Demo workspace' : 'Live workspace'}</p>
                </div>

                <button
                  onClick={handleRefresh}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-800"
                >
                  <LuRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100 transition hover:bg-red-500/20"
                >
                  <LuLogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-[1680px] px-6 py-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 px-6 py-10 text-center">
              <h2 className="text-2xl font-semibold text-white">
                {loading ? 'Loading your Redmine tickets...' : 'No matching Redmine tickets found'}
              </h2>
              <p className="mt-3 text-sm text-slate-400">
                {loadError || 'There are no assigned tickets matching the current project, status, and tracker filters.'}
              </p>
            </div>
          </main>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>{`${selectedTicket.number} | AI Investigation Workspace`}</title>
      </Head>

      <div className="min-h-screen bg-slate-950 text-white">
        <header className="border-b border-slate-800 bg-slate-950/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
                <LuSparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-200">Vegam Support AI</p>
                <h1 className="text-3xl font-semibold text-white">Investigation Workspace</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3 text-sm text-slate-300 lg:flex">
                <LuSearch className="h-4 w-4" />
                <span>Search</span>
                <span className="text-slate-500">|</span>
                <span>{displayAssignee}</span>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-right">
                <p className="text-sm font-medium text-white">{displayAssignee}</p>
                <p className="text-xs text-slate-400">{sourceMode === 'saved' ? 'Demo workspace' : 'Live workspace'}</p>
              </div>

              <button
                onClick={handleRefresh}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-800"
              >
                <LuRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100 transition hover:bg-red-500/20"
              >
                <LuLogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1680px] px-6 py-6">
          <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/80 px-5 py-4 text-sm text-slate-300">
            <div className="flex flex-wrap items-center gap-2 text-base text-white">
              <span>Ticket {selectedTicket.number}</span>
              <span className="text-slate-500">|</span>
              <span>{selectedTicket.priorityLabel}</span>
              <span className="text-slate-500">|</span>
              <span>{selectedTicket.project}</span>
              <span className="text-slate-500">|</span>
              <span>{selectedTicket.module}</span>
              <span className="text-slate-500">|</span>
              <span>{selectedTicket.statusLabel}</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">{loadError || sourceMessage(sourceMode)}</p>
          </div>

          <section className="mb-6 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4">
            <div className="flex min-w-max items-center gap-3">
              {tickets.map((ticket, index) => (
                <button
                  key={ticket.id}
                  onClick={() => void handleTicketSelect(ticket.id)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    ticket.id === selectedTicket.id
                      ? 'border-blue-500/50 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200">
                      T{index + 1}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityToneClass(ticket.priorityTone)}`}>
                      {ticket.number}
                    </span>
                  </div>
                  <p className="max-w-[220px] text-sm font-medium text-white">{ticket.title}</p>
                </button>
              ))}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
            <aside className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Ticket Details</h2>

              <div className="space-y-6 text-sm text-slate-300">
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-white">Description</h3>
                  <p className="leading-7 text-slate-200">{selectedTicket.description}</p>
                </div>

                <div>
                  <h3 className="mb-3 text-lg font-semibold text-white">Comments</h3>
                  <div className="space-y-3">
                    {selectedTicket.comments.map((comment) => (
                      <div key={comment.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-white">{comment.author}</p>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{comment.badge}</p>
                          </div>
                          <span className="text-xs text-slate-500">{formatStableDateTime(comment.timestamp)}</span>
                        </div>
                        <p className="leading-6 text-slate-300">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-lg font-semibold text-white">Attachments</h3>
                  <div className="space-y-2">
                    {selectedTicket.attachments.map((file) => (
                      <div key={file.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                        <p className="font-medium text-white">{file.name}</p>
                        <p className="text-xs text-slate-500">{file.size}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
              <h2 className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">AI Investigation</h2>

              <div className="mb-8 rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                <h3 className="mb-4 text-lg font-semibold text-white">Investigation Progress</h3>
                <div className="flex flex-wrap items-center gap-3">
                  {selectedTicket.steps.map((step, index) => (
                    <div key={step.id} className="flex items-center gap-3">
                      <div className={`h-3 w-3 rounded-full border ${stepDotClass(step.status)}`} />
                      <span className={`text-sm ${stepTextClass(step.status)}`}>{step.label}</span>
                      {index < selectedTicket.steps.length - 1 ? (
                        <LuChevronRight className="h-4 w-4 text-slate-600" />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-8">
                <h3 className="mb-4 text-lg font-semibold text-white">AI Investigation Workspace</h3>
                <div className="space-y-3">
                  {selectedTicket.investigationCards.map((card) => (
                    <div
                      key={card.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4"
                    >
                      <div>
                        <p className="font-medium text-white">{card.title}</p>
                        <p className="mt-1 text-sm text-slate-400">{card.description}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${cardStatusChip(card.status)}`}>
                        {card.status === 'done' ? 'Done' : card.status === 'running' ? 'Running' : 'Waiting'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Issue Summary</h4>
                  <p className="leading-7 text-slate-100">{selectedTicket.report.issueSummary}</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Possible Root Cause</h4>
                  <p className="leading-7 text-slate-100">{selectedTicket.report.possibleRootCause}</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Recommended Investigation</h4>
                  <ul className="space-y-2">
                    {selectedTicket.report.recommendedInvestigation.map((item) => (
                      <li key={item} className="flex gap-3 text-slate-100">
                        <span className="mt-2 h-2 w-2 rounded-full bg-blue-400" />
                        <span className="leading-6">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Recommended Fix</h4>
                  <ul className="space-y-2">
                    {selectedTicket.report.recommendedFix.map((item) => (
                      <li key={item} className="flex gap-3 text-slate-100">
                        <span className="mt-2 h-2 w-2 rounded-full bg-emerald-400" />
                        <span className="leading-6">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="lg:col-span-2">
                  <CopyBlock
                    title="Client Reply"
                    value={selectedTicket.report.clientReply}
                    copyKey="client-reply"
                    copiedKey={copiedKey}
                    onCopy={(key, value) => void handleCopy(key, value)}
                  />
                </div>

                <CopyBlock
                  title="Redmine Comment"
                  value={selectedTicket.report.redmineComment}
                  copyKey="redmine-comment"
                  copiedKey={copiedKey}
                  onCopy={(key, value) => void handleCopy(key, value)}
                />

                <CopyBlock
                  title="Closure Notes"
                  value={selectedTicket.report.closureNotes}
                  copyKey="closure-notes"
                  copiedKey={copiedKey}
                  onCopy={(key, value) => void handleCopy(key, value)}
                />
              </div>
            </section>

            <aside className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
              <h2 className="mb-6 text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Evidence</h2>

              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">AI Confidence</h3>
                    <span className="text-3xl font-semibold text-white">
                      {selectedTicket.priorityTone === 'critical' ? '78%' : '82%'}
                    </span>
                  </div>
                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400"
                      style={{ width: selectedTicket.priorityTone === 'critical' ? '78%' : '82%' }}
                    />
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-lg font-semibold text-white">Similar Tickets</h3>
                  <div className="space-y-3">
                    {selectedTicket.similarTickets.map((ticket) => (
                      <div key={ticket.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="font-medium text-white">{ticket.id}</p>
                          <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-200">
                            {ticket.similarity}% match
                          </span>
                        </div>
                        <p className="leading-6 text-slate-300">{ticket.title}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-lg font-semibold text-white">Key Insights</h3>
                  <div className="space-y-2">
                    {selectedTicket.keyInsights.map((insight) => (
                      <div key={insight} className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                        <LuCheck className="mt-0.5 h-4 w-4 text-cyan-300" />
                        <p className="leading-6 text-slate-200">{insight}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-lg font-semibold text-white">Related Modules</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedTicket.relatedModules.map((moduleName) => (
                      <span
                        key={moduleName}
                        className="rounded-full border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                      >
                        {moduleName}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-lg font-semibold text-white">Code References</h3>
                  <div className="space-y-2">
                    {selectedTicket.report.codeReferences.map((reference) => (
                      <div key={reference} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                        <p className="leading-6 text-slate-200">{reference}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-lg font-semibold text-white">Logs</h3>
                  <div className="space-y-2">
                    {selectedTicket.logs.map((file) => (
                      <div key={file.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                        <p className="font-medium text-white">{file.name}</p>
                        <p className="text-xs text-slate-500">{file.size}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </>
  )
}
