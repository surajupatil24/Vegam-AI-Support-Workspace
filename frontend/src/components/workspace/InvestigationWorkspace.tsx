import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import type { IconType } from 'react-icons'
import {
  LuArrowLeft,
  LuBell,
  LuBookOpen,
  LuBrain,
  LuCheck,
  LuChevronDown,
  LuClipboardList,
  LuClock3,
  LuCode2,
  LuCopy,
  LuDownload,
  LuExternalLink,
  LuFileText,
  LuHourglass,
  LuInfo,
  LuLayoutDashboard,
  LuLogOut,
  LuPaperclip,
  LuPencil,
  LuRefreshCw,
  LuSearch,
  LuSend,
  LuSettings,
  LuSparkles,
  LuTicket,
  LuUsers,
} from 'react-icons/lu'

import FeedbackDrawerContent from '@/components/workspace/FeedbackDrawerContent'
import InfoDrawerContent from '@/components/workspace/InfoDrawerContent'
import apiClient from '@/lib/api'
import { formatStableDateTime } from '@/lib/datetime'
import { useAuthStore } from '@/lib/store'

type TicketTracker = string
type TicketPriorityTone = 'critical' | 'high' | 'medium'
type StepStatus = 'done' | 'running' | 'pending' | 'waiting' | 'stale' | 'review' | 'optional'
type AgentRerunMode = 'selected-agent' | 'all-agents'
type SourceMode = 'saved' | 'live' | 'mixed'
type WorkspaceTabId = 'investigation' | 'report' | 'conversation' | 'timeline' | 'attachments' | 'history'
type MobilePaneId = 'ticket' | 'investigation' | 'evidence'
type MockStage = 'analysis' | 'verification' | 'waiting'
type InvestigationCardTone = 'purple' | 'blue' | 'green' | 'amber' | 'slate'
type InvestigationLane = 'auth' | 'label' | 'integration' | 'maintenance' | 'generic'
type InvestigationAgentId =
  | 'ticket-understanding'
  | 'historical-knowledge'
  | 'domain-knowledge'
  | 'code-intelligence'
  | 'database-investigation'
  | 'configuration-investigation'
  | 'ai-synthesis'
  | 'communication-planner'
  | 'learning-agent'
  | 'expert-routing'

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
  downloadUrl?: string
  contentType?: string
  author?: string
  createdAt?: string
}

interface SimilarTicket {
  id: string
  title: string
  similarity: number
}

interface AgentScopeField {
  label: string
  value: string
  tone?: 'default' | 'accent' | 'warn' | 'success'
}

interface InvestigationAgentScope {
  id: InvestigationAgentId
  agentNumber: number
  title: string
  summary: string
  status: StepStatus
  runPolicy: string
  evidenceRefs: string[]
  fields: AgentScopeField[]
}

interface EngineerReviewState {
  status: StepStatus
  summary: string
  actions: string[]
}

interface ExpertSuggestion {
  name: string
  reason: string
  references: string[]
}

interface InvestigationStep {
  id: string
  label: string
  helper?: string
  status: StepStatus
  timestamp?: string
  objective?: string
}

interface InvestigationCard {
  id: InvestigationAgentId
  agentNumber: number
  title: string
  agent: string
  description: string
  focus: string
  outputs: string[]
  status: StepStatus
  actionLabel?: string
  rerunLabel?: string
  canRerun?: boolean
  tone?: InvestigationCardTone
  note?: string
}

interface InvestigationReport {
  issueSummary: string
  possibleRootCause: string
  recommendedInvestigation: string[]
  recommendedFix: string[]
  evidence: string[]
  codeReferences: string[]
  clientReply: string
  redmineComment: string
  closureNotes: string
  confidence: number
  technicalAnalysisDraft: string
  agentScopes: InvestigationAgentScope[]
  engineerReview: EngineerReviewState
  expertSuggestion: ExpertSuggestion
}

interface InvestigationProfile {
  lane: InvestigationLane
  laneTitle: string
  laneSummary: string
  processPath: string[]
  similarPrompt: string
  tracePrompt: string
  rootCausePrompt: string
  verificationPrompt: string
  handoffPrompt: string
  nextBestAction: string
  evidenceSummary: string[]
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
  authorName?: string
  customerName?: string
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

type MockTicketSeed = Omit<InvestigationTicket, 'steps' | 'investigationCards' | 'report'> & {
  stage?: MockStage
  report?: Partial<InvestigationReport>
}

type InvestigationProfileSource = Omit<InvestigationTicket, 'steps' | 'investigationCards' | 'report'>

interface AssignedTicketResponse {
  id: number
  redmine_id: number
  subject: string
  tracker: string
  priority: string
  status: string
  module: string
  assigned_to_name?: string
  author_name?: string
  customer_name?: string
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

interface TicketDetailAttachmentResponse {
  id: number | string
  redmine_attachment_id?: number
  filename: string
  file_size_bytes?: number | null
  content_type?: string | null
  author?: string
  description?: string
  created_at?: string
  download_url?: string | null
}

interface TicketDetailResponse extends AssignedTicketResponse {
  comments?: TicketDetailCommentResponse[]
  attachments?: TicketDetailAttachmentResponse[]
}

interface InvestigationWorkspaceProps {
  initialTicketId?: string
  demoMode?: boolean
}

interface SidebarItem {
  id: string
  label: string
  icon: IconType
  href?: string
}

interface ConversationMessage {
  id: string
  author: string
  role: 'engineer' | 'ai'
  content: string
  timestamp: string
}

interface ConversationReplyRequestPayload {
  prompt: string
  load_only?: boolean
  history: Array<{
    author: string
    role: 'engineer' | 'ai'
    content: string
    timestamp: string
  }>
  ticket: {
    id: string
    number: string
    title: string
    tracker: string
    priority_label: string
    status_label: string
    project: string
    module: string
    assigned_to: string
    author_name: string
    customer_name: string
    description: string
    possible_root_cause: string
    technical_analysis_draft: string
    recommended_investigation: string[]
    recommended_fix: string[]
    key_insights: string[]
    similar_tickets: Array<{
      id: string
      title: string
      similarity: number
    }>
    agent_outputs: Array<{
      agent_number: number
      title: string
      status: string
      summary: string
      run_policy: string
      evidence_refs: string[]
      fields: Array<{
        label: string
        value: string
        tone?: 'default' | 'accent' | 'warn' | 'success'
      }>
    }>
  }
}

interface ConversationReplyResponsePayload {
  author: string
  content: string
  timestamp: string
  provider_label: string
  used_live_provider: boolean
  fallback_reason?: string | null
  inferred_plants?: string[]
  knowledge_suggestions?: string[]
  template_name?: string
  saved_messages?: Array<{
    author: string
    role: 'engineer' | 'ai'
    content: string
    timestamp: string
  }>
  starter_message?: string | null
  report_updates?: {
    client_reply?: string | null
    redmine_comment?: string | null
    closure_note?: string | null
    recommended_fix?: string[]
    engineer_review_summary?: string | null
    possible_root_cause?: string | null
    technical_analysis_draft?: string | null
    recommended_investigation?: string[]
    evidence?: string[]
    code_references?: string[]
    key_insights?: string[]
  } | null
}

interface ConversationStateResponsePayload {
  ticket_id: number
  messages: Array<{
    author: string
    role: 'engineer' | 'ai'
    content: string
    timestamp: string
  }>
  inferred_plants: string[]
  knowledge_suggestions: string[]
  template_name: string
  starter_message?: string | null
  report_updates?: ConversationReplyResponsePayload['report_updates']
}

interface TimelineEntry {
  id: string
  time: string
  title: string
  detail: string
}

const DEFAULT_TICKET_ID = '90857'
const PANEL_CLASS = 'rounded-xl border border-[#1E3047] bg-[#0D1726] shadow-[0_10px_30px_rgba(1,6,16,0.35)]'
const PANEL_SECONDARY_CLASS = 'rounded-xl border border-[#1E3047] bg-[#111D2D]'
const SUPPORT_TEAM_NAME_BY_EMAIL: Record<string, string> = {
  'aman.jamal@vegam.co': 'Aman Jamal',
  'dhanusree@vegam.co': 'Dhanusree',
  'hani@vegam.co': 'Hani Fathima',
  'nelson@vegam.co': 'Nelson A',
  'saran@vegam.co': 'Saran B',
  'shivendra@vegam.co': 'Shivendra Saurabh',
  'abhishek.kumar@vegam.co': 'Abhishek Kumar',
  'anu@vegam.co': 'Anuradha',
  'deekshith@vegam.co': 'Deekshith Gowda',
  'krishnasai@vegam.co': 'Krishna Sai',
  'meghana@vegam.co': 'Meghana CK',
  'shriya@vegam.co': 'Shriya Betageri',
  'sudipa@vegam.co': 'Sudipa Pradhan',
  'yogashree@vegam.co': 'Yogashree Bhanu',
  'suraj.patil@vegam.co': 'Suraj Patil',
  'pradeep@vegam.co': 'Pradeep R',
  'piyush@vegam.co': 'Piyush Kumar',
}

const WORKSPACE_TABS: Array<{ id: WorkspaceTabId; label: string }> = [
  { id: 'investigation', label: 'Investigation' },
  { id: 'report', label: 'AI Report' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'attachments', label: 'Attachments' },
  { id: 'history', label: 'History' },
]

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'team', label: 'Team', icon: LuUsers, href: '/team-dashboard' },
  { id: 'tickets', label: 'Tickets', icon: LuTicket, href: '/dashboard' },
  { id: 'investigation', label: 'Investigation', icon: LuSparkles, href: '/investigation' },
  { id: 'reports', label: 'Reports', icon: LuLayoutDashboard, href: '/report' },
  { id: 'knowledge', label: 'Knowledge Base', icon: LuBookOpen, href: '/knowledge-base' },
  { id: 'settings', label: 'Settings', icon: LuSettings, href: '/settings' },
]

function resolveVegamEmail(email?: string, username?: string) {
  const normalizedEmail = (email || '').trim().toLowerCase()
  if (normalizedEmail) {
    return normalizedEmail.includes('@') ? normalizedEmail : `${normalizedEmail}@vegam.co`
  }

  const normalizedUsername = (username || '').trim().toLowerCase()
  if (!normalizedUsername) {
    return ''
  }

  return normalizedUsername.includes('@') ? normalizedUsername : `${normalizedUsername}@vegam.co`
}

function resolveGreetingLabel(email?: string, username?: string, fullName?: string) {
  const vegamEmail = resolveVegamEmail(email, username)
  if (vegamEmail && SUPPORT_TEAM_NAME_BY_EMAIL[vegamEmail]) {
    return SUPPORT_TEAM_NAME_BY_EMAIL[vegamEmail]
  }

  if (vegamEmail) {
    return vegamEmail
  }

  return fullName?.trim() || 'Redmine User'
}

function detectInvestigationLane(ticket: InvestigationProfileSource): InvestigationLane {
  const combined = [
    ticket.title,
    ticket.module,
    ticket.project,
    ticket.description,
    ...ticket.comments.map((comment) => comment.content),
  ].join(' ').toLowerCase()

  if (/(label|printer|print|template|barcode|glmi|zebra|sfs)/.test(combined)) {
    return 'label'
  }

  if (/(login|auth|token|session|credential|mobile|logout|hydrate)/.test(combined)) {
    return 'auth'
  }

  if (/(sap|idoc|api|interface|gateway|integration|connector|queue|middleware|sync)/.test(combined)) {
    return 'integration'
  }

  if (/(machine|sensor|iot|maintenance|alarm|plc|dcs|breakdown|telemetry)/.test(combined)) {
    return 'maintenance'
  }

  return 'generic'
}

function buildInvestigationProfile(ticket: InvestigationProfileSource): InvestigationProfile {
  const lane = detectInvestigationLane(ticket)
  const evidenceSummary = [
    `${ticket.comments.length} Redmine comment${ticket.comments.length === 1 ? '' : 's'}`,
    `${ticket.attachments.length} attachment${ticket.attachments.length === 1 ? '' : 's'}`,
    `${ticket.logs.length} log file${ticket.logs.length === 1 ? '' : 's'}`,
    `${ticket.similarTickets.length} similar incident${ticket.similarTickets.length === 1 ? '' : 's'}`,
  ]

  if (lane === 'label') {
    return {
      lane,
      laneTitle: 'Labeling & Printer Execution',
      laneSummary: 'Best for print failures, label template mismatches, barcode issues, and plant-specific printer routing.',
      processPath: ['Operator action', 'Vegam SFS / UI', 'Label rule engine', 'Template + printer queue'],
      similarPrompt: 'Cluster historical incidents by printer, template, plant, and material/order master data.',
      tracePrompt: 'Trace the request from UI through field mapping, template resolution, and printer spool/driver handoff.',
      rootCausePrompt: 'Prioritize template version, SAP field mapping, printer DPI/driver, and plant routing configuration as root-cause branches.',
      verificationPrompt: 'Validate the same print scenario with plant-specific printer settings and the exact business data used in production.',
      handoffPrompt: 'Prepare operator workaround, configuration correction, and Redmine-ready closure notes for the customer plant.',
      nextBestAction: 'Reproduce the exact print with the same template, printer, and production order data from the affected plant.',
      evidenceSummary,
    }
  }

  if (lane === 'auth') {
    return {
      lane,
      laneTitle: 'Authentication & Session Stability',
      laneSummary: 'Best for login failures, token expiry, session hydration, and mobile/web access issues.',
      processPath: ['Client app / browser', 'Auth service', 'Session persistence', 'Protected Vegam module'],
      similarPrompt: 'Cluster previous tickets by platform, release window, auth endpoint, and session failure pattern.',
      tracePrompt: 'Correlate request/response, token expiry, session writes, redirects, and first protected calls after login.',
      rootCausePrompt: 'Prioritize auth response mapping, expiry parsing, session storage, and client hydration order in the hypothesis tree.',
      verificationPrompt: 'Verify the fix across login, refresh, expiry, logout, and first-screen render scenarios.',
      handoffPrompt: 'Prepare customer update, workaround guidance, and regression checklist for support and engineering handoff.',
      nextBestAction: 'Compare token persistence and redirect timing against the last known stable release for the affected platform.',
      evidenceSummary,
    }
  }

  if (lane === 'integration') {
    return {
      lane,
      laneTitle: 'ERP / Interface Coordination',
      laneSummary: 'Best for SAP handoffs, middleware/API failures, queue delays, and external system acknowledgements.',
      processPath: ['Plant transaction', 'Vegam workflow', 'API / middleware / queue', 'SAP or external system'],
      similarPrompt: 'Cluster cases by message type, plant, endpoint, retry count, and deployment window.',
      tracePrompt: 'Trace payload mapping, queue lag, acknowledgements, retries, and destination response codes end-to-end.',
      rootCausePrompt: 'Prioritize field mapping, partner profile, auth headers, timeout windows, and retry strategy as candidate causes.',
      verificationPrompt: 'Replay one failing payload and confirm the acknowledgement path in both Vegam and the connected system.',
      handoffPrompt: 'Prepare business-impact summary, reprocessing steps, and a precise recovery instruction for support teams.',
      nextBestAction: 'Capture one failed payload and follow it across mapper, queue, and destination response to isolate the first broken handoff.',
      evidenceSummary,
    }
  }

  if (lane === 'maintenance') {
    return {
      lane,
      laneTitle: 'Machine / IoT / Maintenance Flow',
      laneSummary: 'Best for PLC/DCS alarms, telemetry gaps, maintenance triggers, and downtime workflow issues.',
      processPath: ['Machine / PLC / DCS', 'Edge / IoT connector', 'Vegam maintenance flow', 'Dashboard / work order'],
      similarPrompt: 'Cluster incidents by asset, tag, line, threshold rule, and downtime signature.',
      tracePrompt: 'Trace tag timestamps, connector heartbeat, signal ingestion, and downstream work-order triggers.',
      rootCausePrompt: 'Prioritize tag mapping, connector health, threshold logic, and workflow trigger rules as likely causes.',
      verificationPrompt: 'Validate live or simulated tag changes, alarm generation, acknowledgement, and closure behavior before release.',
      handoffPrompt: 'Prepare plant action steps, temporary bypass guidance, and monitoring instructions for support teams.',
      nextBestAction: 'Compare live signal values, connector heartbeat, and configured alarm thresholds for the affected asset or line.',
      evidenceSummary,
    }
  }

  return {
    lane,
    laneTitle: 'Application Workflow Investigation',
    laneSummary: 'Balanced mode for mixed workflow issues where UI, process logic, configuration, and integration all need review.',
    processPath: ['User action', 'Vegam workflow', 'Business rule / integration', 'Final outcome'],
    similarPrompt: 'Cluster by tracker, plant, module, and failure keywords to find the closest historical incidents.',
    tracePrompt: 'Walk the full workflow with comments, attachments, timestamps, and the first failing business step.',
    rootCausePrompt: 'Build candidate failure paths across configuration, code, business rules, and dependent integrations.',
    verificationPrompt: 'Reproduce with the same role, plant data, and operator sequence used by the customer.',
    handoffPrompt: 'Prepare support next steps, engineering action items, and a clean customer-facing update.',
    nextBestAction: 'Confirm the first failing business step with screenshot, data sample, and the exact operator path.',
    evidenceSummary,
  }
}

function getTechnicalAgentRequirements(lane: InvestigationLane) {
  if (lane === 'label') {
    return { code: false, database: false, configuration: true }
  }

  if (lane === 'auth') {
    return { code: true, database: false, configuration: true }
  }

  if (lane === 'integration') {
    return { code: true, database: true, configuration: true }
  }

  if (lane === 'maintenance') {
    return { code: false, database: false, configuration: true }
  }

  return { code: true, database: false, configuration: true }
}

function buildAgentStatusMap(ticket: InvestigationProfileSource, stage: MockStage): Record<InvestigationAgentId, StepStatus> {
  const lane = detectInvestigationLane(ticket)
  const requirements = getTechnicalAgentRequirements(lane)

  return {
    'ticket-understanding': 'done',
    'historical-knowledge': 'done',
    'domain-knowledge': 'done',
    'code-intelligence': requirements.code ? 'done' : 'optional',
    'database-investigation': requirements.database ? (stage === 'analysis' ? 'running' : stage === 'verification' ? 'done' : 'pending') : 'optional',
    'configuration-investigation': requirements.configuration ? (stage === 'waiting' ? 'pending' : 'done') : 'optional',
    'ai-synthesis': stage === 'analysis' ? 'running' : stage === 'verification' ? 'done' : 'pending',
    'communication-planner': stage === 'verification' ? 'waiting' : 'waiting',
    'learning-agent': 'waiting',
    'expert-routing': 'done',
  }
}

function combineStatuses(statuses: StepStatus[]): StepStatus {
  if (statuses.includes('running')) {
    return 'running'
  }
  if (statuses.includes('stale')) {
    return 'stale'
  }
  if (statuses.includes('review')) {
    return 'review'
  }
  if (statuses.includes('pending')) {
    return 'pending'
  }
  if (statuses.every((status) => status === 'optional')) {
    return 'optional'
  }
  if (statuses.every((status) => status === 'done' || status === 'optional')) {
    return 'done'
  }
  if (statuses.includes('waiting')) {
    return 'waiting'
  }
  return 'waiting'
}

function extractErrorMessages(ticket: InvestigationProfileSource): string[] {
  const sourceLines = [ticket.description, ...ticket.comments.map((comment) => comment.content)]
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const matched = sourceLines.filter((line) =>
    /(error|failed|failure|exception|timeout|unauthorized|crash|not able|unable)/i.test(line)
  )

  return matched.slice(0, 4)
}

function buildEngineerReviewState(ticket: InvestigationProfileSource, stage: MockStage): EngineerReviewState {
  if (stage === 'verification') {
    return {
      status: 'review',
      summary: `AI investigation is ready for support engineer confirmation before customer communication for ${ticket.number}.`,
      actions: ['Accept Analysis', 'Add My Findings', 'Ask AI', 'Run More Investigation'],
    }
  }

  if (stage === 'analysis') {
    return {
      status: 'waiting',
      summary: 'The synthesis agent is still consolidating evidence. Engineer review unlocks after the technical analysis is complete.',
      actions: ['Wait for AI Synthesis'],
    }
  }

  return {
    status: 'waiting',
    summary: 'Waiting for upstream investigation evidence before the support engineer review gate can open.',
    actions: ['Wait for Technical Agents'],
  }
}

function buildStatusMapFromScopes(scopes: InvestigationAgentScope[]): Record<InvestigationAgentId, StepStatus> {
  return scopes.reduce<Record<InvestigationAgentId, StepStatus>>((map, scope) => {
    map[scope.id] = scope.status
    return map
  }, {} as Record<InvestigationAgentId, StepStatus>)
}

function buildWorkflowStepsFromStatusMap(
  ticket: InvestigationProfileSource,
  statusMap: Record<InvestigationAgentId, StepStatus>,
  engineerReview: EngineerReviewState
): InvestigationStep[] {
  const profile = buildInvestigationProfile(ticket)
  const technicalStatus = combineStatuses([
    statusMap['code-intelligence'],
    statusMap['database-investigation'],
    statusMap['configuration-investigation'],
  ])
  const timestamps = ['10:15:21 AM', '10:15:35 AM', '10:15:52 AM', '10:16:10 AM', '10:16:34 AM', '10:16:52 AM', '10:17:15 AM', '10:17:42 AM', '10:18:05 AM']

  return [
    {
      id: 'ticket-understanding',
      label: 'Ticket Understanding',
      helper: 'Agent 1',
      status: statusMap['ticket-understanding'],
      timestamp: timestamps[0],
      objective: `Normalize exact ticket scope, plant, module, and missing information for ${ticket.number}.`,
    },
    {
      id: 'historical-knowledge',
      label: 'Historical Knowledge',
      helper: 'Agent 2',
      status: statusMap['historical-knowledge'],
      timestamp: timestamps[1],
      objective: 'Hybrid search across history, knowledge, and previous resolved investigations.',
    },
    {
      id: 'domain-knowledge',
      label: 'Domain Knowledge',
      helper: 'Agent 3',
      status: statusMap['domain-knowledge'],
      timestamp: timestamps[2],
      objective: `${profile.laneTitle} flow mapped with upstream/downstream dependency awareness.`,
    },
    {
      id: 'technical-investigation',
      label: 'Technical Investigation',
      helper: 'Agents 4-6',
      status: technicalStatus,
      timestamp: timestamps[3],
      objective: 'Run code, database, and configuration investigation only when the ticket actually requires them.',
    },
    {
      id: 'ai-synthesis',
      label: 'AI Synthesis',
      helper: 'Agent 7',
      status: statusMap['ai-synthesis'],
      timestamp: timestamps[4],
      objective: 'Consolidate the previous evidence into probable RCA, failure stage, and recommended test path.',
    },
    {
      id: 'engineer-review',
      label: 'Engineer Review Gate',
      helper: 'Human confirmation',
      status: engineerReview.status,
      timestamp: timestamps[5],
      objective: engineerReview.summary,
    },
    {
      id: 'communication',
      label: 'Communication Planner',
      helper: 'Agent 8',
      status: statusMap['communication-planner'],
      timestamp: timestamps[6],
      objective: 'Generate the customer / Redmine response only after engineer confirmation.',
    },
    {
      id: 'learning',
      label: 'Learning',
      helper: 'Agent 9',
      status: statusMap['learning-agent'],
      timestamp: timestamps[7],
      objective: 'Capture confirmed RCA, fix, and AI correctness as curated knowledge after resolution.',
    },
    {
      id: 'expert-routing',
      label: 'Expert Routing',
      helper: 'Agent 10',
      status: statusMap['expert-routing'],
      timestamp: timestamps[8],
      objective: 'Suggest the likely internal expert early using successful resolution history.',
    },
  ]
}

function buildAgentScopes(ticket: InvestigationProfileSource, stage: MockStage): InvestigationAgentScope[] {
  const profile = buildInvestigationProfile(ticket)
  const statusMap = buildAgentStatusMap(ticket, stage)
  const errorMessages = extractErrorMessages(ticket)
  const attachments = [...ticket.attachments, ...ticket.logs]
  const supportTemplate =
    isServiceRequestLikeTicket(ticket)
      ? 'Platinum / Gold / Silver / Bronze service template'
      : /incident/i.test(ticket.tracker)
        ? 'Incident technical template'
        : 'Bug technical template'

  const expertName =
    profile.lane === 'integration'
      ? 'Anuradha'
      : profile.lane === 'label'
        ? 'Suraj Patil'
        : profile.lane === 'maintenance'
          ? 'Nelson A'
          : 'Suraj Patil'

  return [
    {
      id: 'ticket-understanding',
      agentNumber: 1,
      title: 'Ticket Understanding Agent',
      summary: `Normalized the Redmine ticket scope for ${ticket.number} without hiding the important technical text.`,
      status: statusMap['ticket-understanding'],
      runPolicy: 'Automatically runs first. Rerun when the Redmine ticket is updated.',
      evidenceRefs: ['Redmine ticket header', `${ticket.comments.length} Redmine comments`, `${attachments.length} attachments/logs`],
      fields: [
        { label: 'ticket_summary', value: ticket.title, tone: 'accent' },
        { label: 'problem_statement', value: ticket.description || 'No Redmine description available yet.' },
        { label: 'observed_behavior', value: errorMessages[0] || 'Observed behavior is still being refined from the latest evidence.' },
        { label: 'expected_behavior', value: `The ${ticket.module} flow should complete successfully for ${ticket.project}.` },
        { label: 'affected_module', value: ticket.module || 'Unknown module' },
        { label: 'plant', value: ticket.project || 'Unknown plant' },
        { label: 'customer', value: ticket.project || 'Customer not exposed in current live ticket payload' },
        { label: 'environment', value: 'Production-like Redmine ticket context' },
        { label: 'error_messages', value: errorMessages.join(' | ') || 'No explicit error message extracted yet.', tone: errorMessages.length > 0 ? 'warn' : 'default' },
        { label: 'timestamps', value: `Created ${formatDisplayDateTime(ticket.createdAt)} | Updated ${formatDisplayDateTime(ticket.updatedAt)}` },
        { label: 'reported_steps', value: ticket.comments[0]?.content || 'No exact reproduction steps were attached to the ticket yet.' },
        { label: 'known_changes', value: ticket.comments[1]?.content || 'No confirmed recent changes captured from Redmine yet.' },
        { label: 'attachments', value: attachments.map((item) => item.name).join(', ') || 'No attachments or screenshots were attached.' },
        { label: 'missing_information', value: 'User exact steps, environment-specific screenshots, and confirmed expected result should be validated if still missing.' },
      ],
    },
    {
      id: 'historical-knowledge',
      agentNumber: 2,
      title: 'Historical Incident / Knowledge Agent',
      summary: `Hybrid search used plant, module, keywords, and related incident memory to rank ${ticket.similarTickets.length} useful matches.`,
      status: statusMap['historical-knowledge'],
      runPolicy: 'Auto-run after ticket understanding. Re-rank with metadata instead of semantic-only matching.',
      evidenceRefs: ticket.similarTickets.slice(0, 3).map((item) => `${item.id} (${item.similarity}%)`),
      fields: ticket.similarTickets.slice(0, 4).map((item, index) => ({
        label: `match_${index + 1}`,
        value: `${item.id} | ${item.title} | similarity ${item.similarity}% | plant ${ticket.project} | module ${ticket.module}`,
        tone: index === 0 ? 'success' : 'default',
      })),
    },
    {
      id: 'domain-knowledge',
      agentNumber: 3,
      title: 'Domain Knowledge Agent',
      summary: `Mapped the Vegam manufacturing workflow around ${profile.laneTitle.toLowerCase()} with upstream and downstream dependencies.`,
      status: statusMap['domain-knowledge'],
      runPolicy: 'Auto-run after history search to build business context before technical investigation.',
      evidenceRefs: profile.processPath.map((step) => step),
      fields: [
        { label: 'business_flow', value: profile.processPath.join(' -> '), tone: 'accent' },
        { label: 'expected_sequence', value: profile.processPath.join(' -> ') },
        { label: 'possible_dependency_failures', value: profile.tracePrompt },
        { label: 'systems_to_check', value: profile.evidenceSummary.join(' | ') },
      ],
    },
    {
      id: 'code-intelligence',
      agentNumber: 4,
      title: 'Code Intelligence Agent',
      summary: statusMap['code-intelligence'] === 'optional'
        ? 'Code analysis is currently skipped because this lane looks configuration/workflow-led rather than source-code-led.'
        : 'Repository indexing should stay focused on relevant modules, methods, APIs, and recent code changes only.',
      status: statusMap['code-intelligence'],
      runPolicy: 'Conditional. Run only when the issue looks software or source-code relevant.',
      evidenceRefs: statusMap['code-intelligence'] === 'optional'
        ? ['Conditional technical agent skipped by workflow controller']
        : [`Module ${ticket.module}`, 'Targeted repository search', 'Recent change review'],
      fields: [
        { label: 'related_files', value: statusMap['code-intelligence'] === 'optional' ? 'Skipped for now.' : `${ticket.module}Controller.cs | ${ticket.module}Service.cs | ${ticket.module}Repository.cs`, tone: statusMap['code-intelligence'] === 'optional' ? 'default' : 'accent' },
        { label: 'related_methods', value: statusMap['code-intelligence'] === 'optional' ? 'Skipped for now.' : `Validate${ticket.module.replace(/\s+/g, '')}() | Process${ticket.module.replace(/\s+/g, '')}()` },
        { label: 'related_queries', value: statusMap['code-intelligence'] === 'optional' ? 'Skipped for now.' : `${ticket.module.toUpperCase().replace(/\s+/g, '_')} table read path and recent query changes` },
        { label: 'dependency_path', value: statusMap['code-intelligence'] === 'optional' ? 'Skipped for now.' : profile.processPath.join(' -> ') },
        { label: 'possible_problem_locations', value: statusMap['code-intelligence'] === 'optional' ? 'Skipped for now.' : `Focus on ${ticket.module}, mapped workflow services, and the first failing handoff.` },
        { label: 'recent_changes', value: 'Recent repository changes should be checked against the failure stage before any broad code analysis.' },
      ],
    },
    {
      id: 'database-investigation',
      agentNumber: 5,
      title: 'Database Investigation Agent',
      summary: statusMap['database-investigation'] === 'optional'
        ? 'Database investigation is currently skipped because the present evidence does not strongly point to data-state problems.'
        : 'Database investigation stays read-only and focuses on state mismatches, record existence, and queue/transaction diagnostics.',
      status: statusMap['database-investigation'],
      runPolicy: 'Conditional and read-only. Never execute destructive SQL automatically.',
      evidenceRefs: statusMap['database-investigation'] === 'optional'
        ? ['Conditional technical agent skipped by workflow controller']
        : ['Read-only diagnostics only', 'No UPDATE/DELETE/TRUNCATE/DROP', 'Diagnostic query recommendation'],
      fields: [
        { label: 'observations', value: statusMap['database-investigation'] === 'optional' ? 'Skipped for now.' : `Check record state for ${ticket.module} and compare it with a known-good workflow instance.` },
        { label: 'potential_issues', value: statusMap['database-investigation'] === 'optional' ? 'Skipped for now.' : 'Status mismatch, missing relationship, duplicate data, queue backlog, lock, or invalid transition.' },
        { label: 'suggested_diagnostic_queries', value: `SELECT * FROM ${ticket.module.toUpperCase().replace(/\s+/g, '_')} WHERE ticket_context = '${ticket.number}';`, tone: statusMap['database-investigation'] === 'optional' ? 'default' : 'accent' },
        { label: 'queries_executed', value: 'No live database execution is performed automatically in this workspace.' },
        { label: 'results', value: statusMap['database-investigation'] === 'optional' ? 'No DB result captured yet.' : 'Awaiting support engineer decision or future DB-source execution.' },
        { label: 'recommended_action', value: 'Keep all SQL diagnostic and read-only unless explicit human authorization is provided.' },
      ],
    },
    {
      id: 'configuration-investigation',
      agentNumber: 6,
      title: 'Configuration Investigation Agent',
      summary: 'Compared the current ticket context with a known-good plant/module path to isolate likely configuration mismatches.',
      status: statusMap['configuration-investigation'],
      runPolicy: 'Conditional, but strongly preferred for plant-specific, permission, mapping, workflow, and environment issues.',
      evidenceRefs: ['Plant configuration', 'Module settings', 'Master data and mappings', 'Known-good comparison'],
      fields: [
        { label: 'configuration_differences', value: `Compare ${ticket.project} / ${ticket.module} against a working plant or customer with the same flow.`, tone: 'accent' },
        { label: 'suspected_misconfiguration', value: profile.nextBestAction },
        { label: 'feature_flags', value: 'Review workflow toggles, permissions, integration endpoints, and environment variables.' },
      ],
    },
    {
      id: 'ai-synthesis',
      agentNumber: 7,
      title: 'AI Investigation Synthesis Agent',
      summary: `Connected AI synthesis consolidates Agents 1-6 into a probable root cause, failure stage, dependency view, and technical draft for ${ticket.tracker}.`,
      status: statusMap['ai-synthesis'],
      runPolicy: 'Auto-run after required technical agents finish. Downstream communication should wait for engineer confirmation.',
      evidenceRefs: ['Structured outputs from Agents 1-6', `Tracker: ${ticket.tracker}`, `Recommended template: ${supportTemplate}`],
      fields: [
        { label: 'integration_flow', value: profile.processPath.join(' -> '), tone: 'accent' },
        { label: 'failure_stage', value: profile.processPath[Math.max(0, profile.processPath.length - 2)] || ticket.module },
        { label: 'external_dependency', value: profile.lane === 'integration' ? 'SAP / interface / queue dependency' : profile.lane === 'maintenance' ? 'PLC / DCS / IoT dependency' : 'Configuration and workflow dependency' },
        { label: 'recommended_test', value: profile.verificationPrompt },
        { label: 'draft_template', value: supportTemplate, tone: 'success' },
      ],
    },
    {
      id: 'communication-planner',
      agentNumber: 8,
      title: 'Communication Agent / Solution Planner',
      summary: 'Waits for support engineer confirmation, then generates ordered actions, Redmine-ready updates, and the customer-facing response.',
      status: statusMap['communication-planner'],
      runPolicy: 'Do not finalize customer communication until the engineer confirms the AI investigation.',
      evidenceRefs: ['Engineer confirmation gate', 'Conversation tab findings', 'Final customer template'],
      fields: [
        { label: 'ordered_actions', value: 'Engineer confirms findings -> AI updates technical draft -> customer / Redmine response is generated.' },
        { label: 'engineer_findings', value: 'Conversation tab inputs should actively change the communication draft and confidence.', tone: 'accent' },
      ],
    },
    {
      id: 'learning-agent',
      agentNumber: 9,
      title: 'Learning Agent',
      summary: 'Captures the confirmed root cause, actual fix, AI correctness, and curated reuse decisions after the ticket is resolved.',
      status: statusMap['learning-agent'],
      runPolicy: 'Post-resolution only. Store curated learning, not direct model retraining.',
      evidenceRefs: ['Confirmed root cause', 'Confirmed fix', 'AI correctness category', 'Knowledge promotion decision'],
      fields: [
        { label: 'ai_prediction', value: 'Waiting for the final engineer-confirmed outcome.' },
        { label: 'categories', value: 'Correct | Partially Correct | Incorrect | Unknown' },
        { label: 'promote_to_knowledge', value: 'Promote to Knowledge | Do Not Promote | Needs Team Lead Review', tone: 'accent' },
      ],
    },
    {
      id: 'expert-routing',
      agentNumber: 10,
      title: 'Expert Routing Agent',
      summary: `Suggested expert routing already indicates ${expertName} as a likely internal helper based on this workflow lane.`,
      status: statusMap['expert-routing'],
      runPolicy: 'Background or on-demand. Surface the likely expert early so investigation can accelerate.',
      evidenceRefs: [`Suggested expert ${expertName}`, 'Historical successful resolutions', 'Workflow-lane expertise match'],
      fields: [
        { label: 'suggested_expert', value: expertName, tone: 'success' },
        { label: 'reason', value: `Resolved multiple ${profile.laneTitle.toLowerCase()} tickets similar to ${ticket.module}.` },
        { label: 'references', value: ticket.similarTickets.slice(0, 3).map((item) => item.id).join(' | ') || 'No similar ticket reference loaded yet.' },
      ],
    },
  ]
}

function buildSteps(ticket: InvestigationProfileSource, stage: MockStage): InvestigationStep[] {
  const statusMap = buildAgentStatusMap(ticket, stage)
  const engineerReview = buildEngineerReviewState(ticket, stage)
  return buildWorkflowStepsFromStatusMap(ticket, statusMap, engineerReview)
}

function buildTechnicalAnalysisDraft(ticket: InvestigationProfileSource): string {
  const profile = buildInvestigationProfile(ticket)

  return [
    `Ticket ${ticket.number} is currently aligned to the ${profile.laneTitle.toLowerCase()} investigation lane.`,
    `Business flow in scope: ${profile.processPath.join(' -> ')}.`,
    `Primary technical focus: ${profile.nextBestAction}`,
    `Current probable root cause is not yet engineer-confirmed, so all customer communication should stay in draft form.`,
  ].join(' ')
}

function buildDefaultExpertSuggestion(ticket: InvestigationProfileSource): ExpertSuggestion {
  const profile = buildInvestigationProfile(ticket)

  if (profile.lane === 'integration') {
    return {
      name: 'Anuradha',
      reason: 'Resolved multiple SAP/interface coordination issues with similar workflow patterns.',
      references: ticket.similarTickets.slice(0, 3).map((item) => item.id),
    }
  }

  if (profile.lane === 'maintenance') {
    return {
      name: 'Nelson A',
      reason: 'Strong prior history with maintenance, IoT, PLC, and signal-driven tickets.',
      references: ticket.similarTickets.slice(0, 3).map((item) => item.id),
    }
  }

  return {
    name: 'Suraj Patil',
    reason: 'Resolved several closely related manufacturing, label, and workflow-driven incidents.',
    references: ticket.similarTickets.slice(0, 3).map((item) => item.id),
  }
}

function buildCards(scopes: InvestigationAgentScope[]): InvestigationCard[] {
  return scopes.map((scope) => {
    const primaryFields = scope.fields.slice(0, 3).map((field) => field.value)
    const focus = scope.evidenceRefs.length > 0 ? `Evidence: ${scope.evidenceRefs.join(' | ')}` : scope.runPolicy

    const tone: InvestigationCardTone =
      scope.id === 'historical-knowledge'
        ? 'purple'
        : scope.id === 'ai-synthesis' || scope.id === 'learning-agent'
          ? 'green'
          : scope.id === 'database-investigation' || scope.id === 'configuration-investigation'
            ? 'amber'
            : scope.id === 'communication-planner' || scope.id === 'expert-routing'
              ? 'slate'
              : 'blue'

    return {
      id: scope.id,
      agentNumber: scope.agentNumber,
      title: scope.title,
      agent: `Agent ${scope.agentNumber}`,
      description: scope.summary,
      focus,
      outputs: primaryFields.length > 0 ? primaryFields : [scope.runPolicy],
      status: scope.status,
      actionLabel: 'See Scope',
      rerunLabel: 'Run Again',
      canRerun: scope.id !== 'learning-agent',
      tone,
      note: scope.runPolicy,
    }
  })
}

const AGENT_ORDER: InvestigationAgentId[] = [
  'ticket-understanding',
  'historical-knowledge',
  'domain-knowledge',
  'code-intelligence',
  'database-investigation',
  'configuration-investigation',
  'ai-synthesis',
  'communication-planner',
  'learning-agent',
  'expert-routing',
]

function applyReportToTicket(
  ticket: InvestigationTicket,
  report: InvestigationReport
): InvestigationTicket {
  const ticketSource: InvestigationProfileSource = {
    id: ticket.id,
    number: ticket.number,
    title: ticket.title,
    tracker: ticket.tracker,
    priorityLabel: ticket.priorityLabel,
    priorityTone: ticket.priorityTone,
    project: ticket.project,
    module: ticket.module,
    statusLabel: ticket.statusLabel,
    assignedTo: ticket.assignedTo,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    description: ticket.description,
    comments: ticket.comments,
    attachments: ticket.attachments,
    logs: ticket.logs,
    similarTickets: ticket.similarTickets,
    keyInsights: ticket.keyInsights,
    relatedModules: ticket.relatedModules,
  }

  const statusMap = buildStatusMapFromScopes(report.agentScopes)

  return {
    ...ticket,
    steps: buildWorkflowStepsFromStatusMap(ticketSource, statusMap, report.engineerReview),
    investigationCards: buildCards(report.agentScopes),
    report,
  }
}

function simulateAgentRerun(
  ticket: InvestigationTicket,
  agentId: InvestigationAgentId,
  rerunMode: AgentRerunMode = 'selected-agent'
): InvestigationTicket {
  const rerunIndex = AGENT_ORDER.indexOf(agentId)
  if (rerunIndex === -1) {
    return ticket
  }

  const selectedScopeTitle = ticket.report.agentScopes[rerunIndex]?.title || 'the selected agent'

  if (agentId === 'ticket-understanding' && rerunMode === 'all-agents') {
    const refreshedScopes = ticket.report.agentScopes.map((scope) => {
      if (scope.id === 'ticket-understanding') {
        return {
          ...scope,
          status: 'running' as StepStatus,
          summary: 'Full investigation rerun started from Agent 1. All downstream agents will rerun in sequence.',
        }
      }

      return {
        ...scope,
        status: 'pending' as StepStatus,
        summary: `${scope.title} is queued to rerun because Agent 1 requested a full investigation refresh.`,
      }
    })

    const fullRerunReport: InvestigationReport = {
      ...ticket.report,
      possibleRootCause:
        'Full investigation rerun requested from Agent 1. Current conclusions should be treated as temporarily outdated until all agent outputs are refreshed.',
      technicalAnalysisDraft:
        'A full rerun was requested from Agent 1. Rebuild the entire evidence chain before using this investigation for engineer confirmation or customer communication.',
      evidence: [
        'Full investigation rerun requested from Agent 1.',
        'All agent scopes were queued for rerun so stale evidence is not reused.',
        ...ticket.report.evidence.slice(0, 3),
      ],
      agentScopes: refreshedScopes,
      engineerReview: {
        status: 'waiting',
        summary: 'Engineer review is paused while all agents rerun from Agent 1 and the full evidence chain is refreshed.',
        actions: ['Wait for Full Rerun', 'Add New Ticket Context', 'Open Conversation'],
      },
    }

    return applyReportToTicket(ticket, fullRerunReport)
  }

  const updatedScopes = ticket.report.agentScopes.map((scope) => {
    const scopeIndex = AGENT_ORDER.indexOf(scope.id)
    if (scope.id === agentId) {
      return {
        ...scope,
        status: 'running' as StepStatus,
        summary: `${scope.title} rerun triggered after ticket evidence changed. Downstream conclusions now need revalidation.`,
      }
    }

    if (scopeIndex > rerunIndex && scope.status !== 'waiting' && scope.status !== 'optional') {
      return {
        ...scope,
        status: 'stale' as StepStatus,
        summary: `${scope.title} uses earlier evidence and may now be outdated until rerun.`,
      }
    }

    return scope
  })

  const updatedReport: InvestigationReport = {
    ...ticket.report,
    possibleRootCause: `Investigation is being refreshed from ${selectedScopeTitle}. Downstream conclusions are temporarily marked as outdated until rerun completes.`,
    technicalAnalysisDraft: `Rerun requested for ${selectedScopeTitle}. Rebuild the dependent evidence chain before sharing customer-facing conclusions.`,
    evidence: [
      `Rerun requested for ${selectedScopeTitle}.`,
      'Downstream agent outputs were marked as outdated to prevent stale conclusions.',
      ...ticket.report.evidence.slice(0, 3),
    ],
    agentScopes: updatedScopes,
    engineerReview: {
      status: 'waiting',
      summary: `Engineer review is paused while ${selectedScopeTitle} is rerunning and downstream evidence is being refreshed.`,
      actions: ['Wait for Rerun', 'Add New Ticket Context', 'Open Conversation'],
    },
  }

  return applyReportToTicket(ticket, updatedReport)
}

function createMockTicket(seed: MockTicketSeed): InvestigationTicket {
  const { stage = 'analysis', ...ticket } = seed
  const generatedReport = buildDefaultReport(ticket, stage)
  const report = 'report' in seed && seed.report
    ? {
        ...generatedReport,
        ...seed.report,
        agentScopes: generatedReport.agentScopes,
        engineerReview: generatedReport.engineerReview,
        expertSuggestion: generatedReport.expertSuggestion,
        technicalAnalysisDraft: generatedReport.technicalAnalysisDraft,
      }
    : generatedReport

  return {
    ...ticket,
    steps: buildSteps(ticket, stage),
    investigationCards: buildCards(report.agentScopes),
    report,
  }
}

const SAVED_TICKETS: InvestigationTicket[] = [
  createMockTicket({
    id: '90857',
    number: '#90857',
    title: 'Users experiencing crashes when logging in through mobile app',
    tracker: 'Bug',
    priorityLabel: 'Critical',
    priorityTone: 'critical',
    project: 'BASF',
    module: 'Mobile Application',
    statusLabel: 'Investigation in Progress',
    assignedTo: 'Suraj Patil',
    createdAt: '2026-08-09T10:15:00',
    updatedAt: '2026-08-09T10:32:00',
    description:
      'Users are experiencing crashes when logging in through the mobile app. Error occurs after entering credentials.',
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
      { id: '90857-l2', name: 'device_info.txt', size: '8 KB', kind: 'log' },
    ],
    similarTickets: [
      { id: '#0010', title: 'Login crash on iOS 15.6', similarity: 92 },
      { id: '#0012', title: 'Android app crash after login', similarity: 88 },
      { id: '#1936', title: 'Crash on credential submit', similarity: 85 },
      { id: '#1987', title: 'Session timeout after login', similarity: 78 },
    ],
    keyInsights: [
      'Most similar ticket: #0010 (92%)',
      'Affects: iOS, Android',
      'First reported: 25 days ago',
      'Reproducible: Yes',
      'Priority: High',
    ],
    relatedModules: ['Authentication', 'Mobile App', 'Session', 'Crash Handling'],
    report: {
      issueSummary:
        'Users crash during mobile login because the app receives a valid response but fails to persist a fresh session token before dashboard bootstrapping.',
      possibleRootCause:
        'Based on similar tickets, code references and logs, the most probable cause is an authentication and session handling issue during mobile hydration.',
      recommendedInvestigation: [
        'Replay the login flow with production-like timezone offsets and device clocks.',
        'Validate session bootstrap order in the mobile shell after authentication success.',
        'Compare token parsing between the current release and the last known good build.',
      ],
      recommendedFix: [
        'Normalize authentication expiry timestamps before validating the session.',
        'Guard protected-route hydration until token persistence completes.',
        'Add regression coverage for iOS and Android login flows.',
      ],
      evidence: [
        'Crash reproduced on both iOS and Android.',
        'Stack traces point to token validation before home screen render.',
        'The issue started after the latest auth-service release.',
      ],
      codeReferences: [
        'AuthenticationService.ts:88 - login response normalization',
        'SessionService.ts:142 - expiry offset calculation',
        'MobileShell.tsx:61 - protected route hydration',
      ],
      clientReply:
        'Hi Team,\n\nWe are currently investigating the reported login issue. Our analysis indicates that the issue may be related to session handling.\n\nWe will provide an update once validation is complete.\n\nRegards,\nSamixa Support',
      redmineComment:
        'Initial AI investigation indicates a probable authentication and session regression. Similar incidents point to token expiry parsing during mobile login bootstrap. Engineering validation is in progress.',
      closureNotes:
        'Resolved by correcting session token expiry normalization and delaying protected-route hydration until auth persistence completed. Regression tests were added for iOS and Android login flows.',
      confidence: 78,
    },
    stage: 'analysis',
  }),
  createMockTicket({
    id: '90867',
    number: '#90867',
    title: 'App login failure on Android 13 devices',
    tracker: 'SR',
    priorityLabel: 'High',
    priorityTone: 'high',
    project: 'Surventis Highrunner',
    module: 'Authentication Gateway',
    statusLabel: 'Claude Verification Running',
    assignedTo: 'Suraj Patil',
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
      { id: '#1987', title: 'Session timeout after login', similarity: 74 },
    ],
    keyInsights: [
      'Most similar ticket: #1124 (90%)',
      'Affects: Android 13+',
      'First reported: 12 days ago',
      'Reproducible: Yes',
      'Priority: High',
    ],
    relatedModules: ['Android Client', 'Auth Gateway', 'Refresh Token', 'Session Cache'],
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
      evidence: [
        'Only Android 13 and newer are impacted.',
        'Gateway rollout correlates with first observed failures.',
        'Auth retry logs show the device session remains empty after 200 responses.',
      ],
      codeReferences: [
        'GatewayAuthClient.kt:134 - refresh response handling',
        'SecureSessionStore.kt:59 - persisted session write order',
        'AndroidLoginViewModel.kt:91 - optimistic auth state update',
      ],
      clientReply:
        'Hi Team,\n\nWe have isolated the Android 13 login issue to a post-authentication session persistence problem. The API is accepting the credentials, but the device session is not being finalized reliably on first login.\n\nWe are validating the remediation and will update you shortly.\n\nRegards,\nSamixa Support',
      redmineComment:
        'Verification indicates an Android-specific session persistence race after auth gateway success. Claude cross-check is validating the proposed fix before implementation.',
      closureNotes:
        'Resolved by serializing secure storage writes and delaying the login success transition until session persistence completed on Android 13 devices.',
      confidence: 82,
    },
    stage: 'verification',
  }),
  createMockTicket({
    id: '90831',
    number: '#90831',
    title: 'Crash after login on iOS',
    tracker: 'Bug',
    priorityLabel: 'Critical',
    priorityTone: 'critical',
    project: 'Surventis Symphony',
    module: 'Authentication Service',
    statusLabel: 'AI Analysis In Progress',
    assignedTo: 'Suraj Patil',
    createdAt: '2026-07-24T09:10:00',
    updatedAt: '2026-08-10T09:55:00',
    description:
      'The iOS client closes immediately after successful login. Users briefly see the loading spinner before the app exits.',
    comments: [
      {
        id: '90831-comment-1',
        author: 'iOS QA',
        badge: 'Internal',
        content: 'Crash reproduced on iOS 16.4 and 16.5 using production accounts.',
        timestamp: '2026-08-10T09:20:00',
      },
      {
        id: '90831-comment-2',
        author: 'Platform Team',
        badge: 'Internal',
        content: 'Looks related to a stale auth payload being read during app bootstrap.',
        timestamp: '2026-08-10T09:42:00',
      },
    ],
    attachments: [
      { id: '90831-a1', name: 'ios_crash_dump.txt', size: '14 KB', kind: 'attachment' },
      { id: '90831-a2', name: 'app_boot_trace.png', size: '198 KB', kind: 'attachment' },
    ],
    logs: [
      { id: '90831-l1', name: 'ios_session.log', size: '11 KB', kind: 'log' },
      { id: '90831-l2', name: 'auth_bootstrap.log', size: '7 KB', kind: 'log' },
    ],
    similarTickets: [
      { id: '#0010', title: 'Login crash on iOS 15.6', similarity: 92 },
      { id: '#1544', title: 'iOS bootstrap auth failure', similarity: 87 },
      { id: '#1936', title: 'Crash on credential submit', similarity: 81 },
      { id: '#1987', title: 'Session timeout after login', similarity: 74 },
    ],
    keyInsights: [
      'Most similar ticket: #0010 (92%)',
      'Affects: iOS',
      'First reported: 18 days ago',
      'Reproducible: Yes',
      'Priority: Critical',
    ],
    relatedModules: ['Authentication', 'iOS App', 'Bootstrap', 'Session'],
    report: {
      issueSummary:
        'The iOS application crashes during post-login bootstrap when the session model attempts to read a stale authentication payload.',
      possibleRootCause:
        'The most likely cause is a stale auth payload being loaded during app bootstrap, which causes an invalid cast inside the session initialization flow.',
      recommendedInvestigation: [
        'Compare bootstrap payload structure between working and failing builds.',
        'Validate session storage cleanup before writing the new auth payload.',
        'Inspect iOS crash reports for stale object deserialization failures.',
      ],
      recommendedFix: [
        'Clear legacy auth payloads before persisting the new session.',
        'Add type guards around bootstrap session deserialization.',
        'Backfill regression tests for iOS login bootstrap.',
      ],
      evidence: [
        'Crash occurs after credential submit but before dashboard render.',
        'Logs show stale session data in the iOS bootstrap path.',
        'Historical incidents point to auth payload migration issues.',
      ],
      codeReferences: [
        'IOSSessionBootstrap.swift:44 - stored payload mapping',
        'AuthSessionStore.swift:77 - cache read before overwrite',
        'LoginCoordinator.swift:109 - dashboard transition guard',
      ],
      clientReply:
        'Hi Team,\n\nOur current analysis shows that the iOS crash is happening after authentication succeeds, during the app bootstrap phase. We are reviewing the session initialization path and validating the corrective change now.\n\nRegards,\nSamixa Support',
      redmineComment:
        'AI review suggests a stale auth payload is being read during iOS bootstrap. Engineering is validating a session cleanup change before implementation.',
      closureNotes:
        'Resolved by clearing legacy auth payloads before bootstrapping the new session. Additional iOS bootstrap regression coverage was added.',
      confidence: 84,
    },
    stage: 'analysis',
  }),
  createMockTicket({
    id: '90791',
    number: '#90791',
    title: 'Auto logout issue',
    tracker: 'SR',
    priorityLabel: 'High',
    priorityTone: 'high',
    project: 'Surventis LEANLAB - Mangalore',
    module: 'Session Management',
    statusLabel: 'Code Analysis Running',
    assignedTo: 'Suraj Patil',
    createdAt: '2026-07-22T14:05:00',
    updatedAt: '2026-08-11T08:05:00',
    description:
      'Users are automatically logged out while navigating between screens after approximately 3 to 5 minutes of inactivity.',
    comments: [
      {
        id: '90791-comment-1',
        author: 'Support Analyst',
        badge: 'Internal',
        content: 'Session expiry is earlier than the configured timeout in production.',
        timestamp: '2026-08-11T08:00:00',
      },
      {
        id: '90791-comment-2',
        author: 'Backend Team',
        badge: 'Internal',
        content: 'Refresh token rotation may be failing when the user returns from background state.',
        timestamp: '2026-08-11T08:04:00',
      },
    ],
    attachments: [
      { id: '90791-a1', name: 'session_timeout_trace.txt', size: '10 KB', kind: 'attachment' },
      { id: '90791-a2', name: 'background_resume.mov', size: '5.1 MB', kind: 'attachment' },
    ],
    logs: [
      { id: '90791-l1', name: 'session_rotation.log', size: '19 KB', kind: 'log' },
      { id: '90791-l2', name: 'refresh_failure.log', size: '8 KB', kind: 'log' },
    ],
    similarTickets: [
      { id: '#1987', title: 'Session timeout after login', similarity: 89 },
      { id: '#2041', title: 'Background resume token expiration', similarity: 83 },
      { id: '#1124', title: 'Android token refresh loop', similarity: 77 },
      { id: '#1278', title: 'Session missing after response', similarity: 71 },
    ],
    keyInsights: [
      'Most similar ticket: #1987 (89%)',
      'Affects: iOS, Android',
      'First reported: 20 days ago',
      'Reproducible: Intermittent',
      'Priority: High',
    ],
    relatedModules: ['Session', 'Refresh Token', 'Background Resume', 'Cache'],
    report: {
      issueSummary:
        'Users are being logged out earlier than the configured timeout window while resuming activity after short idle periods.',
      possibleRootCause:
        'The most likely cause is a refresh token rotation mismatch when the app returns from background state and attempts to resume the previous session.',
      recommendedInvestigation: [
        'Verify refresh token rotation behavior on background resume.',
        'Compare configured timeout values with the effective session expiry written to storage.',
        'Review session cache invalidation during app resume.',
      ],
      recommendedFix: [
        'Align effective session expiry with the configured timeout window.',
        'Retry refresh token rotation once before forcing logout.',
        'Add resume-state regression tests for inactive sessions.',
      ],
      evidence: [
        'Users are logged out after 3 to 5 minutes, earlier than expected.',
        'Background resume reproduces the issue more frequently.',
        'Session rotation logs show refresh token write failures.',
      ],
      codeReferences: [
        'SessionCoordinator.ts:112 - resume session path',
        'RefreshTokenService.ts:81 - token rotation write',
        'AppResumeHandler.ts:55 - resume invalidation guard',
      ],
      clientReply:
        'Hi Team,\n\nWe are currently reviewing the auto logout behavior and have identified the session resume path as the most likely failure point. We are validating the timeout and token rotation flow now.\n\nRegards,\nSamixa Support',
      redmineComment:
        'Code analysis is focused on session resume and refresh token rotation paths. Early evidence suggests the effective expiry differs from the configured timeout.',
      closureNotes:
        'Resolved by aligning effective session expiry with the configured timeout and retrying token rotation during resume before logging users out.',
      confidence: 76,
    },
    stage: 'waiting',
  }),
  createMockTicket({
    id: '90745',
    number: '#90745',
    title: 'Session expired error',
    tracker: 'Bug',
    priorityLabel: 'High',
    priorityTone: 'critical',
    project: 'Surventis Tultitlan',
    module: 'Session Validation',
    statusLabel: 'Waiting for Final Report',
    assignedTo: 'Suraj Patil',
    createdAt: '2026-07-20T16:30:00',
    updatedAt: '2026-08-10T18:05:00',
    description:
      'Customers receive a session expired banner immediately after successful login even though a new token was issued by the backend.',
    comments: [
      {
        id: '90745-comment-1',
        author: 'Suraj Patil',
        badge: 'Internal',
        content: 'The banner appears before the home screen finishes loading.',
        timestamp: '2026-08-10T17:41:00',
      },
      {
        id: '90745-comment-2',
        author: 'QA Team',
        badge: 'Internal',
        content: 'Issue reproduced after clearing cache and logging in with production credentials.',
        timestamp: '2026-08-10T17:58:00',
      },
    ],
    attachments: [
      { id: '90745-a1', name: 'session_expired_banner.png', size: '280 KB', kind: 'attachment' },
      { id: '90745-a2', name: 'auth_payload.json', size: '5 KB', kind: 'attachment' },
    ],
    logs: [
      { id: '90745-l1', name: 'session_validator.log', size: '13 KB', kind: 'log' },
      { id: '90745-l2', name: 'response_mapping.log', size: '10 KB', kind: 'log' },
    ],
    similarTickets: [
      { id: '#1987', title: 'Session timeout after login', similarity: 91 },
      { id: '#0012', title: 'Android app crash after login', similarity: 82 },
      { id: '#1278', title: 'Session missing after response', similarity: 79 },
      { id: '#1936', title: 'Crash on credential submit', similarity: 72 },
    ],
    keyInsights: [
      'Most similar ticket: #1987 (91%)',
      'Affects: Web, Mobile',
      'First reported: 22 days ago',
      'Reproducible: Yes',
      'Priority: High',
    ],
    relatedModules: ['Session Validation', 'Auth Payload', 'Home Shell', 'Token Cache'],
    report: {
      issueSummary:
        'Users see a session expired banner immediately after successful login because the session validator marks the freshly issued token as invalid.',
      possibleRootCause:
        'A response-mapping mismatch likely writes a malformed expiry field, causing the session validator to treat the new token as expired during the first protected request.',
      recommendedInvestigation: [
        'Compare backend token expiry payloads with frontend validation expectations.',
        'Trace the first protected request after login to confirm the invalidation point.',
        'Validate expiry parsing for both web and mobile shells.',
      ],
      recommendedFix: [
        'Normalize token expiry fields during response mapping.',
        'Guard the first protected request until token validation completes.',
        'Add regression checks for immediate post-login session validation.',
      ],
      evidence: [
        'The session expired banner appears before the home screen loads.',
        'Fresh tokens are issued successfully by the backend.',
        'Logs show expiry parsing anomalies in the response mapping layer.',
      ],
      codeReferences: [
        'SessionValidator.ts:91 - expiry field validation',
        'AuthResponseMapper.ts:39 - token payload normalization',
        'ProtectedRequest.ts:58 - first post-login request',
      ],
      clientReply:
        'Hi Team,\n\nWe have confirmed that the session expired banner is being triggered during the first post-login validation step, even though the backend is issuing a fresh token. We are validating the frontend session mapping now.\n\nRegards,\nSamixa Support',
      redmineComment:
        'Analysis suggests the response-mapping layer is writing a malformed expiry value, causing new sessions to fail validation immediately after login.',
      closureNotes:
        'Resolved by normalizing the token expiry field before validation and deferring the first protected request until session state is confirmed.',
      confidence: 81,
    },
    stage: 'waiting',
  }),
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

function isServiceRequestLikeTicket(ticket: InvestigationProfileSource): boolean {
  const combined = [ticket.tracker, ticket.title, ticket.description, ...ticket.comments.map((comment) => comment.content)].join(' ').toLowerCase()

  if (/service request|\bsr\b/.test(combined)) {
    return true
  }

  if (/raw material/.test(combined) && /(sync|upload|add|new)/.test(combined)) {
    return true
  }

  if (/request/.test(combined) && /(upload|sync|add|create)/.test(combined) && !/(error|failed|exception|crash|unable)/.test(combined)) {
    return true
  }

  return false
}

function buildConversationGreeting(ticket: InvestigationProfileSource): string {
  const baseName = (ticket.authorName || ticket.customerName || 'Team').trim()
  const firstName = baseName ? baseName.split(/\s+/)[0] : 'Team'
  return `Hi ${firstName},`
}

function buildServiceRequestSeedReply(ticket: InvestigationProfileSource): string {
  const greeting = buildConversationGreeting(ticket)
  const combined = `${ticket.title} ${ticket.description}`.toLowerCase()
  const quantityMatch = combined.match(/\b(\d+)\s+(?:new\s+)?raw materials?\b/)
  const quantity = quantityMatch?.[1] || ''
  const quantityPhrase = quantity ? `${quantity} new Raw Materials` : 'the requested Raw Materials'
  const requestLine =
    quantity
      ? `We have reviewed your request for uploading the ${quantityPhrase} into the Vegam MNG production system.`
      : `We have reviewed your request for ${ticket.title}.`

  if (/raw material/.test(combined) && /(sync|upload)/.test(combined)) {
    return [
      greeting,
      '',
      requestLine,
      '',
      'Work Performed:',
      '- Reviewed the provided Raw Material details.',
      '- Verified the requirement for adding the new materials to the Vegam application.',
      '- Confirmed that the materials can be synchronized using the existing Sync functionality available in the Vegam application.',
      '',
      'Status:',
      `You can sync all ${quantityPhrase} from the Sync tab in the Vegam application.`.replace('all the requested Raw Materials', 'the requested Raw Materials'),
      '',
      'Remarks:',
      'Since the required materials can be synchronized through the existing Sync functionality, no separate bulk upload activity is required from the Vegam Support team.',
      '',
      'Please proceed with the synchronization from your end and let us know if you require any further assistance.',
      '',
      'Regards,',
      'Vegam Support Team',
      ticket.assignedTo || 'Vegam Support',
    ].join('\n')
  }

  return [
    greeting,
    '',
    `We have reviewed your request for ${ticket.title}.`,
    '',
    'Work Performed:',
    '- Reviewed the request details from the current ticket context.',
    '- Validated the requested activity against the available Vegam application flow.',
    '- Prepared the recommended next action for support confirmation.',
    '',
    'Status:',
    'The request has been reviewed and the current recommendation is ready below.',
    '',
    'Remarks:',
    'Please review the recommendation and let us know if the support team should proceed with the next action.',
    '',
    'Regards,',
    'Vegam Support Team',
    ticket.assignedTo || 'Vegam Support',
  ].join('\n')
}

function buildDefaultSimilarTickets(lane: InvestigationLane): SimilarTicket[] {
  if (lane === 'label') {
    return [
      { id: '#7421', title: 'Label template field missing in SAP print request', similarity: 91 },
      { id: '#7550', title: 'Printer routing mismatch for production label output', similarity: 88 },
      { id: '#7688', title: 'Wrong barcode layout after label template update', similarity: 84 },
      { id: '#7812', title: 'Plant-specific printer DPI mismatch in label workflow', similarity: 79 },
    ]
  }

  if (lane === 'integration') {
    return [
      { id: '#6120', title: 'SAP outbound handoff stuck before Vegam acknowledgement', similarity: 90 },
      { id: '#6248', title: 'Interface payload rejected due to mapping mismatch', similarity: 87 },
      { id: '#6395', title: 'Queue retry loop after middleware timeout', similarity: 82 },
      { id: '#6451', title: 'API connector auth failure after endpoint change', similarity: 77 },
    ]
  }

  if (lane === 'maintenance') {
    return [
      { id: '#5304', title: 'PLC signal not creating maintenance event', similarity: 89 },
      { id: '#5417', title: 'IoT connector heartbeat loss hides machine alarm', similarity: 85 },
      { id: '#5532', title: 'Asset downtime trigger not closing work order', similarity: 81 },
      { id: '#5640', title: 'Maintenance threshold rule ignored for live tag', similarity: 76 },
    ]
  }

  if (lane === 'auth') {
    return [
      { id: '#0010', title: 'Login crash on iOS 15.6', similarity: 92 },
      { id: '#0012', title: 'Android app crash after login', similarity: 88 },
      { id: '#1936', title: 'Crash on credential submit', similarity: 85 },
      { id: '#1987', title: 'Session timeout after login', similarity: 78 },
    ]
  }

  return [
    { id: '#4811', title: 'Workflow step fails after operator confirmation', similarity: 86 },
    { id: '#4920', title: 'Plant transaction blocked by business rule mismatch', similarity: 82 },
    { id: '#5034', title: 'Configuration update caused process validation error', similarity: 79 },
    { id: '#5177', title: 'User flow completes partially with no final handoff', similarity: 75 },
  ]
}

function buildDefaultRelatedModules(lane: InvestigationLane, moduleLabel: string): string[] {
  if (lane === 'label') {
    return [moduleLabel, 'Label Template', 'Print Routing', 'Master Data']
  }

  if (lane === 'integration') {
    return [moduleLabel, 'Interface Monitor', 'Middleware', 'SAP Connector']
  }

  if (lane === 'maintenance') {
    return [moduleLabel, 'IoT Connector', 'Asset Signals', 'Maintenance Workflow']
  }

  if (lane === 'auth') {
    return [moduleLabel, 'Authentication', 'Session Store', 'Access Control']
  }

  return [moduleLabel, 'Workflow Engine', 'Configuration', 'Business Rules']
}

function buildDefaultKeyInsights(summary: AssignedTicketResponse, lane: InvestigationLane): string[] {
  const laneLabel =
    lane === 'label'
      ? 'Labeling / printer workflow'
      : lane === 'integration'
        ? 'ERP / interface coordination'
        : lane === 'maintenance'
          ? 'Machine / maintenance workflow'
          : lane === 'auth'
            ? 'Authentication / session flow'
            : 'Application workflow'

  return [
    `Investigation lane: ${laneLabel}`,
    `Current status: ${summary.status || 'Unknown'}`,
    `Priority: ${summary.priority || 'Unknown'}`,
    'Reproducible: Pending confirmation from support',
    'Live ticket data loaded from Redmine',
  ]
}

function buildDefaultReport(ticket: InvestigationProfileSource, stage: MockStage): InvestigationReport {
  const profile = buildInvestigationProfile(ticket)
  const agentScopes = buildAgentScopes(ticket, stage)
  const engineerReview = buildEngineerReviewState(ticket, stage)
  const expertSuggestion = buildDefaultExpertSuggestion(ticket)
  const supportTemplate =
    isServiceRequestLikeTicket(ticket)
      ? 'Service Request template'
      : /incident/i.test(ticket.tracker)
        ? 'Incident template'
        : 'Bug template'

  return {
    issueSummary: ticket.title,
    possibleRootCause:
      `Live ticket details are available, but this case does not yet have a saved investigation pack. The current AI path is focused on ${profile.laneTitle.toLowerCase()} around ${ticket.module.toLowerCase()}, with engineer confirmation still required before communication.`,
    recommendedInvestigation: [
      profile.nextBestAction,
      `Review the latest Redmine comments and reproduction details for ${ticket.project}.`,
      `Validate the full path ${profile.processPath.join(' -> ')} and capture the first failing handoff.`,
      'Rerun only the agents affected when new Redmine evidence arrives, and mark downstream conclusions as stale until refreshed.',
    ],
    recommendedFix: [
      'Confirm the failing configuration, code path, or integration handoff with the assigned engineer.',
      'Document the validated remediation and rollback considerations in Redmine before closure.',
      'Do not finalize the client response until the support engineer accepts the AI synthesis or adds new findings.',
    ],
    evidence: [
      'Live ticket metadata loaded from Redmine.',
      `AI lane selected: ${profile.laneTitle}.`,
      'No saved investigation pack existed, so the workspace was initialized with smart support defaults.',
      `Suggested communication path uses the ${supportTemplate}.`,
    ],
    codeReferences: [
      `Focus on ${ticket.module} and the systems in the mapped process path before linking exact code references.`,
      'Only run deep repository analysis when the workflow controller marks code relevance as required.',
    ],
    clientReply:
      isServiceRequestLikeTicket(ticket)
        ? buildServiceRequestSeedReply(ticket)
        : `Hi Team,\n\nWe have started the investigation for ${ticket.number} and mapped it to our ${profile.laneTitle.toLowerCase()} review flow. The team is validating the exact failure point and will share the confirmed findings and next steps shortly.\n\nRegards,\nSamixa Support`,
    redmineComment:
      `Initial AI investigation lane selected: ${profile.laneTitle}. The workspace is tracing ${profile.processPath.join(' -> ')} and collecting the first confirmed failure point for engineering review.`,
    closureNotes:
      `Before closure, confirm the corrected behavior across the full path ${profile.processPath.join(' -> ')} and attach the final validation note in Redmine.`,
    confidence: 74,
    technicalAnalysisDraft: buildTechnicalAnalysisDraft(ticket),
    agentScopes,
    engineerReview,
    expertSuggestion,
  }
}

function createGenericTicket(summary: AssignedTicketResponse, assignee: string): InvestigationTicket {
  const projectLabel = summary.module || 'Allowed Project'
  const moduleLabel = summary.module || 'Assigned Module'
  const draftTicket: InvestigationProfileSource = {
    id: String(summary.redmine_id),
    number: `#${summary.redmine_id}`,
    title: summary.subject,
    tracker: normalizeTracker(summary.tracker),
    priorityLabel: summary.priority || 'Normal',
    priorityTone: getPriorityTone(summary.priority || 'Normal'),
    project: projectLabel,
    module: moduleLabel,
    statusLabel: summary.status || 'Open',
    assignedTo: summary.assigned_to_name || assignee || 'Unassigned',
    authorName: summary.author_name || summary.customer_name || 'Customer',
    customerName: summary.customer_name || summary.author_name || '',
    createdAt: summary.created_at || '',
    updatedAt: summary.updated_at || '',
    description: summary.description || 'No Redmine description is available for this ticket yet.',
    comments: [],
    attachments: [],
    logs: [],
    similarTickets: [],
    keyInsights: [],
    relatedModules: [],
  }

  const lane = detectInvestigationLane(draftTicket)
  const similarTickets = buildDefaultSimilarTickets(lane)
  const relatedModules = buildDefaultRelatedModules(lane, moduleLabel)
  const baseTicket: InvestigationProfileSource = {
    ...draftTicket,
    similarTickets,
    keyInsights: buildDefaultKeyInsights(summary, lane),
    relatedModules,
  }
  const report = buildDefaultReport(baseTicket, 'analysis')

  return {
    ...baseTicket,
    steps: buildSteps(baseTicket, 'analysis'),
    investigationCards: buildCards(report.agentScopes),
    report,
  }
}

function mergeAssignedTicket(summary: AssignedTicketResponse, assignee: string): InvestigationTicket {
  return createGenericTicket(summary, assignee)
}

function formatFileBytes(value?: number | null): string {
  if (!value || value <= 0) {
    return 'No file size'
  }

  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
  }

  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function inferWorkspaceFileKind(filename: string): 'attachment' | 'log' {
  const normalized = filename.trim().toLowerCase()
  if (
    normalized.endsWith('.log') ||
    normalized.endsWith('.trace') ||
    normalized.includes('trace') ||
    normalized.includes('log')
  ) {
    return 'log'
  }

  return 'attachment'
}

function mapTicketDetailFiles(detail: TicketDetailResponse): { attachments: WorkspaceFile[]; logs: WorkspaceFile[] } {
  const attachments: WorkspaceFile[] = []
  const logs: WorkspaceFile[] = []

  ;(detail.attachments || []).forEach((item) => {
    const kind = inferWorkspaceFileKind(item.filename || '')
    const nextFile: WorkspaceFile = {
      id: String(item.id),
      name: item.filename || 'Unnamed attachment',
      size: formatFileBytes(item.file_size_bytes),
      kind,
      downloadUrl: item.download_url || undefined,
      contentType: item.content_type || undefined,
      author: item.author || undefined,
      createdAt: item.created_at || undefined,
    }

    if (kind === 'log') {
      logs.push(nextFile)
      return
    }

    attachments.push(nextFile)
  })

  return { attachments, logs }
}

function mergeTicketDetail(ticket: InvestigationTicket, detail: TicketDetailResponse): InvestigationTicket {
  const mappedFiles = mapTicketDetailFiles(detail)
  const merged: InvestigationProfileSource = {
    ...ticket,
    title: detail.subject || ticket.title,
    tracker: normalizeTracker(detail.tracker || ticket.tracker),
    priorityLabel: detail.priority || ticket.priorityLabel,
    priorityTone: getPriorityTone(detail.priority || ticket.priorityLabel),
    project: detail.module || ticket.project,
    module: detail.module || ticket.module,
    statusLabel: detail.status || ticket.statusLabel,
    assignedTo: detail.assigned_to_name || ticket.assignedTo,
    authorName: detail.author_name || detail.customer_name || ticket.authorName,
    customerName: detail.customer_name || detail.author_name || ticket.customerName,
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
    attachments: detail.attachments ? mappedFiles.attachments : ticket.attachments,
    logs: detail.attachments ? mappedFiles.logs : ticket.logs,
  }

  const report = buildDefaultReport(merged, 'analysis')

  return {
    ...merged,
    steps: buildSteps(merged, 'analysis'),
    investigationCards: buildCards(report.agentScopes),
    report,
  }
}

function parseDateParts(value: string): { year: string; month: string; day: string; hour: string; minute: string; second: string } | null {
  if (!value) {
    return null
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!match) {
    return null
  }

  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4] || '00',
    minute: match[5] || '00',
    second: match[6] || '00',
  }
}

function parseDateValue(value: string): Date | null {
  const parts = parseDateParts(value)
  if (parts) {
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`)
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDisplayDateTime(value: string): string {
  const parts = parseDateParts(value)
  if (parts) {
    const rawHour = Number(parts.hour)
    const meridiem = rawHour >= 12 ? 'PM' : 'AM'
    const displayHour = rawHour % 12 || 12
    return `${parts.day}/${parts.month}/${parts.year} ${pad(displayHour)}:${parts.minute} ${meridiem}`
  }

  return formatStableDateTime(value)
}

function formatRelativeAge(value: string): string {
  const date = parseDateValue(value)
  if (!date) {
    return 'Unknown'
  }

  const diffMs = Math.max(0, Date.now() - date.getTime())
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  }

  if (diffHours > 0) {
    return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`
  }

  if (diffMinutes > 0) {
    return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`
  }

  return 'Just now'
}

function getUpdatedIndicatorClass(value: string, referenceTimeMs: number | null): string {
  const date = parseDateValue(value)
  if (!date || referenceTimeMs === null) {
    return 'bg-[#64748B]'
  }

  const diffMs = Math.max(0, referenceTimeMs - date.getTime())

  if (diffMs < 86400000) {
    return 'bg-[#22C55E]'
  }

  if (diffMs < 172800000) {
    return 'bg-[#FACC15]'
  }

  return 'bg-[#EF4444]'
}

function isTodayValue(value: string): boolean {
  const date = parseDateValue(value)
  if (!date) {
    return false
  }

  const now = new Date()
  return (
    date.getUTCFullYear() === now.getUTCFullYear()
    && date.getUTCMonth() === now.getUTCMonth()
    && date.getUTCDate() === now.getUTCDate()
  )
}

function toneBadgeClass(tone: TicketPriorityTone): string {
  if (tone === 'critical') {
    return 'border-[#EF4444]/40 bg-[#EF4444]/10 text-[#FCA5A5]'
  }

  if (tone === 'high') {
    return 'border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FCD34D]'
  }

  return 'border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#BFDBFE]'
}

function statusChipClass(status: StepStatus): string {
  if (status === 'done') {
    return 'border-[#22C55E]/20 bg-[#22C55E]/10 text-[#86EFAC]'
  }

  if (status === 'running') {
    return 'border-[#3B82F6]/20 bg-[#3B82F6]/10 text-[#93C5FD]'
  }

  if (status === 'review') {
    return 'border-[#A855F7]/20 bg-[#A855F7]/10 text-[#D8B4FE]'
  }

  if (status === 'pending') {
    return 'border-[#F59E0B]/20 bg-[#F59E0B]/10 text-[#FCD34D]'
  }

  if (status === 'stale') {
    return 'border-[#F97316]/20 bg-[#F97316]/10 text-[#FDBA74]'
  }

  if (status === 'optional') {
    return 'border-[#475569] bg-[#0B1320] text-[#CBD5E1]'
  }

  return 'border-[#334155] bg-[#0B1320] text-[#94A3B8]'
}

function statusLabel(status: StepStatus): string {
  if (status === 'done') {
    return 'Completed'
  }

  if (status === 'running') {
    return 'In Progress'
  }

  if (status === 'review') {
    return 'Needs Review'
  }

  if (status === 'pending') {
    return 'Pending'
  }

  if (status === 'stale') {
    return 'Outdated'
  }

  if (status === 'optional') {
    return 'Conditional'
  }

  return 'Waiting'
}

function investigationCardToneClass(tone: InvestigationCardTone = 'slate'): string {
  if (tone === 'purple') {
    return 'bg-[#8B5CF6]/12 text-[#C4B5FD] border-[#8B5CF6]/20'
  }

  if (tone === 'blue') {
    return 'bg-[#3B82F6]/12 text-[#93C5FD] border-[#3B82F6]/20'
  }

  if (tone === 'green') {
    return 'bg-[#22C55E]/12 text-[#86EFAC] border-[#22C55E]/20'
  }

  if (tone === 'amber') {
    return 'bg-[#F59E0B]/12 text-[#FCD34D] border-[#F59E0B]/20'
  }

  return 'bg-[#1E293B] text-[#CBD5E1] border-[#334155]'
}

function getAffectsLabel(ticket: InvestigationTicket): string {
  const combined = [ticket.description, ...ticket.comments.map((comment) => comment.content)].join(' ').toLowerCase()
  const platforms: string[] = []

  if (combined.includes('ios')) {
    platforms.push('iOS')
  }
  if (combined.includes('android')) {
    platforms.push('Android')
  }
  if (combined.includes('web')) {
    platforms.push('Web')
  }

  return platforms.length > 0 ? platforms.join(', ') : ticket.module
}

function buildConversationStarterMessage(ticket: InvestigationTicket): string {
  const hypothesis = ticket.report.possibleRootCause.trim()
  const nextStep = ticket.report.recommendedInvestigation[0]?.replace(/\.$/, '') || ''
  const parts = [`I reviewed ${ticket.number} and loaded this ticket conversation.`]

  if (hypothesis) {
    parts.push(`The strongest current hypothesis is: ${hypothesis}`)
  }

  if (nextStep) {
    parts.push(`The next best validation is: ${nextStep}.`)
  }

  parts.push(
    'The saved Client Response draft stays separate and I only refresh it when you give verified facts, resolution details, or ask for a rewrite.'
  )

  return parts.join(' ')
}

function buildConversation(ticket: InvestigationTicket): ConversationMessage[] {
  const timestamp = formatDisplayDateTime(new Date().toISOString())

  return [
    {
      author: 'Samixa AI',
      role: 'ai',
      content: buildConversationStarterMessage(ticket),
      timestamp,
      id: `${ticket.id}-conv-starter`,
    },
    {
      author: 'Samixa AI',
      role: 'ai',
      content: 'Hi! How can I help you with this ticket?',
      timestamp,
      id: `${ticket.id}-conv-follow-up`,
    },
  ]
}

function buildConversationReply(ticket: InvestigationTicket, draft: string): string {
  const profile = buildInvestigationProfile(ticket)
  const normalized = draft.toLowerCase()
  const customerName = (ticket.authorName || ticket.customerName || 'Team').trim().split(/\s+/)[0] || 'Team'
  const resolverName = ticket.assignedTo || 'Vegam Support'
  const topEvidence = ticket.report.evidence[0]?.trim() || ''
  const topCodeReference = ticket.report.codeReferences[0]?.trim() || ''
  const nextSteps = ticket.report.recommendedInvestigation.slice(0, 4)
  const strongestHypothesis = ticket.report.possibleRootCause.trim()

  if (/\b(do you know|what is|tell me).*\bmy name\b|\bwho am i\b/.test(normalized)) {
    return `Yes. You are ${ticket.assignedTo || 'the assigned support engineer'} on ${ticket.number}.`
  }

  if (
    /(what do you understand|what did you understand|what you got from this ticket|what you got from this|summarize this ticket|what have you understood)/.test(
      normalized
    )
  ) {
    return [
      `From this ticket, I understand that the user is facing: ${ticket.title}.`,
      '',
      `The strongest current area is ${strongestHypothesis || 'still under validation'}, not a confirmed root cause yet.`,
      '',
      topEvidence ? `The best supporting evidence I have right now is: ${topEvidence}` : '',
      nextSteps[0] ? `The next best validation is: ${nextSteps[0].replace(/\.$/, '')}.` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (
    /(what is the root cause|root cause|analy[sz]e this|analyse this|based on this|based on greenville|based on plant flow|why this error|why application throws)/.test(
      normalized
    )
  ) {
    return [
      `Based on the available ticket evidence, the strongest current hypothesis is: ${strongestHypothesis || 'the required mapping or setup is incomplete.'}`,
      '',
      topEvidence ? `The most relevant evidence I have right now is: ${topEvidence}` : '',
      'At this stage, this should be treated as the strongest current hypothesis, not a confirmed root cause.',
      '',
      nextSteps.length > 0 ? 'Next validation I would do:' : '',
      ...nextSteps.map((step) => `- ${step}`),
      topCodeReference ? '' : '',
      topCodeReference ? `Code reference to validate next: ${topCodeReference}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (
    /(what should i check|what should we check|what should be checked|what next should i check|what should i validate|next validation|validation steps|what next|next checks)/.test(
      normalized
    )
  ) {
    if (nextSteps.length === 0) {
      return 'I do not yet have enough validated evidence to give precise next checks. Please share the latest failing step, screenshot, or log line and I will narrow it down.'
    }

    return ['Here are the next checks I would do for this ticket:', ...nextSteps.map((step) => `- ${step}`)].join('\n')
  }

  if (
    /(real solution|actual solution|closure statement|client response|from our side|from our end|we have done|we did|sync tab)/.test(normalized)
  ) {
    if (/sync raw material|sync raw materials/.test(normalized)) {
      return [
        `Hi ${customerName},`,
        '',
        'We have reviewed your request and completed the required activity.',
        '',
        'Work Performed:',
        '- Reviewed the provided details for the 78 new Raw Materials.',
        '- Synced all 78 new Raw Materials successfully in the Vegam application.',
        '- Verified that the materials are available after synchronization.',
        '',
        'Status:',
        'All 78 new Raw Materials have been successfully synced in the Vegam application.',
        '',
        'Remarks:',
        'For future requirements, the Plant team can directly sync new Raw Materials using the Sync tab available in the Vegam application.',
        '',
        'Please verify from your end and let us know if any further assistance is required.',
        '',
        'Regards,',
        'Vegam Support Team',
        resolverName,
      ].join('\n')
    }

    return `Understood. I treated that as the confirmed resolution for ${ticket.number} and refreshed the closure-oriented draft from it.`
  }

  if (
    /(please consider this content|we checked|we verified|we found|we observed|we confirmed|we identified|works in local|working in local|configuration|mapping|master data|database|sql|code|service|api|integration|interface)/.test(
      normalized
    )
  ) {
    return [
      `I recorded this as a new ticket finding: ${draft.trim()}`,
      '',
      `With that update, the strongest current working hypothesis is: ${strongestHypothesis || 'still being validated.'}`,
      '',
      nextSteps[0] ? `The next best validation is: ${nextSteps[0].replace(/\.$/, '')}.` : '',
      'I did not refresh the saved Client Response draft yet because this is a finding, not a confirmed resolution or rewrite instruction.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (/[?]$/.test(draft.trim()) || /^(why|how|what|where|when)\b/.test(normalized)) {
    return [
      `I am tracking ${ticket.number} against ${ticket.module || ticket.project}.`,
      '',
      `The strongest current hypothesis is: ${strongestHypothesis || 'still being validated.'}`,
      topEvidence ? '' : '',
      topEvidence ? `Best evidence currently matched: ${topEvidence}` : '',
      nextSteps[0] ? '' : '',
      nextSteps[0] ? `Next best validation: ${nextSteps[0].replace(/\.$/, '')}.` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return `Finding recorded. Based on the current evidence, ${ticket.report.possibleRootCause} The next best action is still: ${profile.nextBestAction}`
}

function buildConversationRequestPayload(
  ticket: InvestigationTicket,
  history: ConversationMessage[],
  prompt: string,
  loadOnly = false
): ConversationReplyRequestPayload {
  return {
    prompt,
    load_only: loadOnly,
    history: history.map((message) => ({
      author: message.author,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
    })),
    ticket: {
      id: ticket.id,
      number: ticket.number,
      title: ticket.title,
      tracker: ticket.tracker,
      priority_label: ticket.priorityLabel,
      status_label: ticket.statusLabel,
      project: ticket.project,
      module: ticket.module,
      assigned_to: ticket.assignedTo,
      author_name: ticket.authorName || ticket.customerName || '',
      customer_name: ticket.customerName || ticket.authorName || '',
      description: ticket.description,
      possible_root_cause: ticket.report.possibleRootCause,
      technical_analysis_draft: ticket.report.technicalAnalysisDraft,
      recommended_investigation: ticket.report.recommendedInvestigation,
      recommended_fix: ticket.report.recommendedFix,
      key_insights: ticket.keyInsights,
      similar_tickets: ticket.similarTickets.map((item) => ({
        id: item.id,
        title: item.title,
        similarity: item.similarity,
      })),
      agent_outputs: ticket.report.agentScopes.slice(0, 6).map((scope) => ({
        agent_number: scope.agentNumber,
        title: scope.title,
        status: statusLabel(scope.status),
        summary: scope.summary,
        run_policy: scope.runPolicy,
        evidence_refs: scope.evidenceRefs,
        fields: scope.fields,
      })),
    },
  }
}

function applyConversationReportUpdates(
  ticket: InvestigationTicket,
  updates?: ConversationReplyResponsePayload['report_updates']
): InvestigationTicket {
  if (!updates) {
    return ticket
  }

  return {
    ...ticket,
    keyInsights:
      updates.key_insights && updates.key_insights.length > 0
        ? updates.key_insights
        : ticket.keyInsights,
    report: {
      ...ticket.report,
      clientReply: updates.client_reply || ticket.report.clientReply,
      redmineComment: updates.redmine_comment || ticket.report.redmineComment,
      closureNotes: updates.closure_note || ticket.report.closureNotes,
      possibleRootCause: updates.possible_root_cause || ticket.report.possibleRootCause,
      technicalAnalysisDraft:
        updates.technical_analysis_draft || ticket.report.technicalAnalysisDraft,
      recommendedInvestigation:
        updates.recommended_investigation && updates.recommended_investigation.length > 0
          ? updates.recommended_investigation
          : ticket.report.recommendedInvestigation,
      recommendedFix:
        updates.recommended_fix && updates.recommended_fix.length > 0
          ? updates.recommended_fix
          : ticket.report.recommendedFix,
      evidence:
        updates.evidence && updates.evidence.length > 0
          ? updates.evidence
          : ticket.report.evidence,
      codeReferences:
        updates.code_references && updates.code_references.length > 0
          ? updates.code_references
          : ticket.report.codeReferences,
      engineerReview: {
        ...ticket.report.engineerReview,
        summary: updates.engineer_review_summary || ticket.report.engineerReview.summary,
      },
    },
  }
}

function mapSavedConversationMessages(
  ticketId: string,
  messages: ConversationStateResponsePayload['messages']
): ConversationMessage[] {
  return messages.map((message, index) => ({
    id: `${ticketId}-saved-${index}-${message.timestamp || Date.now()}`,
    author: message.author,
    role: message.role,
    content: message.content,
    timestamp: formatDisplayDateTime(message.timestamp || new Date().toISOString()),
  }))
}

function buildTimeline(ticket: InvestigationTicket): TimelineEntry[] {
  return ticket.steps.map((step, index) => ({
    id: `${ticket.id}-timeline-${step.id}`,
    time: step.timestamp || formatDisplayDateTime(index === 0 ? ticket.createdAt : ticket.updatedAt),
    title: step.label,
    detail: step.objective || (
      step.status === 'done'
        ? 'Completed'
        : step.status === 'running'
          ? 'In progress'
          : step.status === 'pending'
            ? 'Pending'
            : 'Waiting'
    ),
  }))
}

function buildAlternateClientReply(ticket: InvestigationTicket): string {
  return [
    'Hi Team,',
    '',
    `We have reviewed ${ticket.number} and our current investigation points to a likely issue in the ${ticket.module.toLowerCase()} flow.`,
    'We are validating the root cause and recommended correction with the engineering team now.',
    '',
    'We will share the next update once confirmation is complete.',
    '',
    'Regards,',
    'Samixa Support',
  ].join('\n')
}

function buildAlternateRedmineUpdate(ticket: InvestigationTicket): string {
  return `AI investigation is focused on ${ticket.module}. Early evidence points to ${ticket.report.possibleRootCause.toLowerCase()} Engineering validation is still in progress.`
}

function buildAlternateClosure(ticket: InvestigationTicket): string {
  return `Ticket ${ticket.number} can be closed after confirming the ${ticket.module.toLowerCase()} fix in production. Final validation should include the top similar failure paths and updated regression coverage.`
}

function buildExportContent(ticket: InvestigationTicket): string {
  return [
    `Ticket: ${ticket.number}`,
    `Title: ${ticket.title}`,
    `Tracker: ${ticket.tracker}`,
    `Priority: ${ticket.priorityLabel}`,
    `Project: ${ticket.project}`,
    `Module: ${ticket.module}`,
    `Status: ${ticket.statusLabel}`,
    '',
    'Technical Analysis Draft',
    ticket.report.technicalAnalysisDraft,
    '',
    'Engineer Review Gate',
    ticket.report.engineerReview.summary,
    `Status: ${statusLabel(ticket.report.engineerReview.status)}`,
    `Actions: ${ticket.report.engineerReview.actions.join(', ')}`,
    '',
    'Issue Summary',
    ticket.report.issueSummary,
    '',
    'Possible Root Cause',
    ticket.report.possibleRootCause,
    '',
    'Evidence',
    ...ticket.report.evidence.map((item) => `- ${item}`),
    '',
    'Recommended Investigation',
    ...ticket.report.recommendedInvestigation.map((item) => `- ${item}`),
    '',
    'Recommended Fix',
    ...ticket.report.recommendedFix.map((item) => `- ${item}`),
    '',
    'Code References',
    ...ticket.report.codeReferences.map((item) => `- ${item}`),
    '',
    'Agent Scope Ledger',
    ...ticket.report.agentScopes.flatMap((scope) => [
      `Agent ${scope.agentNumber}: ${scope.title}`,
      `Status: ${statusLabel(scope.status)}`,
      `Summary: ${scope.summary}`,
      `Run Policy: ${scope.runPolicy}`,
      ...scope.fields.map((field) => `- ${field.label}: ${field.value}`),
      '',
    ]),
    'Expert Routing',
    `Suggested Expert: ${ticket.report.expertSuggestion.name}`,
    `Reason: ${ticket.report.expertSuggestion.reason}`,
    `References: ${ticket.report.expertSuggestion.references.join(', ')}`,
    '',
    'Client Response',
    ticket.report.clientReply,
    '',
    'Suggested Redmine Note (Copy Only)',
    ticket.report.redmineComment,
    '',
    'Manual Closure Note (Reference Only)',
    ticket.report.closureNotes,
  ].join('\n')
}

function StatusPill(props: { children: string; tone?: 'active' | 'neutral' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
        props.tone === 'active'
          ? 'border-[#3B82F6]/30 bg-[#3B82F6]/10 text-[#BFDBFE]'
          : 'border-[#334155] bg-[#0B1320] text-[#CBD5E1]'
      }`}
    >
      {props.children}
    </span>
  )
}

function SummaryStatCard(props: {
  icon: IconType
  label: string
  value: number
  tone: 'blue' | 'amber' | 'green'
}) {
  const toneClass =
    props.tone === 'blue'
      ? 'border-[#3B82F6]/35 text-[#BFDBFE]'
      : props.tone === 'amber'
        ? 'border-[#F59E0B]/35 text-[#FCD34D]'
        : 'border-[#22C55E]/35 text-[#86EFAC]'

  const Icon = props.icon

  return (
    <div className={`min-w-[180px] rounded-xl border bg-[#0D1726] px-4 py-3 shadow-[0_10px_28px_rgba(1,6,16,0.24)] ${toneClass}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-current/20 bg-[#050B14]">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-sm font-medium text-[#F8FAFC]">
          {props.label}
          <span className="text-[#94A3B8]"> : </span>
          <span>{props.value}</span>
        </p>
      </div>
    </div>
  )
}

function SamixaSidebar(props: {
  onNavigate: (href?: string) => void
  onOpenGuide: () => void
  guideOpen: boolean
  onOpenFeedback: () => void
  feedbackOpen: boolean
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col items-center border-r border-[#1E3047] bg-[#07111F] py-4">
      <div className="flex flex-col items-center gap-4">
        <div
          title="Vegam"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#7F1D1D] bg-[#C1121F] text-base font-black uppercase italic tracking-[0.04em] text-white shadow-[0_10px_22px_rgba(127,29,29,0.38)]"
        >
          V
        </div>

        <nav className="flex flex-col items-center gap-2">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = item.id === 'investigation'

            return (
              <button
                key={item.id}
                onClick={() => props.onNavigate(item.href)}
                title={item.label}
                className={`flex h-11 w-11 items-center justify-center rounded-xl border transition ${
                  isActive
                    ? 'border-[#3B82F6]/40 bg-[#3B82F6]/14 text-[#BFDBFE]'
                    : 'border-transparent bg-transparent text-[#7C8CA3] hover:border-[#1E3047] hover:bg-[#0D1726] hover:text-[#F8FAFC]'
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
              </button>
            )
          })}
        </nav>
      </div>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <button
          onClick={props.onOpenGuide}
          title="Feature Guide"
          className={`flex h-11 w-11 items-center justify-center rounded-xl border transition ${
            props.guideOpen
              ? 'border-[#3B82F6]/40 bg-[#3B82F6]/14 text-[#BFDBFE]'
              : 'border-transparent bg-transparent text-[#7C8CA3] hover:border-[#1E3047] hover:bg-[#0D1726] hover:text-[#F8FAFC]'
          }`}
        >
          <LuInfo className="h-4.5 w-4.5" />
        </button>

        <button
          onClick={props.onOpenFeedback}
          title="Feedback Form"
          className={`flex h-11 w-11 items-center justify-center rounded-xl border transition ${
            props.feedbackOpen
              ? 'border-[#3B82F6]/40 bg-[#3B82F6]/14 text-[#BFDBFE]'
              : 'border-transparent bg-transparent text-[#7C8CA3] hover:border-[#1E3047] hover:bg-[#0D1726] hover:text-[#F8FAFC]'
          }`}
        >
          <LuClipboardList className="h-4.5 w-4.5" />
        </button>
      </div>
    </aside>
  )
}

function TopHeader(props: {
  displayAssignee: string
  greetingLabel: string
  displayRole: string
  assignedCount: number
  pendingCount: number
  resolvedTodayCount: number
  onLogout: () => void
}) {
  const assigneeLabel = props.displayAssignee.trim() || 'Loading Redmine user...'
  const assigneeInitial = assigneeLabel.charAt(0).toUpperCase() || 'R'

  return (
    <header className="sticky top-0 z-30 border-b border-[#1E3047] bg-[#050B14]/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-4 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className="text-[1.05rem] font-semibold text-[#F8FAFC]">Samixa</p>
            <p className="text-xs text-[#E2E8F0]">AI Support Assistant</p>
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 px-2 lg:block">
          <p className="truncate text-[1.45rem] font-semibold text-[#F8FAFC]">{`Hello ${props.greetingLabel}`}</p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <SummaryStatCard icon={LuClipboardList} label="Assigned" value={props.assignedCount} tone="blue" />
          <SummaryStatCard icon={LuClock3} label="Pending" value={props.pendingCount} tone="amber" />
          <SummaryStatCard icon={LuCheck} label="Resolved Today" value={props.resolvedTodayCount} tone="green" />

          <button className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-[#1E3047] bg-[#0D1726] text-[#CBD5E1]">
            <LuBell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#EF4444]" />
          </button>

          <div className="flex items-center gap-3 rounded-xl border border-[#1E3047] bg-[#0D1726] px-3 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#334155] text-sm font-semibold text-[#F8FAFC]">
              {assigneeInitial}
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="max-w-[160px] truncate text-sm font-semibold text-[#F8FAFC]">{assigneeLabel}</p>
              <p className="text-xs text-[#94A3B8]">{props.displayRole}</p>
            </div>
            <LuChevronDown className="hidden h-4 w-4 text-[#64748B] sm:block" />
          </div>

          <button
            onClick={props.onLogout}
            title="Logout"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#7F1D1D] bg-[#3F0D17]/25 px-4 text-sm font-medium text-[#FCA5A5] transition hover:border-[#EF4444]/50 hover:bg-[#7F1D1D]/25 hover:text-[#FECACA]"
          >
            <LuLogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  )
}

function TicketHeader(props: {
  ticket: InvestigationTicket
  statusNotice: string
  onBack: () => void
  onRefresh: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  const handleOpenRedmine = () => {
    if (typeof window === 'undefined') {
      return
    }

    window.open(`https://support.vegam.co/issues/${props.ticket.id}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className={`${PANEL_CLASS} mb-4 px-4 py-3.5`}>
      <div className="flex w-full flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={props.onBack}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1E3047] bg-[#111D2D] text-[#CBD5E1] transition hover:border-[#3B82F6]/40 hover:text-[#F8FAFC]"
            >
              <LuArrowLeft className="h-4 w-4" />
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-lg font-semibold text-[#F8FAFC]">{props.ticket.number}</h3>
              <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] ${toneBadgeClass(props.ticket.priorityTone)}`}>
                {props.ticket.priorityLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[0.72rem] text-[#94A3B8]">
            <span>{`Created: ${formatDisplayDateTime(props.ticket.createdAt)}`}</span>
            <span>{`Project: ${props.ticket.project}`}</span>
            <span>{`Module: ${props.ticket.module}`}</span>
            <span>{`Tracker: ${props.ticket.tracker}`}</span>
            <span>{`Priority: ${props.ticket.priorityLabel}`}</span>
            <span>{`Assigned: ${props.ticket.assignedTo}`}</span>
          </div>

          <p className="text-xs text-[#60A5FA]">{props.statusNotice}</p>
        </div>

        <div className="relative flex items-center gap-2 self-start">
          <StatusPill tone="active">{props.ticket.statusLabel}</StatusPill>

          <button
            onClick={() => setMenuOpen((value) => !value)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1E3047] bg-[#111D2D] px-3 py-2 text-sm text-[#CBD5E1] transition hover:border-[#334155] hover:text-[#F8FAFC]"
          >
            Actions
            <LuChevronDown className="h-4 w-4" />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-12 z-20 min-w-[180px] rounded-xl border border-[#1E3047] bg-[#0D1726] p-2 shadow-[0_18px_36px_rgba(1,6,16,0.45)]">
              <button
                onClick={() => {
                  props.onRefresh()
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#CBD5E1] transition hover:bg-[#111D2D] hover:text-[#F8FAFC]"
              >
                <LuRefreshCw className="h-4 w-4" />
                Refresh from Redmine
              </button>
              <button
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    void navigator.clipboard.writeText(props.ticket.number)
                  }
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#CBD5E1] transition hover:bg-[#111D2D] hover:text-[#F8FAFC]"
              >
                <LuCopy className="h-4 w-4" />
                Copy Ticket ID
              </button>
              <button
                onClick={() => {
                  handleOpenRedmine()
                  setMenuOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#CBD5E1] transition hover:bg-[#111D2D] hover:text-[#F8FAFC]"
              >
                <LuExternalLink className="h-4 w-4" />
                Open in Redmine
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function TicketCard(props: {
  ticket: InvestigationTicket
  index: number
  isSelected: boolean
  onClick: () => void
}) {
  const [referenceTimeMs, setReferenceTimeMs] = useState<number | null>(null)

  useEffect(() => {
    setReferenceTimeMs(Date.now())
  }, [])

  return (
    <button
      onClick={props.onClick}
      className={`flex min-h-[92px] w-[228px] shrink-0 flex-col gap-3 overflow-hidden rounded-xl border px-4 py-3 text-left transition ${
        props.isSelected
          ? 'border-[#3B82F6] bg-[#111D2D] shadow-[0_0_0_1px_rgba(59,130,246,0.25)]'
          : 'border-[#1E3047] bg-[#0D1726] hover:border-[#334155] hover:bg-[#111D2D]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.95rem] font-semibold leading-5 text-[#F8FAFC]">{`T${props.index + 1}: ${props.ticket.tracker} ${props.ticket.number}`}</p>
        <span className={`h-3 w-3 shrink-0 rounded-full ${getUpdatedIndicatorClass(props.ticket.updatedAt, referenceTimeMs)}`} />
      </div>
      <div className="space-y-1 text-xs text-[#94A3B8]">
        <p>{`Created: ${formatRelativeAge(props.ticket.createdAt)}`}</p>
        <p>{`Last updated: ${formatRelativeAge(props.ticket.updatedAt)}`}</p>
      </div>
    </button>
  )
}

function TicketCarousel(props: {
  tickets: InvestigationTicket[]
  selectedTicketId: string
  onSelect: (ticketId: string) => void
}) {
  return (
    <section className={`${PANEL_CLASS} mb-4 overflow-x-auto px-4 py-3`}>
      <div className="flex min-w-max items-stretch gap-3">
        {props.tickets.map((ticket, index) => (
          <TicketCard
            key={ticket.id}
            ticket={ticket}
            index={index}
            isSelected={ticket.id === props.selectedTicketId}
            onClick={() => props.onSelect(ticket.id)}
          />
        ))}
      </div>
    </section>
  )
}

function MetaField(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">{props.label}</p>
      {props.children}
    </div>
  )
}

function TicketDetailsPanel(props: { ticket: InvestigationTicket }) {
  return (
    <aside className={`${PANEL_CLASS} p-4`}>
      <h3 className="mb-5 text-lg font-semibold text-[#F8FAFC]">Ticket Details</h3>

      <div className="space-y-5">
        <MetaField label="Description">
          <p className="text-sm leading-7 text-[#E2E8F0]">{props.ticket.description}</p>
        </MetaField>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <MetaField label="Created">
            <p className="text-sm font-medium text-[#F8FAFC]">{formatDisplayDateTime(props.ticket.createdAt)}</p>
          </MetaField>
          <MetaField label="Updated">
            <p className="text-sm font-medium text-[#F8FAFC]">{formatDisplayDateTime(props.ticket.updatedAt)}</p>
          </MetaField>
        </div>

        <MetaField label="Module">
          <StatusPill>{props.ticket.module}</StatusPill>
        </MetaField>

        <MetaField label="Priority">
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneBadgeClass(props.ticket.priorityTone)}`}>
            {props.ticket.priorityLabel}
          </span>
        </MetaField>

        <MetaField label="Tracker">
          <StatusPill>{props.ticket.tracker}</StatusPill>
        </MetaField>

        <MetaField label="Assignee">
          <StatusPill>{props.ticket.assignedTo}</StatusPill>
        </MetaField>

        <MetaField label="Comments">
          <div className="space-y-3">
            {props.ticket.comments.length > 0 ? props.ticket.comments.map((comment) => (
              <div key={comment.id} className={`${PANEL_SECONDARY_CLASS} p-3`}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#F8FAFC]">{comment.author}</p>
                    <p className="text-xs text-[#94A3B8]">{comment.badge}</p>
                  </div>
                  <StatusPill>{comment.badge}</StatusPill>
                </div>
                <p className="text-sm leading-6 text-[#CBD5E1]">{comment.content}</p>
                <p className="mt-2 text-xs text-[#64748B]">{formatDisplayDateTime(comment.timestamp)}</p>
              </div>
            )) : (
              <div className={`${PANEL_SECONDARY_CLASS} p-3 text-sm text-[#94A3B8]`}>No comments available.</div>
            )}
          </div>
        </MetaField>

        <MetaField label="Attachments">
          <div className="space-y-2">
            {props.ticket.attachments.length > 0 ? props.ticket.attachments.map((file) => (
              <div key={file.id} className={`${PANEL_SECONDARY_CLASS} flex items-center justify-between gap-3 px-3 py-3`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#050B14] text-[#94A3B8]">
                    <LuPaperclip className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#F8FAFC]">{file.name}</p>
                    <p className="text-xs text-[#94A3B8]">{file.size}</p>
                  </div>
                </div>
                <LuDownload className="h-4 w-4 text-[#94A3B8]" />
              </div>
            )) : (
              <div className={`${PANEL_SECONDARY_CLASS} p-3 text-sm text-[#94A3B8]`}>No attachments available.</div>
            )}
          </div>
        </MetaField>
      </div>
    </aside>
  )
}

function InvestigationTabs(props: {
  activeTab: WorkspaceTabId
  onChange: (tabId: WorkspaceTabId) => void
  onExport: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E3047] pb-4">
      <div className="flex flex-wrap gap-6">
        {WORKSPACE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => props.onChange(tab.id)}
            className={`border-b-2 pb-3 text-sm font-medium transition ${
              props.activeTab === tab.id
                ? 'border-[#3B82F6] text-[#BFDBFE]'
                : 'border-transparent text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <button
        onClick={props.onExport}
        className="inline-flex items-center gap-2 rounded-lg border border-[#1E3047] bg-[#111D2D] px-3 py-2 text-sm font-medium text-[#E2E8F0] transition hover:border-[#334155] hover:text-[#F8FAFC]"
      >
        <LuDownload className="h-4 w-4" />
        Export Report
      </button>
    </div>
  )
}

function ProgressStepIcon(props: { status: StepStatus; index: number }) {
  if (props.status === 'done') {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#22C55E] bg-[#22C55E]/12 text-[#86EFAC]">
        <LuCheck className="h-5 w-5" />
      </div>
    )
  }

  if (props.status === 'running') {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#3B82F6] bg-[#3B82F6]/12 text-[#93C5FD] shadow-[0_0_24px_rgba(59,130,246,0.45)]">
        <LuSparkles className="h-5 w-5" />
      </div>
    )
  }

  if (props.status === 'review') {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#A855F7] bg-[#A855F7]/12 text-[#D8B4FE]">
        <LuPencil className="h-5 w-5" />
      </div>
    )
  }

  if (props.status === 'pending') {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#475569] bg-[#0B1320] text-[#CBD5E1]">
        <LuHourglass className="h-5 w-5" />
      </div>
    )
  }

  if (props.status === 'stale') {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#F97316] bg-[#F97316]/12 text-[#FDBA74]">
        <LuRefreshCw className="h-5 w-5" />
      </div>
    )
  }

  if (props.status === 'optional') {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#475569] bg-[#0B1320] text-[#CBD5E1]">
        <LuSearch className="h-5 w-5" />
      </div>
    )
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[#334155] bg-[#0B1320] text-[#94A3B8]">
      <span className="text-sm font-semibold">{props.index + 1}</span>
    </div>
  )
}

function InvestigationProgress(props: { steps: InvestigationStep[] }) {
  return (
    <section className={`${PANEL_SECONDARY_CLASS} p-5`}>
      <div className="mb-5">
        <h3 className="text-2xl font-semibold text-[#F8FAFC]">Investigation Progress</h3>
        <p className="mt-1 text-sm text-[#94A3B8]">
          The workflow follows ticket understanding, knowledge, domain, conditional technical investigation, AI synthesis,
          engineer confirmation, communication, learning, and expert routing.
        </p>
      </div>
      <div className="overflow-x-auto">
        <div className="relative px-4" style={{ minWidth: `${props.steps.length * 170}px` }}>
          <div className="absolute left-[6%] right-[6%] top-6 h-px bg-[#1E3047]" />
          <div
            className="relative grid gap-4"
            style={{ gridTemplateColumns: `repeat(${props.steps.length}, minmax(0, 1fr))` }}
          >
            {props.steps.map((step, index) => (
              <div key={step.id} className="text-center">
                <div className="mb-4 flex justify-center">
                  <ProgressStepIcon status={step.status} index={index} />
                </div>
                <p className="text-sm font-semibold text-[#F8FAFC]">{step.label}</p>
                {step.helper ? <p className="text-sm text-[#CBD5E1]">{step.helper}</p> : null}
                <p className={`mt-2 text-xs font-semibold ${
                  step.status === 'done'
                    ? 'text-[#22C55E]'
                    : step.status === 'running'
                      ? 'text-[#60A5FA]'
                      : step.status === 'review'
                        ? 'text-[#D8B4FE]'
                        : step.status === 'pending'
                          ? 'text-[#F59E0B]'
                          : step.status === 'stale'
                            ? 'text-[#FDBA74]'
                            : step.status === 'optional'
                              ? 'text-[#CBD5E1]'
                              : 'text-[#94A3B8]'
                }`}>
                  {statusLabel(step.status).toUpperCase()}
                </p>
                <p className="mt-1 text-xs text-[#64748B]">{step.timestamp || 'Waiting...'}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function InvestigationCardRow(props: {
  card: InvestigationCard
  onViewDetails: (cardId: InvestigationAgentId) => void
  onRerun: (cardId: InvestigationAgentId, rerunMode?: AgentRerunMode) => void
}) {
  const [showAgentOneRerunOptions, setShowAgentOneRerunOptions] = useState(false)
  const toneClass = investigationCardToneClass(props.card.tone)
  const isRunning = props.card.status === 'running'

  const cardIcon =
    props.card.id === 'ticket-understanding' ? <LuTicket className="h-4 w-4" /> :
    props.card.id === 'historical-knowledge' ? <LuSearch className="h-4 w-4" /> :
    props.card.id === 'domain-knowledge' ? <LuLayoutDashboard className="h-4 w-4" /> :
    props.card.id === 'code-intelligence' ? <LuCode2 className="h-4 w-4" /> :
    props.card.id === 'database-investigation' ? <LuClock3 className="h-4 w-4" /> :
    props.card.id === 'configuration-investigation' ? <LuSettings className="h-4 w-4" /> :
    props.card.id === 'ai-synthesis' ? <LuSparkles className="h-4 w-4" /> :
    props.card.id === 'communication-planner' ? <LuSend className="h-4 w-4" /> :
    props.card.id === 'learning-agent' ? <LuBookOpen className="h-4 w-4" /> :
    props.card.id === 'expert-routing' ? <LuUsers className="h-4 w-4" /> :
    <LuBrain className="h-4 w-4" />

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#1E3047] bg-[#111D2D] px-4 py-4 ${
        isRunning ? 'shadow-[0_0_0_1px_rgba(59,130,246,0.18),0_0_28px_rgba(59,130,246,0.12)]' : ''
      }`}
    >
      <div className="flex min-w-0 items-start gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${toneClass}`}>
          {cardIcon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold text-[#F8FAFC]">{props.card.title}</p>
            <span className="rounded-full border border-[#3B82F6]/20 bg-[#3B82F6]/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#BFDBFE]">
              Agent {props.card.agentNumber}
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#CBD5E1]">{props.card.description}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[#64748B]">{props.card.focus}</p>
          {props.card.note ? <p className="mt-2 text-sm text-[#94A3B8]">{props.card.note}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {props.card.outputs.map((output) => (
              <span
                key={`${props.card.id}-${output}`}
                className="rounded-full border border-[#1E3047] bg-[#0B1220] px-3 py-1 text-xs font-medium text-[#CBD5E1]"
              >
                {output}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {props.card.actionLabel ? (
          <button
            onClick={() => props.onViewDetails(props.card.id)}
            className="rounded-lg border border-[#1E3047] bg-[#0D1726] px-4 py-2 text-sm font-medium text-[#E2E8F0] transition hover:border-[#334155] hover:text-[#F8FAFC]"
          >
            {props.card.actionLabel}
          </button>
        ) : null}

        {props.card.canRerun ? (
          <div className="relative">
            <button
              onClick={() => {
                if (props.card.id === 'ticket-understanding') {
                  setShowAgentOneRerunOptions((value) => !value)
                  return
                }

                props.onRerun(props.card.id, 'selected-agent')
              }}
              className="rounded-lg border border-[#1E3047] bg-[#111D2D] px-4 py-2 text-sm font-medium text-[#E2E8F0] transition hover:border-[#334155] hover:text-[#F8FAFC]"
            >
              {props.card.rerunLabel || 'Run Again'}
            </button>

            {props.card.id === 'ticket-understanding' && showAgentOneRerunOptions ? (
              <div className="absolute right-0 top-12 z-20 flex min-w-[214px] gap-2 rounded-xl border border-[#1E3047] bg-[#0D1726] p-2 shadow-[0_18px_36px_rgba(1,6,16,0.45)]">
                <button
                  type="button"
                  onClick={() => {
                    setShowAgentOneRerunOptions(false)
                    props.onRerun(props.card.id, 'selected-agent')
                  }}
                  className="flex-1 rounded-lg border border-[#1E3047] bg-[#111D2D] px-3 py-2 text-xs font-medium text-[#E2E8F0] transition hover:border-[#334155] hover:text-[#F8FAFC]"
                >
                  Only Agent 1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAgentOneRerunOptions(false)
                    props.onRerun(props.card.id, 'all-agents')
                  }}
                  className="flex-1 rounded-lg border border-[#1E3047] bg-[#111D2D] px-3 py-2 text-xs font-medium text-[#E2E8F0] transition hover:border-[#334155] hover:text-[#F8FAFC]"
                >
                  All the Agents
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusChipClass(props.card.status)}`}>
          {statusLabel(props.card.status)}
        </span>
      </div>
    </div>
  )
}

function InvestigationWorkspacePanel(props: {
  ticket: InvestigationTicket
  onCardAction: (cardId: InvestigationAgentId) => void
  onCardRerun: (cardId: InvestigationAgentId, rerunMode?: AgentRerunMode) => void
}) {
  return (
    <section>
      <div className="mb-4">
        <h3 className="text-2xl font-semibold text-[#F8FAFC]">AI Investigation Control Tower</h3>
        <p className="mt-1 text-sm text-[#94A3B8]">
          The hidden workflow controller decides which agents run, which are conditional, which are outdated, and when the support engineer must approve the next phase.
        </p>
      </div>
      <div className="space-y-3">
        {props.ticket.investigationCards.map((card) => (
          <InvestigationCardRow key={card.id} card={card} onViewDetails={props.onCardAction} onRerun={props.onCardRerun} />
        ))}
      </div>
    </section>
  )
}

function ConfidenceScore(props: { score: number }) {
  const score = Math.max(0, Math.min(100, props.score))
  const degrees = score * 3.6

  return (
    <div className="flex items-center gap-5">
      <div
        className="relative h-28 w-28 rounded-full"
        style={{ background: `conic-gradient(#3B82F6 ${degrees}deg, #132235 ${degrees}deg)` }}
      >
        <div className="absolute inset-[10px] flex items-center justify-center rounded-full bg-[#050B14] text-center">
          <div>
            <p className="text-2xl font-semibold text-[#F8FAFC]">{`${score}%`}</p>
            <p className="text-[0.65rem] uppercase tracking-[0.22em] text-[#94A3B8]">Confidence</p>
          </div>
        </div>
      </div>

      <div className="space-y-2 text-sm text-[#CBD5E1]">
        <p>Confidence is based on similar tickets, logs, code references and current workflow status.</p>
        <p className="text-[#94A3B8]">Higher confidence means the proposed root cause has stronger supporting evidence.</p>
      </div>
    </div>
  )
}

function ReportSectionCard(props: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${PANEL_SECONDARY_CLASS} p-4 ${props.className || ''}`}>
      <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">{props.title}</h4>
      {props.children}
    </section>
  )
}

function GeneratedTextCard(props: {
  title: string
  subtitle?: string
  value: string
  alternateValue?: string
  copyKey: string
  copiedKey: string | null
  onCopy: (key: string, value: string) => void
  extraActions?: Array<{ label: string; onClick: () => void; icon?: IconType }>
}) {
  const [draft, setDraft] = useState(props.value)
  const [editing, setEditing] = useState(false)
  const [alternate, setAlternate] = useState(false)

  useEffect(() => {
    setDraft(props.value)
    setEditing(false)
    setAlternate(false)
  }, [props.value])

  const activeValue = alternate && props.alternateValue ? props.alternateValue : draft

  return (
    <ReportSectionCard title={props.title}>
      {props.subtitle ? <p className="mb-3 text-sm text-[#60A5FA]">{props.subtitle}</p> : null}
      <textarea
        value={activeValue}
        readOnly={!editing}
        onChange={(event) => {
          setAlternate(false)
          setDraft(event.target.value)
        }}
        className="min-h-[168px] w-full resize-none rounded-xl border border-[#1E3047] bg-[#050B14] px-4 py-3 text-sm leading-6 text-[#E2E8F0] outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => props.onCopy(props.copyKey, activeValue)}
          className="inline-flex items-center gap-2 rounded-lg border border-[#1E3047] bg-[#111D2D] px-3 py-2 text-sm text-[#E2E8F0]"
        >
          <LuCopy className="h-4 w-4" />
          {props.copiedKey === props.copyKey ? 'Copied' : 'Copy'}
        </button>

        <button
          onClick={() => setEditing((value) => !value)}
          className="inline-flex items-center gap-2 rounded-lg border border-[#1E3047] bg-[#111D2D] px-3 py-2 text-sm text-[#E2E8F0]"
        >
          <LuPencil className="h-4 w-4" />
          {editing ? 'Done Editing' : 'Edit'}
        </button>

        {props.alternateValue ? (
          <button
            onClick={() => setAlternate((value) => !value)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1E3047] bg-[#111D2D] px-3 py-2 text-sm text-[#E2E8F0]"
          >
            <LuRefreshCw className="h-4 w-4" />
            Regenerate
          </button>
        ) : null}

        {props.extraActions?.map((action) => {
          const Icon = action.icon

          return (
            <button
              key={action.label}
              onClick={action.onClick}
              className="inline-flex items-center gap-2 rounded-lg border border-[#1E3047] bg-[#111D2D] px-3 py-2 text-sm text-[#E2E8F0]"
            >
              {Icon ? <Icon className="h-4 w-4" /> : null}
              {action.label}
            </button>
          )
        })}
      </div>
    </ReportSectionCard>
  )
}

function agentFieldToneClass(tone: AgentScopeField['tone'] = 'default') {
  if (tone === 'accent') {
    return 'border-[#3B82F6]/20 bg-[#3B82F6]/10 text-[#DBEAFE]'
  }

  if (tone === 'warn') {
    return 'border-[#F59E0B]/20 bg-[#F59E0B]/10 text-[#FDE68A]'
  }

  if (tone === 'success') {
    return 'border-[#22C55E]/20 bg-[#22C55E]/10 text-[#BBF7D0]'
  }

  return 'border-[#1E3047] bg-[#050B14] text-[#E2E8F0]'
}

function AgentScopeSection(props: {
  scope: InvestigationAgentScope
  highlighted: boolean
}) {
  return (
    <section
      id={`agent-scope-${props.scope.id}`}
      className={`${PANEL_SECONDARY_CLASS} p-4 transition ${
        props.highlighted ? 'border-[#3B82F6] shadow-[0_0_0_1px_rgba(59,130,246,0.22)]' : ''
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#3B82F6]/20 bg-[#3B82F6]/10 px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#BFDBFE]">
              Agent {props.scope.agentNumber}
            </span>
            <h4 className="text-base font-semibold text-[#F8FAFC]">{props.scope.title}</h4>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#CBD5E1]">{props.scope.summary}</p>
        </div>

        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusChipClass(props.scope.status)}`}>
          {statusLabel(props.scope.status)}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-[#1E3047] bg-[#050B14] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">Run Policy</p>
        <p className="mt-2 text-sm leading-6 text-[#CBD5E1]">{props.scope.runPolicy}</p>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#64748B]">Evidence References</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {props.scope.evidenceRefs.map((reference) => (
            <span
              key={`${props.scope.id}-${reference}`}
              className="rounded-full border border-[#1E3047] bg-[#111D2D] px-3 py-1 text-xs font-medium text-[#CBD5E1]"
            >
              {reference}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {props.scope.fields.map((field) => (
          <div key={`${props.scope.id}-${field.label}`} className={`rounded-xl border px-4 py-3 ${agentFieldToneClass(field.tone)}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94A3B8]">{field.label}</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-6">{field.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function AIReportPanel(props: {
  ticket: InvestigationTicket
  copiedKey: string | null
  onCopy: (key: string, value: string) => void
  selectedScopeId?: InvestigationAgentId | null
}) {
  useEffect(() => {
    if (!props.selectedScopeId || typeof document === 'undefined') {
      return
    }

    const target = document.getElementById(`agent-scope-${props.selectedScopeId}`)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [props.selectedScopeId])

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ReportSectionCard title="Workspace Policy" className="xl:col-span-2">
        <p className="text-sm leading-7 text-[#E2E8F0]">
          This workspace is read-only for Redmine. It can read ticket data and generate suggested text,
          but it does not comment on, update, or close Redmine tickets from this project.
        </p>
      </ReportSectionCard>

      <ReportSectionCard title="Issue Summary">
        <p className="text-sm leading-7 text-[#E2E8F0]">{props.ticket.report.issueSummary}</p>
      </ReportSectionCard>

      <ReportSectionCard title="Possible Root Cause">
        <p className="text-sm leading-7 text-[#E2E8F0]">{props.ticket.report.possibleRootCause}</p>
      </ReportSectionCard>

      <ReportSectionCard title="Confidence Score" className="xl:col-span-2">
        <ConfidenceScore score={props.ticket.report.confidence} />
      </ReportSectionCard>

      <div className="xl:col-span-2 space-y-4">
        {props.ticket.report.agentScopes.map((scope) => (
          <AgentScopeSection
            key={scope.id}
            scope={scope}
            highlighted={props.selectedScopeId === scope.id}
          />
        ))}
      </div>

      <ReportSectionCard title="Evidence">
        <ul className="space-y-2">
          {props.ticket.report.evidence.map((item) => (
            <li key={item} className="flex gap-3 text-sm text-[#E2E8F0]">
              <span className="mt-2 h-2 w-2 rounded-full bg-[#22C55E]" />
              <span className="leading-6">{item}</span>
            </li>
          ))}
        </ul>
      </ReportSectionCard>

      <ReportSectionCard title="Similar Tickets">
        <div className="space-y-3">
          {props.ticket.similarTickets.map((similarTicket) => (
            <div key={similarTicket.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E3047] bg-[#050B14] px-3 py-3">
              <div>
                <p className="font-medium text-[#F8FAFC]">{similarTicket.id}</p>
                <p className="text-sm text-[#CBD5E1]">{similarTicket.title}</p>
              </div>
              <span className="text-sm font-semibold text-[#22C55E]">{`${similarTicket.similarity}%`}</span>
            </div>
          ))}
        </div>
      </ReportSectionCard>

      <ReportSectionCard title="Code References">
        <div className="space-y-2">
          {props.ticket.report.codeReferences.map((reference) => (
            <div key={reference} className="rounded-lg border border-[#1E3047] bg-[#050B14] px-3 py-3 text-sm text-[#E2E8F0]">
              {reference}
            </div>
          ))}
        </div>
      </ReportSectionCard>

      <ReportSectionCard title="Recommended Investigation">
        <ul className="space-y-2">
          {props.ticket.report.recommendedInvestigation.map((item) => (
            <li key={item} className="flex gap-3 text-sm text-[#E2E8F0]">
              <span className="mt-2 h-2 w-2 rounded-full bg-[#3B82F6]" />
              <span className="leading-6">{item}</span>
            </li>
          ))}
        </ul>
      </ReportSectionCard>

      <ReportSectionCard title="Recommended Fix">
        <ul className="space-y-2">
          {props.ticket.report.recommendedFix.map((item) => (
            <li key={item} className="flex gap-3 text-sm text-[#E2E8F0]">
              <span className="mt-2 h-2 w-2 rounded-full bg-[#22C55E]" />
              <span className="leading-6">{item}</span>
            </li>
          ))}
        </ul>
      </ReportSectionCard>

      <ReportSectionCard title="Expert Routing">
        <p className="text-lg font-semibold text-[#F8FAFC]">{props.ticket.report.expertSuggestion.name}</p>
        <p className="mt-2 text-sm leading-6 text-[#CBD5E1]">{props.ticket.report.expertSuggestion.reason}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {props.ticket.report.expertSuggestion.references.map((reference) => (
            <span
              key={`expert-${reference}`}
              className="rounded-full border border-[#3B82F6]/20 bg-[#3B82F6]/10 px-3 py-1 text-xs font-medium text-[#BFDBFE]"
            >
              {reference}
            </span>
          ))}
        </div>
      </ReportSectionCard>

      <div className="xl:col-span-2">
        <GeneratedTextCard
          title="Client Response"
          subtitle="AI Generated"
          value={props.ticket.report.clientReply}
          alternateValue={buildAlternateClientReply(props.ticket)}
          copyKey="client-response"
          copiedKey={props.copiedKey}
          onCopy={props.onCopy}
        />
      </div>

      <GeneratedTextCard
        title="Suggested Redmine Note"
        subtitle="Copy only. This workspace does not write to Redmine."
        value={props.ticket.report.redmineComment}
        alternateValue={buildAlternateRedmineUpdate(props.ticket)}
        copyKey="redmine-update"
        copiedKey={props.copiedKey}
        onCopy={props.onCopy}
      />

      <GeneratedTextCard
        title="Manual Closure Note"
        subtitle="Reference only. Close the ticket manually outside this workspace if needed."
        value={props.ticket.report.closureNotes}
        alternateValue={buildAlternateClosure(props.ticket)}
        copyKey="closure-comment"
        copiedKey={props.copiedKey}
        onCopy={props.onCopy}
      />
    </div>
  )
}

function ConversationPanel(props: {
  messages: ConversationMessage[]
  draft: string
  sending: boolean
  onDraftChange: (value: string) => void
  onSend: () => void
}) {
  return (
    <section className={`${PANEL_SECONDARY_CLASS} flex min-h-[600px] flex-col`}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {props.messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-xl border px-4 py-3 ${
              message.role === 'ai'
                ? 'border-[#1E3047] bg-[#0F1A29] text-left'
                : 'ml-auto border-[#3B82F6]/20 bg-[#3B82F6]/10 text-left'
            }`}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#F8FAFC]">{message.author}</p>
              <p className="text-xs text-[#94A3B8]">{message.timestamp}</p>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-[#E2E8F0]">{message.content}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-[#1E3047] p-4">
        <div className="rounded-xl border border-[#1E3047] bg-[#050B14] px-4 py-3">
          <textarea
            value={props.draft}
            onChange={(event) => props.onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                if (!props.sending) {
                  props.onSend()
                }
              }
            }}
            placeholder="Tell Samixa AI what changed, ask a question, or paste ticket content to rewrite..."
            rows={3}
            className="w-full resize-none bg-transparent text-sm leading-6 text-[#F8FAFC] outline-none placeholder:text-[#64748B]"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-[#64748B]">Live replies use the connected AI provider when available. Press Enter to send.</p>
            <button
              onClick={props.onSend}
              disabled={props.sending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 text-sm font-medium text-white transition hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:bg-[#1E3A8A]"
            >
              {props.sending ? <LuRefreshCw className="h-4 w-4 animate-spin" /> : <LuSend className="h-4 w-4" />}
              <span>{props.sending ? 'Analyzing' : 'Send'}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function TimelinePanel(props: { entries: TimelineEntry[] }) {
  return (
    <section className={`${PANEL_SECONDARY_CLASS} p-5`}>
      <div className="space-y-5">
        {props.entries.map((entry, index) => (
          <div key={entry.id} className="relative flex gap-4">
            {index < props.entries.length - 1 ? (
              <div className="absolute left-[10px] top-8 h-[calc(100%+12px)] w-px bg-[#1E3047]" />
            ) : null}
            <div className="relative z-10 mt-1 h-5 w-5 rounded-full border border-[#3B82F6] bg-[#3B82F6]/14" />
            <div className="rounded-xl border border-[#1E3047] bg-[#050B14] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#60A5FA]">{entry.time}</p>
              <p className="mt-1 font-medium text-[#F8FAFC]">{entry.title}</p>
              <p className="mt-1 text-sm text-[#94A3B8]">{entry.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AttachmentsTabPanel(props: {
  ticket: InvestigationTicket
  downloadingFileId: string | null
  onDownloadFile: (file: WorkspaceFile) => Promise<void>
}) {
  const files = [...props.ticket.attachments, ...props.ticket.logs]

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <ReportSectionCard title="Attachments">
        <div className="space-y-3">
          {props.ticket.attachments.length > 0 ? props.ticket.attachments.map((file) => (
            <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E3047] bg-[#050B14] px-3 py-3">
              <div className="flex items-center gap-3">
                <LuPaperclip className="h-4 w-4 text-[#94A3B8]" />
                <div>
                  <p className="font-medium text-[#F8FAFC]">{file.name}</p>
                  <p className="text-xs text-[#94A3B8]">{file.size}</p>
                </div>
              </div>
              {file.downloadUrl ? (
                <button
                  type="button"
                  onClick={() => void props.onDownloadFile(file)}
                  disabled={props.downloadingFileId === file.id}
                  className="inline-flex items-center gap-2 rounded-md border border-[#1E3047] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] transition hover:border-[#2563EB] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {props.downloadingFileId === file.id ? <LuRefreshCw className="h-3.5 w-3.5 animate-spin" /> : <LuDownload className="h-3.5 w-3.5" />}
                  {props.downloadingFileId === file.id ? 'Downloading...' : 'Download'}
                </button>
              ) : (
                <span className="text-xs text-[#64748B]">Saved metadata only</span>
              )}
            </div>
          )) : <p className="text-sm text-[#94A3B8]">No attachments available.</p>}
        </div>
      </ReportSectionCard>

      <ReportSectionCard title="Logs">
        <div className="space-y-3">
          {props.ticket.logs.length > 0 ? props.ticket.logs.map((file) => (
            <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E3047] bg-[#050B14] px-3 py-3">
              <div className="flex items-center gap-3">
                <LuFileText className="h-4 w-4 text-[#94A3B8]" />
                <div>
                  <p className="font-medium text-[#F8FAFC]">{file.name}</p>
                  <p className="text-xs text-[#94A3B8]">{file.size}</p>
                </div>
              </div>
              {file.downloadUrl ? (
                <button
                  type="button"
                  onClick={() => void props.onDownloadFile(file)}
                  disabled={props.downloadingFileId === file.id}
                  className="inline-flex items-center gap-2 rounded-md border border-[#1E3047] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] transition hover:border-[#2563EB] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {props.downloadingFileId === file.id ? <LuRefreshCw className="h-3.5 w-3.5 animate-spin" /> : <LuDownload className="h-3.5 w-3.5" />}
                  {props.downloadingFileId === file.id ? 'Downloading...' : 'Download'}
                </button>
              ) : (
                <span className="text-xs text-[#64748B]">Saved metadata only</span>
              )}
            </div>
          )) : <p className="text-sm text-[#94A3B8]">No logs available.</p>}
        </div>
      </ReportSectionCard>

      <ReportSectionCard title="All Files" className="xl:col-span-2">
        <div className="space-y-3">
          {files.map((file) => (
            <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#1E3047] bg-[#050B14] px-3 py-3">
              <div className="flex items-center gap-3">
                {file.kind === 'attachment' ? <LuPaperclip className="h-4 w-4 text-[#94A3B8]" /> : <LuFileText className="h-4 w-4 text-[#94A3B8]" />}
                <div>
                  <p className="font-medium text-[#F8FAFC]">{file.name}</p>
                  <p className="text-xs text-[#94A3B8]">{file.size}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill>{file.kind === 'attachment' ? 'Attachment' : 'Log'}</StatusPill>
                {file.downloadUrl ? (
                  <button
                    type="button"
                    onClick={() => void props.onDownloadFile(file)}
                    disabled={props.downloadingFileId === file.id}
                    className="inline-flex items-center gap-2 rounded-md border border-[#1E3047] px-3 py-1.5 text-xs font-medium text-[#CBD5E1] transition hover:border-[#2563EB] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {props.downloadingFileId === file.id ? <LuRefreshCw className="h-3.5 w-3.5 animate-spin" /> : <LuDownload className="h-3.5 w-3.5" />}
                    {props.downloadingFileId === file.id ? 'Downloading...' : 'Download'}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </ReportSectionCard>
    </section>
  )
}

function HistoryPanel(props: { ticket: InvestigationTicket; timeline: TimelineEntry[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ReportSectionCard title="Ticket History">
        <div className="space-y-3 text-sm text-[#E2E8F0]">
          <p>{`Ticket: ${props.ticket.number}`}</p>
          <p>{`Assigned: ${props.ticket.assignedTo}`}</p>
          <p>{`Created: ${formatDisplayDateTime(props.ticket.createdAt)}`}</p>
          <p>{`Updated: ${formatDisplayDateTime(props.ticket.updatedAt)}`}</p>
          <p>{`Current Status: ${props.ticket.statusLabel}`}</p>
        </div>
      </ReportSectionCard>

      <ReportSectionCard title="Activity Snapshot">
        <div className="space-y-3">
          {props.timeline.slice(0, 4).map((entry) => (
            <div key={entry.id} className="rounded-lg border border-[#1E3047] bg-[#050B14] px-3 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#60A5FA]">{entry.time}</p>
              <p className="mt-1 font-medium text-[#F8FAFC]">{entry.title}</p>
              <p className="text-sm text-[#94A3B8]">{entry.detail}</p>
            </div>
          ))}
        </div>
      </ReportSectionCard>
    </div>
  )
}

function SimilarTicketsCard(props: { tickets: SimilarTicket[] }) {
  return (
    <section className={`${PANEL_CLASS} p-4`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-[#F8FAFC]">Past Similar Tickets</h3>
        <LuClipboardList className="h-4 w-4 text-[#64748B]" />
      </div>
      <div className="space-y-3">
        {props.tickets.map((ticket) => (
          <div key={ticket.id} className="flex items-center justify-between gap-3 text-sm">
            <div>
              <p className="font-medium text-[#F8FAFC]">{ticket.id}</p>
              <p className="mt-1 text-[#CBD5E1]">{ticket.title}</p>
            </div>
            <span className="font-semibold text-[#22C55E]">{`${ticket.similarity}%`}</span>
          </div>
        ))}
      </div>
      <button className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#60A5FA] transition hover:text-[#93C5FD]">
        View All Similar Tickets
        <LuExternalLink className="h-4 w-4" />
      </button>
    </section>
  )
}

function KeyInsightsCard(props: { ticket: InvestigationTicket }) {
  const insights = [
    `Most similar ticket: ${props.ticket.similarTickets[0]?.id || '#0000'} (${props.ticket.similarTickets[0]?.similarity || 0}%)`,
    `Affects: ${getAffectsLabel(props.ticket)}`,
    `First reported: ${formatRelativeAge(props.ticket.createdAt)}`,
    `Reproducible: ${props.ticket.comments.length > 0 ? 'Yes' : 'Pending'}`,
    `Priority: ${props.ticket.priorityLabel}`,
  ]

  return (
    <section className={`${PANEL_CLASS} p-4`}>
      <h3 className="mb-4 text-lg font-semibold text-[#F8FAFC]">Key Insights</h3>
      <div className="space-y-3">
        {insights.map((item) => (
          <div key={item} className="flex gap-3 text-sm text-[#E2E8F0]">
            <LuCheck className="mt-1 h-4 w-4 text-[#94A3B8]" />
            <p className="leading-6">{item}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function RelatedModulesCard(props: { modules: string[] }) {
  return (
    <section className={`${PANEL_CLASS} p-4`}>
      <h3 className="mb-4 text-lg font-semibold text-[#F8FAFC]">Related Modules</h3>
      <div className="flex flex-wrap gap-2">
        {props.modules.map((moduleName) => (
          <span
            key={moduleName}
            className="rounded-full border border-[#8B5CF6]/20 bg-[#8B5CF6]/10 px-3 py-1.5 text-xs font-medium text-[#C4B5FD]"
          >
            {moduleName}
          </span>
        ))}
      </div>
    </section>
  )
}

function AttachmentsPanel(props: { ticket: InvestigationTicket }) {
  const files = [...props.ticket.attachments, ...props.ticket.logs].slice(0, 4)

  return (
    <section className={`${PANEL_CLASS} p-4`}>
      <h3 className="mb-4 text-lg font-semibold text-[#F8FAFC]">Logs & Attachments</h3>
      <div className="space-y-3">
        {files.map((file) => (
          <div key={file.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-3">
              {file.kind === 'attachment' ? <LuPaperclip className="h-4 w-4 text-[#94A3B8]" /> : <LuFileText className="h-4 w-4 text-[#94A3B8]" />}
              <div>
                <p className="font-medium text-[#F8FAFC]">{file.name}</p>
                <p className="text-[#94A3B8]">{file.size}</p>
              </div>
            </div>
            <LuDownload className="h-4 w-4 text-[#94A3B8]" />
          </div>
        ))}
      </div>
      <button className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[#60A5FA] transition hover:text-[#93C5FD]">
        View All Attachments
        <LuExternalLink className="h-4 w-4" />
      </button>
    </section>
  )
}

function EvidencePanel(props: { ticket: InvestigationTicket }) {
  return (
    <div className="space-y-4">
      <SimilarTicketsCard tickets={props.ticket.similarTickets} />
      <KeyInsightsCard ticket={props.ticket} />
      <RelatedModulesCard modules={props.ticket.relatedModules} />
      <AttachmentsPanel ticket={props.ticket} />
    </div>
  )
}

function Drawer(props: {
  title: string
  open: boolean
  onClose: () => void
  side: 'left' | 'right'
  mode?: 'drawer' | 'fullscreen'
  maxWidthClass?: string
  children: React.ReactNode
}) {
  if (!props.open) {
    return null
  }

  const isFullscreen = props.mode === 'fullscreen'

  return (
    <div className="fixed inset-0 z-50 bg-[#020617]/70 backdrop-blur-sm">
      <div
        className={
          isFullscreen
            ? 'absolute inset-0 bg-[#050B14] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)]'
            : `absolute top-0 h-full w-[92vw] ${props.maxWidthClass || 'max-w-[360px]'} border-[#1E3047] bg-[#050B14] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.55)] ${
                props.side === 'left' ? 'left-0 border-r' : 'right-0 border-l'
              }`
        }
      >
        <div className={`mb-4 flex items-center justify-between gap-3 ${isFullscreen ? 'border-b border-[#1E3047] pb-4' : ''}`}>
          <h3 className={`${isFullscreen ? 'text-xl' : 'text-lg'} font-semibold text-[#F8FAFC]`}>{props.title}</h3>
          <button
            onClick={props.onClose}
            className="rounded-lg border border-[#1E3047] bg-[#0D1726] px-3 py-2 text-sm text-[#CBD5E1]"
          >
            Close
          </button>
        </div>
        <div className={isFullscreen ? 'h-[calc(100%-72px)] overflow-y-auto pr-1' : 'h-[calc(100%-56px)] overflow-y-auto'}>
          {props.children}
        </div>
      </div>
    </div>
  )
}

export default function InvestigationWorkspace({
  initialTicketId = DEFAULT_TICKET_ID,
  demoMode = false,
}: InvestigationWorkspaceProps) {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const setUser = useAuthStore((state) => state.setUser)
  const displayAssignee = user?.full_name || user?.username || ''
  const greetingLabel = resolveGreetingLabel(user?.email, user?.username, user?.full_name)
  const displayRole = user?.role ? `${user.role.charAt(0).toUpperCase()}${user.role.slice(1)}` : 'Redmine User'

  const routeTicketId = Array.isArray(router.query.ticketId) ? router.query.ticketId[0] : router.query.ticketId
  const activeTicketId = routeTicketId || initialTicketId

  const [tickets, setTickets] = useState<InvestigationTicket[]>(demoMode ? SAVED_TICKETS : [])
  const [selectedTicketId, setSelectedTicketId] = useState<string>(activeTicketId)
  const [sourceMode, setSourceMode] = useState<SourceMode>(demoMode ? 'saved' : 'live')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [reloadCount, setReloadCount] = useState(0)
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>('investigation')
  const [mobilePane, setMobilePane] = useState<MobilePaneId>('investigation')
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false)
  const [showEvidenceDrawer, setShowEvidenceDrawer] = useState(false)
  const [showGuideDrawer, setShowGuideDrawer] = useState(false)
  const [showFeedbackDrawer, setShowFeedbackDrawer] = useState(false)
  const [conversationDraft, setConversationDraft] = useState('')
  const [conversationSending, setConversationSending] = useState(false)
  const [conversationByTicket, setConversationByTicket] = useState<Record<string, ConversationMessage[]>>({})
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null)
  const [selectedAgentScopeId, setSelectedAgentScopeId] = useState<InvestigationAgentId | null>(null)

  useEffect(() => {
    setSelectedTicketId(activeTicketId)
  }, [activeTicketId])

  useEffect(() => {
    setSelectedAgentScopeId(null)
  }, [activeTicketId])

  useEffect(() => {
    if (demoMode || typeof window === 'undefined') {
      return
    }

    const triggerReload = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return
      }

      setReloadCount((value) => value + 1)
    }

    const intervalId = window.setInterval(triggerReload, 90000)
    window.addEventListener('focus', triggerReload)
    document.addEventListener('visibilitychange', triggerReload)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', triggerReload)
      document.removeEventListener('visibilitychange', triggerReload)
    }
  }, [demoMode])

  const handleLogout = () => {
    logout()
    void router.push('/login')
  }

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
        let assigneeName = user?.full_name || user?.username || ''

        if (!assigneeName) {
          try {
            const meResponse = await apiClient.get('/auth/me')
            assigneeName = meResponse.data.full_name || meResponse.data.username || ''
            if (!isCancelled) {
              setUser(meResponse.data)
            }
          } catch {
            if (!isCancelled) {
              logout()
              setTickets([])
              setSelectedTicketId('')
              setSourceMode('live')
              setLoadError('Your Redmine session could not be restored. Please log in again.')
              setLoading(false)
              void router.replace('/login')
            }
            return
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
  }, [activeTicketId, demoMode, logout, reloadCount, router, setUser, user?.full_name, user?.username])

  const selectedTicket = useMemo(() => {
    return tickets.find((ticket) => ticket.id === selectedTicketId) || tickets[0]
  }, [selectedTicketId, tickets])

  useEffect(() => {
    if (!selectedTicket) {
      return
    }

    let isCancelled = false

    const loadConversationState = async () => {
      try {
        const response = await apiClient.post<ConversationReplyResponsePayload>(
          '/agents/conversation/reply',
          buildConversationRequestPayload(selectedTicket, conversationByTicket[selectedTicket.id] || [], '', true)
        )
        if (isCancelled) {
          return
        }

        const loadedMessages =
          (response.data.saved_messages || []).length > 0
            ? mapSavedConversationMessages(selectedTicket.id, response.data.saved_messages || [])
            : [
                {
                  id: `${selectedTicket.id}-starter`,
                  author: 'Samixa AI',
                  role: 'ai' as const,
                  content: response.data.starter_message || buildConversation(selectedTicket)[0]?.content || '',
                  timestamp: formatDisplayDateTime(new Date().toISOString()),
                },
              ]

        setConversationByTicket((current) => ({
          ...current,
          [selectedTicket.id]: loadedMessages,
        }))

        if (response.data.report_updates) {
          setTickets((current) =>
            current.map((ticket) =>
              ticket.id === selectedTicket.id
                ? applyConversationReportUpdates(ticket, response.data.report_updates)
                : ticket
            )
          )
        }
      } catch (err) {
        console.error('Failed to load saved conversation state:', err)
        if (!isCancelled) {
          setConversationByTicket((current) =>
            current[selectedTicket.id]
              ? current
              : {
                  ...current,
                  [selectedTicket.id]: buildConversation(selectedTicket),
                }
          )
        }
      }
    }

    void loadConversationState()

    return () => {
      isCancelled = true
    }
  }, [selectedTicket?.id])

  const assignedCount = tickets.length
  const pendingCount = tickets.filter((ticket) => !/resolved|closed/i.test(ticket.statusLabel)).length
  const resolvedTodayCount = tickets.filter((ticket) => /resolved/i.test(ticket.statusLabel) && isTodayValue(ticket.updatedAt)).length
  const statusNotice = loadError || (sourceMode === 'live' ? 'Live Redmine data loaded successfully.' : sourceMode === 'mixed' ? 'Live Redmine ticket data loaded successfully.' : 'Demo workspace loaded.')

  const selectedConversation = selectedTicket ? conversationByTicket[selectedTicket.id] || buildConversation(selectedTicket) : []
  const selectedTimeline = selectedTicket ? buildTimeline(selectedTicket) : []

  const handleDownloadWorkspaceFile = async (file: WorkspaceFile) => {
    if (!file.downloadUrl) {
      return
    }

    try {
      setDownloadingFileId(file.id)
      const response = await apiClient.get(file.downloadUrl, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data], { type: file.contentType || 'application/octet-stream' }))
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download ticket attachment:', err)
    } finally {
      setDownloadingFileId(null)
    }
  }

  const handleTicketSelect = async (ticketId: string) => {
    setSelectedTicketId(ticketId)
    await router.push(`/investigation/${ticketId}`)
  }

  const handleRefresh = () => {
    setReloadCount((value) => value + 1)
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

  const handleExportReport = () => {
    if (!selectedTicket || typeof window === 'undefined') {
      return
    }

    const blob = new Blob([buildExportContent(selectedTicket)], { type: 'text/plain;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedTicket.number.replace('#', 'ticket-')}-ai-report.txt`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  const handleConversationSend = async () => {
    if (!selectedTicket || !conversationDraft.trim()) {
      return
    }

    const engineerAuthor = user?.email || displayAssignee || 'Support Engineer'
    const engineerMessage: ConversationMessage = {
      id: `${selectedTicket.id}-draft-${Date.now()}`,
      author: engineerAuthor,
      role: 'engineer',
      content: conversationDraft.trim(),
      timestamp: formatDisplayDateTime(new Date().toISOString()),
    }
    const conversationHistory = [...(conversationByTicket[selectedTicket.id] || buildConversation(selectedTicket)), engineerMessage]

    setConversationByTicket((current) => ({
      ...current,
      [selectedTicket.id]: conversationHistory,
    }))
    setConversationDraft('')

    setConversationSending(true)

    try {
      const response = await apiClient.post<ConversationReplyResponsePayload>(
        '/agents/conversation/reply',
        buildConversationRequestPayload(selectedTicket, conversationHistory, engineerMessage.content)
      )

      const aiMessage: ConversationMessage = {
        id: `${selectedTicket.id}-reply-${Date.now()}`,
        author: response.data.author || 'Samixa AI',
        role: 'ai',
        content: response.data.content || buildConversationReply(selectedTicket, engineerMessage.content),
        timestamp: formatDisplayDateTime(response.data.timestamp || new Date().toISOString()),
      }

      if (response.data.report_updates) {
        setTickets((current) =>
          current.map((ticket) =>
            ticket.id === selectedTicket.id
              ? applyConversationReportUpdates(ticket, response.data.report_updates)
              : ticket
          )
        )
      }

      setConversationByTicket((current) => ({
        ...current,
        [selectedTicket.id]: [...(current[selectedTicket.id] || conversationHistory), aiMessage],
      }))
    } catch (err) {
      console.error('Failed to generate conversation reply:', err)
      const aiMessage: ConversationMessage = {
        id: `${selectedTicket.id}-reply-error-${Date.now()}`,
        author: 'Samixa AI',
        role: 'ai',
        content: buildConversationReply(selectedTicket, engineerMessage.content),
        timestamp: formatDisplayDateTime(new Date().toISOString()),
      }

      setConversationByTicket((current) => ({
        ...current,
        [selectedTicket.id]: [...(current[selectedTicket.id] || conversationHistory), aiMessage],
      }))
    } finally {
      setConversationSending(false)
    }
  }

  const handleSidebarNavigate = (href?: string) => {
    if (!href) {
      return
    }

    void router.push(href)
  }

  const handleOpenGuideDrawer = () => {
    setShowFeedbackDrawer(false)
    setShowGuideDrawer(true)
  }

  const handleOpenFeedbackDrawer = () => {
    setShowGuideDrawer(false)
    setShowFeedbackDrawer(true)
  }

  const handleCardAction = (cardId: InvestigationAgentId) => {
    setSelectedAgentScopeId(cardId)
    setActiveTab('report')
  }

  const handleCardRerun = (cardId: InvestigationAgentId, rerunMode: AgentRerunMode = 'selected-agent') => {
    setTickets((current) =>
      current.map((ticket) => (ticket.id === selectedTicketId ? simulateAgentRerun(ticket, cardId, rerunMode) : ticket))
    )
    setSelectedAgentScopeId(cardId)
  }

  const renderInvestigationCenter = () => {
    if (!selectedTicket) {
      return null
    }

    if (activeTab === 'report') {
      return (
        <AIReportPanel
          ticket={selectedTicket}
          copiedKey={copiedKey}
          onCopy={(key, value) => void handleCopy(key, value)}
          selectedScopeId={selectedAgentScopeId}
        />
      )
    }

    if (activeTab === 'conversation') {
      return (
        <ConversationPanel
          messages={selectedConversation}
          draft={conversationDraft}
          sending={conversationSending}
          onDraftChange={setConversationDraft}
          onSend={() => void handleConversationSend()}
        />
      )
    }

    if (activeTab === 'timeline') {
      return <TimelinePanel entries={selectedTimeline} />
    }

    if (activeTab === 'attachments') {
      return (
        <AttachmentsTabPanel
          ticket={selectedTicket}
          downloadingFileId={downloadingFileId}
          onDownloadFile={handleDownloadWorkspaceFile}
        />
      )
    }

    if (activeTab === 'history') {
      return <HistoryPanel ticket={selectedTicket} timeline={selectedTimeline} />
    }

    return (
      <div className="space-y-6">
        <InvestigationProgress steps={selectedTicket.steps} />
        <InvestigationWorkspacePanel
          ticket={selectedTicket}
          onCardAction={handleCardAction}
          onCardRerun={handleCardRerun}
        />
      </div>
    )
  }

  if (!demoMode && loading && !displayAssignee) {
    return (
      <div className="min-h-screen bg-[#050B14] flex items-center justify-center text-[#F8FAFC]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-[#3B82F6]"></div>
          <p className="text-sm text-[#94A3B8]">Loading your Redmine workspace...</p>
        </div>
      </div>
    )
  }

  if (!selectedTicket) {
    return (
      <>
        <Head>
          <title>AI Investigation Workspace</title>
        </Head>

        <div className="min-h-screen bg-[#050B14] text-[#F8FAFC]">
          <SamixaSidebar
            onNavigate={handleSidebarNavigate}
            onOpenGuide={handleOpenGuideDrawer}
            guideOpen={showGuideDrawer}
            onOpenFeedback={handleOpenFeedbackDrawer}
            feedbackOpen={showFeedbackDrawer}
          />
          <div className="pl-16">
            <TopHeader
              displayAssignee={displayAssignee}
              greetingLabel={greetingLabel}
              displayRole={displayRole}
              assignedCount={assignedCount}
              pendingCount={pendingCount}
              resolvedTodayCount={resolvedTodayCount}
              onLogout={handleLogout}
            />

            <main className="px-5 py-5">
              <div className={`${PANEL_CLASS} px-6 py-12 text-center`}>
                <h2 className="text-2xl font-semibold text-[#F8FAFC]">
                  {loading ? 'Loading your Redmine tickets...' : 'No matching Redmine tickets found'}
                </h2>
                <p className="mt-3 text-sm text-[#94A3B8]">
                  {loadError || 'There are no assigned tickets matching the current project, status, and tracker filters.'}
                </p>
              </div>
            </main>
          </div>

          <Drawer
            title="Samixa Guide"
            open={showGuideDrawer}
            onClose={() => setShowGuideDrawer(false)}
            side="left"
            mode="fullscreen"
            maxWidthClass="max-w-[560px]"
          >
            <InfoDrawerContent
              navigationItems={SIDEBAR_ITEMS.map((item) => ({ id: item.id, label: item.label }))}
              tabs={WORKSPACE_TABS}
            />
          </Drawer>

          <Drawer
            title="Samixa Feedback"
            open={showFeedbackDrawer}
            onClose={() => setShowFeedbackDrawer(false)}
            side="left"
            maxWidthClass="max-w-[480px]"
          >
            <FeedbackDrawerContent open={showFeedbackDrawer} />
          </Drawer>
        </div>
      </>
    )
  }

  return (
    <>
      <Head>
        <title>{`${selectedTicket.number} | AI Investigation Workspace`}</title>
      </Head>

      <div className="min-h-screen bg-[#050B14] text-[#F8FAFC]">
        <SamixaSidebar
          onNavigate={handleSidebarNavigate}
          onOpenGuide={handleOpenGuideDrawer}
          guideOpen={showGuideDrawer}
          onOpenFeedback={handleOpenFeedbackDrawer}
          feedbackOpen={showFeedbackDrawer}
        />

        <div className="pl-16">
          <TopHeader
            displayAssignee={displayAssignee}
            greetingLabel={greetingLabel}
            displayRole={displayRole}
            assignedCount={assignedCount}
            pendingCount={pendingCount}
            resolvedTodayCount={resolvedTodayCount}
            onLogout={handleLogout}
          />

          <main className="px-5 py-5">
            <TicketCarousel
              tickets={tickets}
              selectedTicketId={selectedTicket.id}
              onSelect={(ticketId) => void handleTicketSelect(ticketId)}
            />

            <TicketHeader
              ticket={selectedTicket}
              statusNotice={statusNotice}
              onBack={() => void router.push('/dashboard')}
              onRefresh={handleRefresh}
            />

            <div className="mb-4 flex gap-2 md:hidden">
              {([
                ['ticket', 'Ticket'],
                ['investigation', 'Investigation'],
                ['evidence', 'Evidence'],
              ] as Array<[MobilePaneId, string]>).map(([paneId, label]) => (
                <button
                  key={paneId}
                  onClick={() => setMobilePane(paneId)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                    mobilePane === paneId
                      ? 'border-[#3B82F6] bg-[#3B82F6]/12 text-[#BFDBFE]'
                      : 'border-[#1E3047] bg-[#0D1726] text-[#94A3B8]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-4 hidden items-center justify-end gap-2 md:flex xl:hidden">
              <button
                onClick={() => setShowDetailsDrawer(true)}
                className="rounded-lg border border-[#1E3047] bg-[#0D1726] px-3 py-2 text-sm text-[#CBD5E1] lg:hidden"
              >
                Ticket Details
              </button>
              <button
                onClick={() => setShowEvidenceDrawer(true)}
                className="rounded-lg border border-[#1E3047] bg-[#0D1726] px-3 py-2 text-sm text-[#CBD5E1] lg:hidden"
              >
                Evidence & Insights
              </button>
              <button
                onClick={() => setShowDetailsDrawer(true)}
                className="rounded-lg border border-[#1E3047] bg-[#0D1726] px-3 py-2 text-sm text-[#CBD5E1] xl:hidden lg:inline-flex"
              >
                Ticket Details
              </button>
            </div>

            <div className="md:hidden">
              {mobilePane === 'ticket' ? <TicketDetailsPanel ticket={selectedTicket} /> : null}
              {mobilePane === 'investigation' ? (
                <section className={`${PANEL_CLASS} p-4`}>
                  <InvestigationTabs
                    activeTab={activeTab}
                    onChange={setActiveTab}
                    onExport={handleExportReport}
                  />
                  <div className="mt-5">{renderInvestigationCenter()}</div>
                </section>
              ) : null}
              {mobilePane === 'evidence' ? <EvidencePanel ticket={selectedTicket} /> : null}
            </div>

            <div className="hidden gap-4 md:grid xl:grid-cols-[260px_minmax(600px,1fr)_300px] lg:grid-cols-[minmax(600px,1fr)_300px]">
              <div className="hidden xl:block">
                <TicketDetailsPanel ticket={selectedTicket} />
              </div>

              <section className={`${PANEL_CLASS} p-5`}>
                <InvestigationTabs
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  onExport={handleExportReport}
                />
                <div className="mt-5">{renderInvestigationCenter()}</div>
              </section>

              <div className="hidden lg:block">
                <EvidencePanel ticket={selectedTicket} />
              </div>
            </div>
          </main>
        </div>

        <Drawer
          title="Ticket Details"
          open={showDetailsDrawer}
          onClose={() => setShowDetailsDrawer(false)}
          side="left"
        >
          <TicketDetailsPanel ticket={selectedTicket} />
        </Drawer>

        <Drawer
          title="Evidence & Insights"
          open={showEvidenceDrawer}
          onClose={() => setShowEvidenceDrawer(false)}
          side="right"
        >
          <EvidencePanel ticket={selectedTicket} />
        </Drawer>

        <Drawer
          title="Samixa Guide"
          open={showGuideDrawer}
          onClose={() => setShowGuideDrawer(false)}
          side="left"
          mode="fullscreen"
          maxWidthClass="max-w-[560px]"
        >
          <InfoDrawerContent
            navigationItems={SIDEBAR_ITEMS.map((item) => ({ id: item.id, label: item.label }))}
            tabs={WORKSPACE_TABS}
          />
        </Drawer>

        <Drawer
          title="Samixa Feedback"
          open={showFeedbackDrawer}
          onClose={() => setShowFeedbackDrawer(false)}
          side="left"
          maxWidthClass="max-w-[480px]"
        >
          <FeedbackDrawerContent open={showFeedbackDrawer} />
        </Drawer>
      </div>
    </>
  )
}
