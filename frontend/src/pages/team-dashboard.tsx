import { useState } from 'react'
import { LuAlertTriangle, LuBarChart3, LuCheckCircle2, LuClock3, LuTrendingUp } from 'react-icons/lu'

export default function TeamLeadDashboard() {
  const [timeRange, setTimeRange] = useState('week')

  // Mock team performance data
  const metrics = {
    totalTickets: 45,
    resolvedToday: 6,
    averageResolutionTime: '3.2 hours',
    aiAccuracy: 87,
    teamProductivity: 92
  }

  const teamMembers = [
    { name: 'John Engineer', tickets: 12, resolved: 10, accuracy: 89, satisfaction: 4.8 },
    { name: 'Sarah QA', tickets: 8, resolved: 8, accuracy: 95, satisfaction: 4.9 },
    { name: 'Mike Support', tickets: 15, resolved: 12, accuracy: 82, satisfaction: 4.6 },
    { name: 'Lisa Lead', tickets: 10, resolved: 9, accuracy: 91, satisfaction: 4.7 }
  ]

  const investigationMetrics = [
    { phase: 'Read Ticket', avgTime: '0.2s', success: 100 },
    { phase: 'Search Similar', avgTime: '0.8s', success: 97 },
    { phase: 'Code Analysis', avgTime: '1.2s', success: 94 },
    { phase: 'AI Analysis', avgTime: '2.1s', success: 89 },
    { phase: 'Communication', avgTime: '0.3s', success: 98 }
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Team Lead Dashboard</h1>
          <p className="text-slate-400">Samixa AI Performance & Team Analytics</p>

          {/* Time Range Filter */}
          <div className="mt-4 flex gap-2">
            {['today', 'week', 'month'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  timeRange === range
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-400">Total Tickets</h3>
              <LuTrendingUp className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-3xl font-bold">{metrics.totalTickets}</p>
            <p className="text-xs text-slate-500 mt-2">↑ 12% vs last week</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-400">Resolved Today</h3>
              <LuCheckCircle2 className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-3xl font-bold">{metrics.resolvedToday}</p>
            <p className="text-xs text-slate-500 mt-2">100% on-time</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-400">Avg Resolution</h3>
              <LuClock3 className="w-5 h-5 text-orange-500" />
            </div>
            <p className="text-3xl font-bold">{metrics.averageResolutionTime}</p>
            <p className="text-xs text-slate-500 mt-2">↓ 15% improvement</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-400">AI Accuracy</h3>
              <LuBarChart3 className="w-5 h-5 text-purple-500" />
            </div>
            <p className="text-3xl font-bold">{metrics.aiAccuracy}%</p>
            <p className="text-xs text-slate-500 mt-2">↑ 3% trend</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-slate-400">Productivity</h3>
              <LuTrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-3xl font-bold">{metrics.teamProductivity}%</p>
            <p className="text-xs text-slate-500 mt-2">All team members active</p>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Team Member Performance */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-6">Team Member Performance</h2>
            <div className="space-y-4">
              {teamMembers.map((member, idx) => (
                <div key={idx} className="p-4 bg-slate-700/50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-white">{member.name}</h3>
                    <span className="text-sm text-yellow-400">⭐ {member.satisfaction}/5.0</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-slate-400">Tickets</p>
                      <p className="font-bold text-white">{member.tickets}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Resolved</p>
                      <p className="font-bold text-green-400">{member.resolved}/{member.tickets}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Accuracy</p>
                      <p className="font-bold text-white">{member.accuracy}%</p>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 bg-slate-600 rounded h-2">
                    <div
                      className="bg-blue-600 h-full rounded"
                      style={{ width: `${(member.resolved / member.tickets) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Investigation Pipeline Performance */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-6">Investigation Pipeline</h2>
            <div className="space-y-4">
              {investigationMetrics.map((metric, idx) => (
                <div key={idx} className="p-4 bg-slate-700/50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium text-white">{metric.phase}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-400">{metric.avgTime}</span>
                      <span className={`text-sm font-bold ${metric.success >= 95 ? 'text-green-400' : 'text-orange-400'}`}>
                        {metric.success}%
                      </span>
                    </div>
                  </div>
                  <div className="bg-slate-600 rounded h-2">
                    <div
                      className={`h-full rounded ${metric.success >= 95 ? 'bg-green-600' : 'bg-orange-600'}`}
                      style={{ width: `${metric.success}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI System Health */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Accuracy Trend */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="font-bold text-white mb-4">AI Accuracy Trend</h3>
            <div className="text-center py-8">
              <p className="text-5xl font-bold text-blue-400 mb-2">87%</p>
              <p className="text-sm text-green-400">↑ 3% vs last week</p>
              <div className="mt-4 text-xs text-slate-400 space-y-1">
                <p>Root Cause ID: 89%</p>
                <p>Code Analysis: 92%</p>
                <p>Risk Assessment: 81%</p>
              </div>
            </div>
          </div>

          {/* Investigation Time Distribution */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="font-bold text-white mb-4">Avg Investigation Time</h3>
            <div className="text-center py-8">
              <p className="text-5xl font-bold text-purple-400 mb-2">4.6s</p>
              <p className="text-sm text-green-400">↓ 28% faster than manual</p>
              <div className="mt-4 text-xs text-slate-400 space-y-1">
                <p>Fastest: 2.1s (Code)</p>
                <p>Slowest: 2.1s (AI)</p>
                <p>Median: 3.8s</p>
              </div>
            </div>
          </div>

          {/* Cost Savings */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="font-bold text-white mb-4">Cost Impact</h3>
            <div className="text-center py-8">
              <p className="text-5xl font-bold text-green-400 mb-2">$2.3K</p>
              <p className="text-sm text-green-400">↓ Weekly savings</p>
              <div className="mt-4 text-xs text-slate-400 space-y-1">
                <p>Manual hours saved: 8.5h/week</p>
                <p>Resolution speed: +35%</p>
                <p>Quality: +12% CSAT</p>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts & Insights */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-6">Alerts & Insights</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-4 p-4 bg-green-900/20 border border-green-700/30 rounded-lg">
              <LuCheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-white">Excellent Performance</p>
                <p className="text-sm text-slate-400">Team achieved 92% productivity this week with AI accuracy at 87%</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-blue-900/20 border border-blue-700/30 rounded-lg">
              <LuBarChart3 className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-white">Trend Analysis</p>
                <p className="text-sm text-slate-400">Resolution time decreased 15% week-over-week. AI accuracy improved by 3%.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-orange-900/20 border border-orange-700/30 rounded-lg">
              <LuAlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-white">Action Required</p>
                <p className="text-sm text-slate-400">Code Analysis phase at 94% success. Review last failed analysis for patterns.</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 bg-purple-900/20 border border-purple-700/30 rounded-lg">
              <LuTrendingUp className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-white">Knowledge Base Growth</p>
                <p className="text-sm text-slate-400">Added 12 new patterns this week. Improving AI confidence for similar issues.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
