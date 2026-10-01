import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentControlIndicator, getAgentControlState } from './AgentControlIndicator';

describe('getAgentControlState', () => {
  it('returns unsupported when the browser lacks WebMCP support, regardless of auth', () => {
    expect(getAgentControlState(false, true)).toBe('unsupported');
    expect(getAgentControlState(false, false)).toBe('unsupported');
  });

  it('returns signed-out when supported but not authenticated', () => {
    expect(getAgentControlState(true, false)).toBe('signed-out');
  });

  it('returns active when supported and authenticated', () => {
    expect(getAgentControlState(true, true)).toBe('active');
  });
});

describe('AgentControlIndicator', () => {
  it('renders the active state in plain language when supported and signed in', () => {
    const html = renderToStaticMarkup(<AgentControlIndicator isSupported={true} isAuthenticated={true} />);

    expect(html).toContain('Agent control active');
    expect(html).toContain('data-agent-control-state="active"');
  });

  it('renders the signed-out state in plain language when supported but not signed in', () => {
    const html = renderToStaticMarkup(<AgentControlIndicator isSupported={true} isAuthenticated={false} />);

    expect(html).toContain('Sign in to enable agent control');
    expect(html).toContain('data-agent-control-state="signed-out"');
  });

  it('renders the unsupported state in plain language when the browser lacks WebMCP', () => {
    const html = renderToStaticMarkup(<AgentControlIndicator isSupported={false} isAuthenticated={true} />);

    expect(html).toContain('Browser unsupported');
    expect(html).toContain('Chrome 146');
    expect(html).toContain('data-agent-control-state="unsupported"');
  });

  it('never relies on color alone to distinguish the two neutral-colored states', () => {
    const signedOutHtml = renderToStaticMarkup(
      <AgentControlIndicator isSupported={true} isAuthenticated={false} />,
    );
    const unsupportedHtml = renderToStaticMarkup(
      <AgentControlIndicator isSupported={false} isAuthenticated={true} />,
    );

    // Both use the same neutral text color class, so the label text and icon
    // are the only things a reader (sighted or not) can tell them apart by.
    expect(signedOutHtml).toContain('text-fg-subtle');
    expect(unsupportedHtml).toContain('text-fg-subtle');
    expect(signedOutHtml).not.toBe(unsupportedHtml);
  });
});
