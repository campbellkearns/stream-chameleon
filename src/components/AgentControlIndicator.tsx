/**
 * Agent-control availability hint (WebMCP spec deliverable 4).
 *
 * Tells the user whether their AI agent can currently drive Stream Chameleon,
 * and why not when it can't. Three states, each carrying its own icon *and*
 * wording — never color alone, since color-blind users and screen readers
 * both need the distinction to survive.
 */

import { Link } from 'react-router-dom';
import { Bot, Lock, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useAuthState } from '@/hooks/useAuth';
import { isModelContextSupported } from '@/lib/webmcp/modelContext';

export type AgentControlState = 'active' | 'signed-out' | 'unsupported';

interface AgentControlStateCopy {
  icon: LucideIcon;
  label: string;
  description: string;
  colorClassName: string;
}

const STATE_COPY: Record<AgentControlState, AgentControlStateCopy> = {
  active: {
    icon: Bot,
    label: 'Agent control active',
    description: 'Your AI agent can switch stream profiles while this page is open.',
    colorClassName: 'text-cyan-400',
  },
  'signed-out': {
    icon: Lock,
    label: 'Sign in to enable agent control',
    description: 'Connect your Twitch account so your AI agent can switch stream profiles.',
    colorClassName: 'text-fg-subtle',
  },
  unsupported: {
    icon: TriangleAlert,
    label: 'Browser unsupported',
    description: 'Agent control needs a WebMCP-capable browser, e.g. Chrome 150+.',
    colorClassName: 'text-fg-subtle',
  },
};

/**
 * Derives the agent-control state from browser support and sign-in status.
 * Pure so it's trivial to test and reason about independent of React.
 */
export function getAgentControlState(isSupported: boolean, isAuthenticated: boolean): AgentControlState {
  if (!isSupported) {
    return 'unsupported';
  }

  return isAuthenticated ? 'active' : 'signed-out';
}

export interface AgentControlIndicatorProps {
  isSupported: boolean;
  isAuthenticated: boolean;
  className?: string;
}

/**
 * Pure presentational indicator. Takes support/auth as props rather than
 * reading the hooks itself, so the three states are directly testable
 * without mocking `document.modelContext` or auth.
 */
export function AgentControlIndicator({
  isSupported,
  isAuthenticated,
  className = '',
}: AgentControlIndicatorProps) {
  const state = getAgentControlState(isSupported, isAuthenticated);
  const copy = STATE_COPY[state];
  const Icon = copy.icon;

  return (
    <div
      className={`flex items-center gap-1.5 ${copy.colorClassName} ${className}`}
      data-agent-control-state={state}
      title={copy.description}
    >
      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="text-xs font-semibold">{copy.label}</span>
    </div>
  );
}

/**
 * Connected indicator for use in the app — reads live browser support and
 * auth state and hands them to the pure {@link AgentControlIndicator}.
 */
export default function ConnectedAgentControlIndicator({ className = '' }: { className?: string }) {
  const { isAuthenticated } = useAuthState();

  return (
    <Link to="/webmcp" className="rounded-md px-2 py-1 hover:bg-raised transition-colors" aria-label="WebMCP agent control">
      <AgentControlIndicator
        isSupported={isModelContextSupported()}
        isAuthenticated={isAuthenticated}
        className={className}
      />
    </Link>
  );
}
