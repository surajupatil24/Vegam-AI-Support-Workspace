import dynamic from 'next/dynamic'

const InvestigationWorkspace = dynamic(
  () => import('@/components/workspace/InvestigationWorkspace'),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300">
        Loading investigation workspace...
      </div>
    ),
  }
)

export default function WorkspacePage() {
  return <InvestigationWorkspace initialTicketId="90857" demoMode />
}
