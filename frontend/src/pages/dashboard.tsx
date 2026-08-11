import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

import apiClient from '@/lib/api'
import { formatStableDateTime } from '@/lib/datetime'
import { useAuthStore } from '@/lib/store'

interface TicketSummary {
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

export default function Dashboard() {
  const router = useRouter()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const setUser = useAuthStore((state) => state.setUser)

  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [authLoading, setAuthLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null

    if (!token) {
      router.replace('/login')
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
        console.error('Failed to restore session:', err)
        logout()
        router.replace('/login')
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

    void syncAndFetchTickets()
  }, [authLoading, user])

  const syncAndFetchTickets = async () => {
    setError('')
    setLoading(true)
    setSyncing(true)

    try {
      await apiClient.post('/tickets/sync')
    } catch (err) {
      console.error('Failed to sync Redmine tickets:', err)
    } finally {
      setSyncing(false)
    }

    try {
      const response = await apiClient.get('/tickets/assigned')
      setTickets(response.data.tickets || [])
    } catch (err: any) {
      console.error('Failed to fetch assigned tickets:', err)
      setError(err.response?.data?.detail || 'Failed to load your assigned tickets')
      setTickets([])
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const inProgressCount = tickets.filter((ticket) => ticket.status === 'In Progress').length
  const highPriorityCount = tickets.filter((ticket) => /high|urgent|critical/i.test(ticket.priority)).length
  const projectCount = new Set(tickets.map((ticket) => ticket.module)).size

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Restoring your session...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              S
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Samixa Dashboard</h1>
              <p className="text-sm text-slate-400">Showing the tickets assigned to the logged-in Redmine user</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-right">
              <p className="text-sm font-medium text-white">{user?.full_name || 'Support Engineer'}</p>
              <p className="text-xs text-slate-400">@{user?.username}</p>
            </div>

            <button
              onClick={() => void syncAndFetchTickets()}
              disabled={syncing}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {syncing ? 'Syncing...' : 'Sync My Tickets'}
            </button>

            <button
              onClick={() => router.push('/team-dashboard')}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:border-slate-600 hover:bg-slate-700"
            >
              Team Dashboard
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
        <section className="mb-8">
          <h2 className="text-3xl font-bold text-white">Assigned Tickets</h2>
          <p className="mt-2 text-sm text-slate-400">
            Dashboard data is filtered to the tickets currently assigned to your Redmine account.
          </p>
        </section>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <MetricCard label="Assigned to You" value={tickets.length} accent="blue" />
          <MetricCard label="In Progress" value={inProgressCount} accent="orange" />
          <MetricCard label="High Priority" value={highPriorityCount} accent="red" />
        </section>

        <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Scope</h3>
              <p className="mt-2 text-sm text-slate-200">
                Showing tickets from <span className="font-semibold text-white">{projectCount || 0}</span> project
                {projectCount === 1 ? '' : 's'} for <span className="font-semibold text-white">{user?.full_name || user?.username}</span>.
              </p>
            </div>
            <button
              onClick={() => router.push('/workspace')}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-700"
            >
              Open Workspace Mock
            </button>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Your Ticket Queue</h3>
            {loading && <span className="text-sm text-slate-400">Loading latest assignments...</span>}
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-12 text-center">
              <h4 className="text-lg font-semibold text-white">No assigned tickets found</h4>
              <p className="mt-2 text-sm text-slate-400">
                We checked Redmine and there are no active, non-internal tickets assigned to your account right now.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <button
                  key={ticket.redmine_id}
                  onClick={() => router.push(`/investigation/${ticket.redmine_id}`)}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-left transition hover:border-blue-500/50 hover:bg-slate-800/80"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-200">
                          {ticket.tracker} #{ticket.redmine_id}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          /high|urgent|critical/i.test(ticket.priority)
                            ? 'bg-red-500/10 text-red-200'
                            : 'bg-slate-700 text-slate-200'
                        }`}>
                          {ticket.priority}
                        </span>
                        <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300">
                          {ticket.status}
                        </span>
                      </div>

                      <h4 className="text-lg font-semibold text-white">{ticket.subject}</h4>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                        {ticket.description || 'No Redmine description available for this ticket yet.'}
                      </p>
                    </div>

                    <div className="min-w-[220px] rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Project</p>
                      <p className="mt-1 text-sm font-medium text-white">{ticket.module}</p>
                      <p className="mt-3 text-xs text-slate-500" suppressHydrationWarning>
                        Updated {formatStableDateTime(ticket.updated_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: 'blue' | 'orange' | 'red'
}) {
  const accentClasses = {
    blue: 'border-blue-500/20 bg-blue-500/5 text-blue-200',
    orange: 'border-orange-500/20 bg-orange-500/5 text-orange-200',
    red: 'border-red-500/20 bg-red-500/5 text-red-200',
  }

  return (
    <div className={`rounded-2xl border p-5 ${accentClasses[accent]}`}>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-3 text-3xl font-bold text-white">{value}</p>
    </div>
  )
}
