import { Link } from 'react-router-dom'
import { Bot, Lock, TriangleAlert, Trash2, Link2 } from 'lucide-react'
import { useAuthState } from '@/hooks/useAuth'
import { useStreamControl, type ToolCallEntry } from '@/hooks/useStreamControl'
import { isModelContextSupported } from '@/lib/webmcp/modelContext'
import { STREAM_PROFILE_TOOL_INFO, type StreamProfileToolInfo } from '@/lib/webmcp/streamProfileTools'
import { getAgentControlState } from '@/components/AgentControlIndicator'

interface SchemaProperty {
  type?: string
  description?: string
}

function ToolCard({ tool }: { tool: StreamProfileToolInfo }) {
  const properties = (tool.inputSchema.properties ?? {}) as Record<string, SchemaProperty>
  const required = new Set((tool.inputSchema.required ?? []) as string[])
  const params = Object.entries(properties)

  return (
    <li className="p-4 rounded-lg bg-raised border border-line" data-testid="webmcp-tool">
      <p className="font-mono text-sm font-semibold text-cyan-400">{tool.name}</p>
      <p className="text-sm text-fg-muted mt-1">{tool.description}</p>
      {params.length > 0 && (
        <ul className="mt-3 space-y-1">
          {params.map(([name, prop]) => (
            <li key={name} className="text-xs text-fg-muted">
              <span className="font-mono text-fg">{name}</span>
              <span className="text-fg-subtle"> · {prop.type}{required.has(name) ? ' · required' : ''}</span>
              {prop.description && <span> · {prop.description}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function callSucceeded(call: ToolCallEntry): boolean {
  return (call.result as { ok?: boolean } | null)?.ok === true
}

function CallLog() {
  const { toolCalls, clearToolCalls } = useStreamControl()

  return (
    <section className="card" data-testid="webmcp-log">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Agent activity</h2>
        {toolCalls.length > 0 && (
          <button
            type="button"
            onClick={clearToolCalls}
            className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg-strong transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {toolCalls.length === 0 ? (
        <p className="text-sm text-fg-muted py-4">No agent calls yet this session.</p>
      ) : (
        <ul className="divide-y divide-line">
          {toolCalls.map((call) => {
            const ok = callSucceeded(call)
            const message = (call.result as { message?: string } | null)?.message
            const input = JSON.stringify(call.input)
            return (
              <li key={call.id} className="py-3 first:pt-0 last:pb-0" data-testid="webmcp-log-entry">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-cyan-400">{call.tool}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide bg-raised border border-line rounded px-1.5 py-0.5 ${
                      ok ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {ok ? 'ok' : 'failed'}
                  </span>
                  <span className="text-xs text-fg-subtle">{new Date(call.at).toLocaleTimeString()}</span>
                </div>
                {input !== '{}' && <p className="font-mono text-xs text-fg-muted mt-1 break-all">{input}</p>}
                {!ok && message && <p className="text-xs text-red-400 mt-1">{message}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const STATUS = {
  active: {
    icon: Bot,
    iconClass: 'text-cyan-400',
    title: 'Agent control is on',
    body: 'Your AI agent can list your presets, apply them, and update your stream while this tab is open. Every change shows up here, in the toast, and in Recent applications.',
  },
  'signed-out': {
    icon: Lock,
    iconClass: 'text-fg-subtle',
    title: 'Connect Twitch to turn on agent control',
    body: 'Your browser supports WebMCP. Tools are only offered to agents while you are signed in, because they act on your channel as you.',
  },
  unsupported: {
    icon: TriangleAlert,
    iconClass: 'text-amber-400',
    title: "This browser doesn't support WebMCP",
    body: 'Agent control needs a browser with WebMCP (document.modelContext), such as Chrome 150+ on a site enrolled in the WebMCP origin trial. Everything else in Stream Chameleon works normally.',
  },
} as const

export default function WebMCPHub() {
  const { isAuthenticated } = useAuthState()
  const state = getAgentControlState(isModelContextSupported(), isAuthenticated)
  const status = STATUS[state]
  const StatusIcon = status.icon

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-strong">WebMCP</h1>
        <p className="text-sm text-fg-muted mt-1">Let an AI agent in your browser drive your stream through the tools below.</p>
      </div>

      <section className="card flex items-start gap-4" data-testid="webmcp-status" data-agent-control-state={state}>
        <StatusIcon className={`w-6 h-6 shrink-0 mt-0.5 ${status.iconClass}`} aria-hidden="true" />
        <div>
          <h2 className="font-semibold text-fg-strong">{status.title}</h2>
          <p className="text-sm text-fg-muted mt-1 max-w-2xl">{status.body}</p>
          {state === 'signed-out' && (
            <Link to="/auth" className="btn mt-4">
              <Link2 className="w-4 h-4" />
              <span>Connect Twitch</span>
            </Link>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <section className="card">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle mb-3">
            Tools ({STREAM_PROFILE_TOOL_INFO.length})
          </h2>
          <ul className="space-y-2">
            {STREAM_PROFILE_TOOL_INFO.map((tool) => (
              <ToolCard key={tool.name} tool={tool} />
            ))}
          </ul>
        </section>
        <CallLog />
      </div>
    </div>
  )
}
