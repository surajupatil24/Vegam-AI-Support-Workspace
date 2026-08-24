import type { IconType } from 'react-icons'
import {
  LuBookOpen,
  LuFileText,
  LuLayoutDashboard,
  LuSettings,
  LuSparkles,
  LuTicket,
  LuUsers,
} from 'react-icons/lu'

interface GuideNavigationItem {
  id: string
  label: string
}

interface GuideTabItem {
  id: string
  label: string
}

interface GuideAgentGuide {
  id: string
  agentNumber: number
  title: string
  purpose: string
  howItWorks: string
  reads: string[]
  outputs: string[]
  supportUse: string
}

interface GuideFeatureSection {
  title: string
  summary: string
  fields: string[]
  icon: IconType
}

const NAVIGATION_HELP: Record<string, string> = {
  team: 'Opens the team dashboard so support leads can review engineer workload, ticket counts, and pending queues.',
  tickets: 'Opens the home ticket queue filtered to the currently logged-in Redmine user.',
  investigation: 'Opens the deep-dive AI investigation workspace for a selected Redmine ticket.',
  reports: 'Opens the report screen where AI-generated summaries and export-ready investigation outputs can be reviewed.',
  knowledge: 'Opens the knowledge base for reusable historical fixes, support notes, and investigation memory.',
  settings: 'Opens Redmine connection settings and project visibility control for ticket loading.',
}

const TAB_HELP: Record<string, string> = {
  investigation: 'Shows workflow progress, agent execution, investigation actions, and the control tower.',
  report: 'Shows AI issue summary, root cause hypothesis, recommendations, and customer-facing draft content.',
  conversation: 'Lets the support engineer and Samixa AI refine the ticket analysis together.',
  timeline: 'Shows the chronological event stream and investigation activity trail for the ticket.',
  attachments: 'Shows ticket attachments, logs, and downloadable evidence sources.',
  history: 'Shows saved investigation history, prior changes, and reusable context for the current ticket.',
}

const DASHBOARD_FEATURES: GuideFeatureSection[] = [
  {
    title: 'Home header and actions',
    summary: 'The dashboard header explains who is logged in and gives the fastest control actions.',
    fields: [
      'User card shows the logged-in Redmine name and username.',
      'Sync My Tickets refreshes the user ticket queue from Redmine.',
      'Team Dashboard opens the support team workload view.',
      'Logout closes the current Samixa session.',
    ],
    icon: LuUsers,
  },
  {
    title: 'Home summary metrics',
    summary: 'The home screen metric cards summarize the current assigned workload.',
    fields: [
      'Assigned to You shows total tickets assigned to the logged-in user.',
      'In Progress shows how many assigned tickets are actively in progress.',
      'High Priority counts tickets where priority matches High, Urgent, or Critical.',
    ],
    icon: LuLayoutDashboard,
  },
  {
    title: 'Home queue and scope',
    summary: 'The dashboard queue explains exactly which ticket fields are shown before opening a detailed investigation.',
    fields: [
      'Scope shows how many modules or projects are currently represented in the queue.',
      'Each queue card shows tracker, Redmine ID, priority, status, subject, description, module, and last updated time.',
      'Open Investigation Workspace moves the user from the queue into the deep investigation view.',
    ],
    icon: LuTicket,
  },
]

const WORKSPACE_FEATURES: GuideFeatureSection[] = [
  {
    title: 'Workspace header summary',
    summary: 'The sticky top header gives the engineer a quick workload snapshot without leaving the investigation screen.',
    fields: [
      'Assigned shows the current count of tickets assigned to the logged-in user.',
      'Pending shows tickets that still need progress or confirmation.',
      'Resolved Today shows tickets closed today for the current user context.',
      'The profile block shows the active engineer and current role.',
    ],
    icon: LuLayoutDashboard,
  },
  {
    title: 'Ticket switcher and ticket header',
    summary: 'These sections help the engineer move between tickets and understand the current Redmine context immediately.',
    fields: [
      'The ticket carousel shows multiple assigned tickets with created and updated timing.',
      'The main ticket header shows ticket number, priority, timestamps, project, module, tracker, and assignee.',
      'The action area lets the engineer go back, refresh, and review current ticket status.',
    ],
    icon: LuTicket,
  },
  {
    title: 'Ticket details panel',
    summary: 'The left panel keeps the core Redmine evidence visible while the investigation is running.',
    fields: [
      'Description shows the original Redmine issue text.',
      'Created and Updated show the latest Redmine timestamps.',
      'Module, Priority, Tracker, and Assignee show the ticket business context.',
      'Comments and Attachments sections surface extra customer or support evidence.',
    ],
    icon: LuFileText,
  },
  {
    title: 'Investigation center',
    summary: 'The center workspace is where Samixa explains progress, runs agents, and prepares the investigation output.',
    fields: [
      'Investigation Progress shows the step-by-step workflow stage.',
      'AI Investigation Control Tower shows each agent, status, outputs, and rerun actions.',
      'Tabs switch between investigation, report, conversation, timeline, attachments, and history.',
    ],
    icon: LuSparkles,
  },
  {
    title: 'Evidence and insight panel',
    summary: 'The right panel keeps the most useful supporting context in view while the engineer is reading the AI output.',
    fields: [
      'Past Similar Tickets shows the strongest historical matches and similarity score.',
      'Key Insights shows quick investigation highlights for the ticket.',
      'Related Modules and Logs & Attachments show dependency areas and downloadable evidence.',
    ],
    icon: LuBookOpen,
  },
  {
    title: 'Feedback and documentation tools',
    summary: 'The bottom-left action icons give users shared product feedback and this built-in feature guide.',
    fields: [
      'The i icon opens this guide drawer with screen details, agent flow, and feature descriptions.',
      'The feedback icon opens the shared feedback form and feed visible to all logged-in users.',
      'Feedback entries store the reporting user, screen name, attachment, issue details, and optional impact.',
    ],
    icon: LuSettings,
  },
]

const AGENT_GUIDES: GuideAgentGuide[] = [
  {
    id: 'ticket-understanding',
    agentNumber: 1,
    title: 'Ticket Understanding Agent',
    purpose: 'Reads the Redmine ticket first and converts the raw issue into a clear investigation scope.',
    howItWorks: 'It reviews the ticket subject, description, comments, and attachment context to identify the actual business problem, expected behavior, and missing information.',
    reads: ['Ticket subject', 'Description', 'Comments', 'Attachment context', 'Created and updated timestamps'],
    outputs: ['Normalized ticket summary', 'Observed behavior', 'Expected behavior'],
    supportUse: 'Support engineers use this output to confirm whether the issue is clearly understood before deeper analysis starts.',
  },
  {
    id: 'historical-knowledge',
    agentNumber: 2,
    title: 'Historical Incident / Knowledge Agent',
    purpose: 'Finds related tickets and ranks the most useful historical matches for the current issue pattern.',
    howItWorks: 'It compares keywords, module, plant, workflow signals, and known incident memory to surface previous issues that look similar.',
    reads: ['Module', 'Plant or project', 'Keywords', 'Historical tickets', 'Knowledge memory'],
    outputs: ['Ranked similar incidents', 'Historical comparison clues'],
    supportUse: 'Support engineers use this output to quickly see whether the issue was solved before and whether a previous fix can be reused.',
  },
  {
    id: 'domain-knowledge',
    agentNumber: 3,
    title: 'Domain Knowledge Agent',
    purpose: 'Explains the business workflow around the issue so the engineer sees upstream and downstream dependencies.',
    howItWorks: 'It maps the affected process into business steps and shows where data, approvals, interfaces, or machine actions are expected to happen.',
    reads: ['Module flow', 'Business process path', 'Operational dependencies', 'Expected sequence'],
    outputs: ['Business flow map', 'Dependency checkpoints'],
    supportUse: 'Support engineers use this output to understand the real business context before checking code, data, or configuration.',
  },
  {
    id: 'code-intelligence',
    agentNumber: 4,
    title: 'Code Intelligence Agent',
    purpose: 'Focuses repository review on likely files, methods, services, and recent changes when code analysis is needed.',
    howItWorks: 'It narrows the investigation to the most relevant code areas instead of scanning the full repository, with emphasis on likely failure points and recent changes.',
    reads: ['Related services', 'Controllers and repositories', 'Recent code changes', 'Dependency path'],
    outputs: ['Targeted code areas', 'Recent change guidance'],
    supportUse: 'Support engineers use this output when the issue looks software-related and needs focused developer investigation.',
  },
  {
    id: 'database-investigation',
    agentNumber: 5,
    title: 'Database Investigation Agent',
    purpose: 'Suggests safe, read-only data checks when the issue may involve state, transactions, or missing records.',
    howItWorks: 'It looks for likely data-state problems and recommends diagnostic checks without allowing destructive SQL or unsafe data edits.',
    reads: ['Read-only data patterns', 'Record state clues', 'Queue and transaction symptoms', 'Related entities'],
    outputs: ['Suggested diagnostic queries', 'Possible data-state issues'],
    supportUse: 'Support engineers use this output when the issue may be caused by incorrect records, missing relationships, queue delays, or status mismatches.',
  },
  {
    id: 'configuration-investigation',
    agentNumber: 6,
    title: 'Configuration Investigation Agent',
    purpose: 'Compares ticket context with known-good setups to detect plant, workflow, mapping, or permission mismatches.',
    howItWorks: 'It checks the current environment against expected configuration patterns to find differences in settings, flags, endpoints, roles, or master data.',
    reads: ['Plant configuration', 'Feature flags', 'Mappings', 'Permissions', 'Endpoints', 'Master data'],
    outputs: ['Known-good comparison', 'Likely configuration mismatch'],
    supportUse: 'Support engineers use this output when the issue looks environment-specific or when the same feature works correctly elsewhere.',
  },
  {
    id: 'ai-synthesis',
    agentNumber: 7,
    title: 'AI Investigation Synthesis Agent',
    purpose: 'Combines the previous agent findings into a probable root cause, failure stage, and technical draft.',
    howItWorks: 'It consolidates the evidence from the earlier agents and turns it into a single investigation narrative with the most likely explanation and next steps.',
    reads: ['Outputs from Agents 1 to 6', 'Cross-agent evidence', 'Failure stage signals'],
    outputs: ['Possible root cause', 'Technical analysis draft'],
    supportUse: 'Support engineers use this output to review the overall AI conclusion before they confirm, reject, or refine it.',
  },
  {
    id: 'communication-planner',
    agentNumber: 8,
    title: 'Communication Agent / Solution Planner',
    purpose: 'Waits for engineer confirmation and then prepares the final Redmine note and customer-facing response.',
    howItWorks: 'It turns confirmed investigation findings into clear communication, ordered actions, and support-safe wording for internal and customer updates.',
    reads: ['Confirmed findings', 'Engineer comments', 'Conversation notes', 'Final recommendations'],
    outputs: ['Redmine-ready note', 'Customer update draft'],
    supportUse: 'Support engineers use this output when they are ready to communicate the investigation result or action plan.',
  },
  {
    id: 'learning-agent',
    agentNumber: 9,
    title: 'Learning Agent',
    purpose: 'Captures confirmed outcomes after resolution so useful knowledge can be reused in the future.',
    howItWorks: 'It records what was actually correct, what fix was applied, and whether the result should become reusable support knowledge.',
    reads: ['Confirmed root cause', 'Confirmed fix', 'Engineer validation', 'Resolution outcome'],
    outputs: ['Learning summary', 'Knowledge promotion recommendation'],
    supportUse: 'Support engineers use this output after ticket closure to improve future investigations and reduce repeat troubleshooting effort.',
  },
  {
    id: 'expert-routing',
    agentNumber: 10,
    title: 'Expert Routing Agent',
    purpose: 'Suggests the most relevant internal expert who can accelerate the investigation.',
    howItWorks: 'It looks at the type of issue, workflow lane, and past resolution patterns to recommend the best internal helper or subject expert.',
    reads: ['Issue type', 'Workflow lane', 'Historical successful resolvers', 'Expertise signals'],
    outputs: ['Suggested expert', 'Reason for routing'],
    supportUse: 'Support engineers use this output when they need faster escalation or a targeted internal discussion with the right expert.',
  },
]

function GuideSectionCard(props: GuideFeatureSection) {
  const Icon = props.icon

  return (
    <article className="rounded-2xl border border-[#24364E] bg-[#08111F] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#1E3047] bg-[#0D1726] text-[#BFDBFE]">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <h5 className="text-sm font-semibold text-[#F8FAFC]">{props.title}</h5>
          <p className="mt-1 text-sm leading-6 text-[#94A3B8]">{props.summary}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {props.fields.map((field) => (
          <div
            key={field}
            className="rounded-xl border border-[#1E3047] bg-[#0D1726] px-3 py-2.5 text-sm leading-6 text-[#CBD5E1]"
          >
            {field}
          </div>
        ))}
      </div>
    </article>
  )
}

export default function InfoDrawerContent(props: {
  navigationItems: GuideNavigationItem[]
  tabs: GuideTabItem[]
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#1E3047] bg-[#0D1726] p-4">
        <h4 className="text-lg font-semibold text-[#F8FAFC]">Agent Workflow One by One</h4>
        <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
          This section explains what each Samixa agent does in general. It is not based on the current ticket. Support
          engineers can read this page to understand each agent role, and if they want improvements they can submit them
          in the Feedback Form.
        </p>

        <div className="mt-4 space-y-3">
          {AGENT_GUIDES.map((agent) => (
            <article key={agent.id} className="rounded-2xl border border-[#24364E] bg-[#08111F] px-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#F8FAFC]">
                  {`Agent ${agent.agentNumber}: ${agent.title}`}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#94A3B8]">{agent.purpose}</p>
              </div>

              <div className="mt-3 rounded-xl border border-[#1E3047] bg-[#0D1726] px-3 py-3 text-sm leading-6 text-[#CBD5E1]">
                <span className="font-medium text-[#E2E8F0]">How it works:</span>{' '}
                {agent.howItWorks}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {agent.reads.map((item) => (
                  <span
                    key={`${agent.id}-reads-${item}`}
                    className="rounded-full border border-[#24364E] bg-[#0D1726] px-2.5 py-1 text-xs text-[#CBD5E1]"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-[#1E3047] bg-[#0D1726] px-3 py-3 text-sm leading-6 text-[#CBD5E1]">
                <span className="font-medium text-[#E2E8F0]">What it produces:</span>{' '}
                {agent.outputs.join(' | ')}
              </div>

              <div className="mt-3 rounded-xl border border-[#1E3047] bg-[#0D1726] px-3 py-3 text-sm leading-6 text-[#94A3B8]">
                <span className="font-medium text-[#E2E8F0]">How support team should use it:</span>{' '}
                {agent.supportUse}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#1E3047] bg-[#0D1726] p-4">
        <h4 className="text-lg font-semibold text-[#F8FAFC]">Navigation and Screen Access</h4>
        <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
          These are the main screens available from the left navigation. This section stays aligned with the live sidebar items.
        </p>

        <div className="mt-4 space-y-3">
          {props.navigationItems.map((item) => (
            <article key={item.id} className="rounded-2xl border border-[#24364E] bg-[#08111F] px-4 py-4">
              <p className="text-sm font-semibold text-[#F8FAFC]">{item.label}</p>
              <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                {NAVIGATION_HELP[item.id] || `${item.label} opens the related Samixa screen for that feature area.`}
              </p>
            </article>
          ))}

          <article className="rounded-2xl border border-[#24364E] bg-[#08111F] px-4 py-4">
            <p className="text-sm font-semibold text-[#F8FAFC]">Info Guide</p>
            <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
              Opens this in-app documentation drawer with live screen explanations, field descriptions, and the agent workflow.
            </p>
          </article>

          <article className="rounded-2xl border border-[#24364E] bg-[#08111F] px-4 py-4">
            <p className="text-sm font-semibold text-[#F8FAFC]">Feedback Form</p>
            <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
              Opens the shared feedback form and feed so logged-in users can report issues, ideas, or screen-level improvement requests.
            </p>
          </article>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="text-lg font-semibold text-[#F8FAFC]">Home Screen Guide</h4>
          <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
            This explains the main fields and data shown on the dashboard or home ticket queue screen.
          </p>
        </div>

        {DASHBOARD_FEATURES.map((feature) => (
          <GuideSectionCard
            key={feature.title}
            title={feature.title}
            summary={feature.summary}
            fields={feature.fields}
            icon={feature.icon}
          />
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h4 className="text-lg font-semibold text-[#F8FAFC]">Investigation Workspace Guide</h4>
          <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
            This explains the main panels, fields, and actions visible inside the ticket investigation screen.
          </p>
        </div>

        {WORKSPACE_FEATURES.map((feature) => (
          <GuideSectionCard
            key={feature.title}
            title={feature.title}
            summary={feature.summary}
            fields={feature.fields}
            icon={feature.icon}
          />
        ))}
      </section>

      <section className="rounded-2xl border border-[#1E3047] bg-[#0D1726] p-4">
        <h4 className="text-lg font-semibold text-[#F8FAFC]">Investigation Tabs</h4>
        <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
          These tab names are read from the live workspace tab list, so added or renamed tabs appear here automatically.
        </p>

        <div className="mt-4 space-y-3">
          {props.tabs.map((tab) => (
            <article key={tab.id} className="rounded-2xl border border-[#24364E] bg-[#08111F] px-4 py-4">
              <p className="text-sm font-semibold text-[#F8FAFC]">{tab.label}</p>
              <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                {TAB_HELP[tab.id] || `${tab.label} shows the ticket data related to this workspace tab.`}
              </p>
            </article>
          ))}
        </div>
      </section>

    </div>
  )
}
