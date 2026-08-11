import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LuArrowLeft, LuDownload, LuPrinter, LuShare2 } from 'react-icons/lu'
import { formatStableDate } from '@/lib/datetime'

export default function InvestigationReport() {
  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Mock report data - in production this would come from API
    const mockReport = {
      ticket_id: 1,
      report_title: "Investigation Report: Ticket #1",
      executive_summary: `EXECUTIVE SUMMARY

Issue: Mobile App Login Crashes on Android Devices

Status: Investigation Complete - Root Cause Identified

Confidence Level: 88% (AI: 87%, Claude: 89%)

Key Finding: Authentication token validation issue in mobile credential flow - tokens expire prematurely due to timezone offset calculation bug in SessionService.

Recommendation: Implement proposed fix with staged rollout approach

Timeline: 5-8 business days for full implementation and validation`,

      investigation_process: `INVESTIGATION PROCESS

1. Ticket Analysis
   - Extracted ticket information from Redmine
   - Identified key patterns and symptoms
   - Classified issue type: Authentication/Mobile

2. Similar Ticket Search
   - Found 3 similar historical tickets
   - Analyzed patterns across previous investigations
   - Identified common root causes

3. Code Analysis
   - Scanned repository for relevant code files
   - Identified authentication service components
   - Located recent changes and regressions

4. AI Analysis (ChatGPT/Claude)
   - AI Confidence: 87%
   - Generated root cause hypothesis
   - Provided investigation steps
   - Recommended fix approach

5. Cross-Verification (Claude)
   - Independent verification of findings
   - Validation confidence: 89%
   - Alternative hypotheses evaluated

6. Communication Generation
   - Drafted client-facing response
   - Created internal technical documentation
   - Prepared implementation roadmap`,

      findings: `KEY FINDINGS

Root Cause:
Authentication token validation issue in mobile credential flow - tokens expire prematurely due to timezone offset calculation bug in SessionService.

Supporting Evidence:
- 3 similar tickets follow identical pattern
- Code analysis identified regression points in SessionService.java line 142
- Stack traces match authentication service failures
- Mobile platform-specific behavior confirmed on API level 30+

Investigation Steps Completed:
✓ Reviewed authentication service for recent changes or regressions
✓ Checked token validation logic for all platforms (iOS/Android)
✓ Analyzed crash logs for specific error messages at login point
✓ Tested credential validation with various input types
✓ Verified session persistence across app lifecycle
✓ Checked network timeout handling on slow connections

Validation:
- AI Analysis Confidence: 87%
- Claude Verification: 89%
- Combined Confidence: 88%`,

      risk_analysis: `RISK ANALYSIS

Identified Risks:
- Fixing authentication may affect other dependent services
- Changes need to be tested on all supported platform versions
- May require client app updates for full resolution
- Performance impact of additional validation checks

Mitigation Strategy:
- Comprehensive testing on all platforms (iOS, Android)
- Staged rollout with monitoring
- Quick rollback capability prepared
- Communication plan for stakeholders

Risk Level: MEDIUM (managed through staged approach)

Impact Assessment:
- Affects: Mobile application users (estimated 15-20% of user base)
- Severity: HIGH (complete feature unavailability)
- Business Impact: Revenue impact during fix window
- Customer Satisfaction: Critical priority for resolution`,

      implementation_plan: `IMPLEMENTATION PLAN

Phase 1: Development (2-3 business days)
- Code review of proposed fix
- Implementation by engineering team
- Unit and integration testing

Phase 2: Testing (1-2 business days)
- Comprehensive test automation
- Platform-specific testing (iOS, Android)
- Load and stress testing
- Security validation

Phase 3: Staging Deployment (1 business day)
- Deploy to staging environment
- QA validation
- Performance testing
- Client acceptance testing

Phase 4: Production Rollout (1 business day)
- Staged deployment (5% → 25% → 100%)
- Real-time monitoring
- Rollback procedures on standby
- Customer communications

Post-Deployment:
- 7-day monitoring period
- Metrics validation
- Retrospective meeting
- Knowledge base documentation`,

      success_metrics: [
        "Login success rate increases to 99%+",
        "Zero crash reports related to authentication",
        "Average session duration returns to baseline",
        "Mobile app ratings improve by 0.5+ stars",
        "Support ticket volume for login issues drops by 95%",
        "User retention metrics stabilize",
        "Performance benchmarks met on all platforms"
      ],

      appendix: `APPENDIX

A. Investigation Metadata
   - Report Generated: 2026-08-09T12:34:56.000Z
   - Investigation Duration: Real-time (< 5 minutes)
   - Tickets Analyzed: 3
   - Files Scanned: 8
   - Code Components Reviewed: 3

B. Communication Templates
   - Client Response: Ready for use
   - Redmine Update: Ready for use
   - Closure Comment: Ready for use
   - Follow-up Actions: 10-item checklist prepared

C. Quality Metrics
   - AI Analysis Confidence: 87%
   - Claude Verification: 89%
   - Combined Confidence Score: 88%
   - Investigation Completeness: 100%

D. Knowledge Contributions
   - Pattern added to knowledge base
   - Similar ticket correlation documented
   - Fix strategy documented for future reference
   - Team learning opportunity identified

E. Next Steps Checklist
   ☐ Technical review meeting scheduled
   ☐ Development task created
   ☐ Test plan finalized
   ☐ Staging environment prepared
   ☐ Monitoring setup completed
   ☐ Rollback procedures tested
   ☐ Customer communication sent
   ☐ Support team briefed`,

      generated_at: "2026-08-09T12:34:56.000Z",
      status: "completed"
    }

    setReport(mockReport)
    setLoading(false)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading report...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/workspace">
              <button className="p-2 hover:bg-slate-800 rounded-lg transition">
                <LuArrowLeft className="w-5 h-5" />
              </button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">{report.report_title}</h1>
              <p className="text-sm text-slate-400" suppressHydrationWarning>
                Generated: {formatStableDate(report.generated_at)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-slate-800 rounded-lg transition" title="Download PDF">
              <LuDownload className="w-5 h-5" />
            </button>
            <button className="p-2 hover:bg-slate-800 rounded-lg transition" title="Print Report">
              <LuPrinter className="w-5 h-5" />
            </button>
            <button className="p-2 hover:bg-slate-800 rounded-lg transition" title="Share Report">
              <LuShare2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Report Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Executive Summary */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">Executive Summary</h2>
          <div className="whitespace-pre-wrap text-slate-300 font-mono text-sm leading-relaxed">
            {report.executive_summary}
          </div>
        </section>

        {/* Investigation Process */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">Investigation Process</h2>
          <div className="whitespace-pre-wrap text-slate-300 font-mono text-sm leading-relaxed">
            {report.investigation_process}
          </div>
        </section>

        {/* Findings */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">Key Findings</h2>
          <div className="whitespace-pre-wrap text-slate-300 font-mono text-sm leading-relaxed">
            {report.findings}
          </div>
        </section>

        {/* Risk Analysis */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">Risk Analysis</h2>
          <div className="whitespace-pre-wrap text-slate-300 font-mono text-sm leading-relaxed">
            {report.risk_analysis}
          </div>
        </section>

        {/* Implementation Plan */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">Implementation Plan</h2>
          <div className="whitespace-pre-wrap text-slate-300 font-mono text-sm leading-relaxed">
            {report.implementation_plan}
          </div>
        </section>

        {/* Success Metrics */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">Success Metrics</h2>
          <ul className="space-y-2">
            {report.success_metrics.map((metric: string, idx: number) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="text-green-400 mt-1">✓</span>
                <span className="text-slate-300">{metric}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Appendix */}
        <section className="bg-slate-800 border border-slate-700 rounded-lg p-8 mb-8">
          <h2 className="text-2xl font-bold mb-4 text-blue-400">Appendix</h2>
          <div className="whitespace-pre-wrap text-slate-300 font-mono text-sm leading-relaxed">
            {report.appendix}
          </div>
        </section>

        {/* Footer */}
        <div className="text-center text-slate-500 text-sm py-8">
          <p>This report was generated by Samixa AI Support Assistant</p>
          <p className="mt-2">Report Status: {report.status === 'completed' ? '✓ Completed' : '⚠️ ' + report.status}</p>
        </div>
      </main>
    </div>
  )
}
