import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import {
  LuArrowLeft,
  LuAlertCircle,
  LuClock3,
  LuRefreshCw,
  LuTicket,
  LuUsers,
} from 'react-icons/lu'

import apiClient from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface TeamTicket {
  id: number
  redmine_id: number
  subject: string
  tracker: string
  priority: string
  status: string
  project: string
  module: string
  description: string
  created_at: string
  updated_at: string
  author: string
  assignee_name: string
  assignee_redmine_id: number | null
}

interface TeamMemberRow {
  row_key: string
  assignee_name: string
  display_name: string
  redmine_assignee_id: number | null
  tickets: TeamTicket[]
  ticket_count: number
  pending_count: number
  critical_count: number
  is_viewer: boolean
}

interface TeamTicketsResponse {
  viewer_id: number
  total_members: number
  total_tickets: number
  pending_tickets: number
  critical_tickets: number
  team_members: TeamMemberRow[]
}

function formatRelativeDate(value: string) {
  if (!value) {
    return 'Not available'
  }

  try {
    return `${formatDistanceToNowStrict(parseISO(value))} ago`
  } catch {
    return 'Not available'
  }
}

function capitalizeWord(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : ''
}

function formatMemberName(member: TeamMemberRow) {
  const source = (member.display_name || member.assignee_name || 'Team Member').trim()

  if (!source.includes('@')) {
    return source
  }

  const localPart = source.split('@')[0]
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(capitalizeWord)
    .join(' ')
}

function getPriorityBadge(priority: string) {
  if (/critical|urgent/i.test(priority)) {
    return 'border-red-500/30 bg-red-500/10 text-red-200'
  }

  if (/high/i.test(priority)) {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-200'
  }

  return 'border-slate-700 bg-slate-800 text-slate-300'
}

function getStatusDot(status: string) {
  if (/closed|resolved|completed/i.test(status)) {
    return 'bg-emerald-400'
  }

  if (/pending|awaited|waiting/i.test(status)) {
    return 'bg-amber-400'
  }

  return 'bg-rose-400'
}

export default function TeamLeadDashboard() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const setUser = useAuthStore((state) => state.setUser)

  const [teamData, setTeamData] = useState<TeamTicketsResponse | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null

    if (!token) {
      void router.replace('/login')
      return
    }

    if (user) {
      setAuthLoading(false)
      return
    }

    const loadCurrentUser = async () => {
      try {
        const response = await apiClient.get('/auth/me')
        setUser(response.data)
      } catch (err) {
        console.error('Failed to restore session for team dashboard:', err)
        logout()
        void router.replace('/login')
      } finally {
        setAuthLoading(false)
      }
    }

    void loadCurrentUser()
  }, [logout, router, setUser, user])

  useEffect(() => {
    if (authLoading || !user) {
      return
    }

    void loadTeamRows()
  }, [authLoading, user])

  const loadTeamRows = async () => {
    setError('')
    setLoading(true)
    setRefreshing(true)

    try {
      const response = await apiClient.get<TeamTicketsResponse>('/team-lead/team-tickets')
      setTeamData(response.data)
    } catch (err: any) {
      console.error('Failed to load team tickets:', err)
      setError(err.response?.data?.detail || 'Failed to load team member ticket rows')
      setTeamData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleLogout = () => {
    logout()
    void router.push('/login')
  }

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }

    void router.push('/dashboard')
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
          <p className="text-slate-400">Restoring your session...</p>
        </div>
      </div>
    )
  }

  const members = teamData?.team_members || []

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-start gap-3">
            <button
              onClick={handleBack}
              aria-label="Go back"
              className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-200 transition hover:border-slate-600 hover:bg-slate-700 hover:text-white"
            >
              <LuArrowLeft className="h-5 w-5" />
            </button>

            <div>
              <h1 className="text-3xl font-bold text-white">Teams</h1>
              <p className="mt-1 text-sm text-slate-400">
                Each row is grouped from Redmine query 577 by the exact assignee shown in your tasks list.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-right">
              <p className="text-sm font-medium text-white">{user?.full_name || user?.username}</p>
              <p className="text-xs text-slate-400">{user?.email}</p>
            </div>

            <button
              onClick={() => void loadTeamRows()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:border-slate-600 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <LuRefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh Team Rows'}
            </button>

            <button
              onClick={() => void router.push('/dashboard')}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:border-slate-600 hover:bg-slate-700"
            >
              My Queue
            </button>

            <button
              onClick={handleLogout}
              className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<LuUsers className="h-5 w-5 text-blue-300" />}
            label="Assignee Rows"
            value={teamData?.total_members ?? members.length}
            helper="Distinct assignees returned by query 577"
            tone="blue"
          />
          <MetricCard
            icon={<LuTicket className="h-5 w-5 text-emerald-300" />}
            label="Assigned Tickets"
            value={teamData?.total_tickets ?? 0}
            helper="Visible cards across the full team"
            tone="green"
          />
          <MetricCard
            icon={<LuClock3 className="h-5 w-5 text-amber-300" />}
            label="Pending Tickets"
            value={teamData?.pending_tickets ?? 0}
            helper="Still waiting for action or closure"
            tone="amber"
          />
          <MetricCard
            icon={<LuAlertCircle className="h-5 w-5 text-rose-300" />}
            label="High / Critical"
            value={teamData?.critical_tickets ?? 0}
            helper="Priority cards needing faster attention"
            tone="rose"
          />
        </section>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/60">
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
              <p className="text-slate-400">Loading team ticket rows...</p>
            </div>
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-12 text-center">
            <h2 className="text-xl font-semibold text-white">No team members found</h2>
            <p className="mt-2 text-sm text-slate-400">
              The Redmine query did not return any assigned tickets to group into rows.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {members.map((member) => (
              <section key={member.row_key} className="rounded-3xl border border-slate-800 bg-slate-900/65 p-5 shadow-[0_12px_40px_rgba(2,6,23,0.3)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/20 text-lg font-semibold text-blue-200">
                      {formatMemberName(member).charAt(0).toUpperCase()}
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold text-white">{formatMemberName(member)}</h2>
                        {member.is_viewer && (
                          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-200">
                            You
                          </span>
                        )}
                        <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                          Assignee
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-400">Grouped exactly as shown in the Redmine assignee column.</p>
                      <p className="mt-2 text-xs text-slate-500">
                        Redmine Assignee ID: {member.redmine_assignee_id ?? 'Not available'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SummaryBadge label="Assigned" value={member.ticket_count} tone="blue" />
                    <SummaryBadge label="Pending" value={member.pending_count} tone="amber" />
                    <SummaryBadge label="High / Critical" value={member.critical_count} tone="rose" />
                  </div>
                </div>

                {member.tickets.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 px-5 py-8 text-center">
                    <p className="text-sm font-medium text-slate-200">No assigned tickets for this member right now.</p>
                    <p className="mt-2 text-xs text-slate-500">
                      When Redmine assigns matching tickets to this user, the cards will appear in this row.
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 overflow-x-auto pb-2">
                    <div className="flex min-w-max gap-4">
                      {member.tickets.map((ticket, index) => (
                        <article
                          key={`${member.row_key}-${ticket.redmine_id}`}
                          className="w-[290px] rounded-2xl border border-slate-700 bg-[#0f1a2b] p-4 shadow-[0_10px_30px_rgba(2,6,23,0.25)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-semibold text-white">
                                T{index + 1}: {ticket.tracker} #{ticket.redmine_id}
                              </p>
                              <p className="mt-2 line-clamp-2 text-sm text-slate-300">
                                {ticket.subject || 'Untitled Redmine ticket'}
                              </p>
                            </div>
                            <span className={`mt-1 h-3.5 w-3.5 rounded-full ${getStatusDot(ticket.status)}`}></span>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
                              {ticket.status}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getPriorityBadge(ticket.priority)}`}>
                              {ticket.priority || 'Normal'}
                            </span>
                          </div>

                          <p className="mt-4 text-xs text-slate-400">Created: {formatRelativeDate(ticket.created_at)}</p>
                          <p className="mt-1 text-xs text-slate-400">Last updated: {formatRelativeDate(ticket.updated_at)}</p>

                          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Project / Module</p>
                            <p className="mt-1 text-sm text-slate-200">{ticket.project || 'No project recorded'}</p>
                            <p className="mt-1 text-xs text-slate-400">{ticket.module || 'No module recorded'}</p>
                          </div>

                          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Author</p>
                            <p className="mt-1 text-sm text-slate-300">{ticket.author || 'Not available'}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: number
  helper: string
  tone: 'blue' | 'green' | 'amber' | 'rose'
}) {
  const tones = {
    blue: 'border-blue-500/20 bg-blue-500/5',
    green: 'border-emerald-500/20 bg-emerald-500/5',
    amber: 'border-amber-500/20 bg-amber-500/5',
    rose: 'border-rose-500/20 bg-rose-500/5',
  }

  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-300">{label}</p>
        <div>{icon}</div>
      </div>
      <p className="mt-4 text-3xl font-bold text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{helper}</p>
    </div>
  )
}

function SummaryBadge({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'blue' | 'amber' | 'rose'
}) {
  const tones = {
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-200',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
    rose: 'border-rose-500/20 bg-rose-500/10 text-rose-200',
  }

  return (
    <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${tones[tone]}`}>
      {label}: {value}
    </div>
  )
}
