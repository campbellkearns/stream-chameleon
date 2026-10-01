/**
 * The single result contract every WebMCP tool answers with.
 *
 * Success carries what the agent asked for; every failure is typed so the agent can react without
 * parsing prose — rephrase (`not_found`), tell the user to sign in (`auth_required`), retry later
 * (`network`), or fix its arguments (`validation`). Failure kinds are shared across all three
 * tools; only the success shape differs per tool.
 */

import type { StreamProfile } from '@/types/Profile';

/** What ended up on the channel, as Twitch received it (title templates already resolved). */
export interface AppliedStream {
  title: string;
  category: string;
  tags: string[];
}

/** A saved profile as reported to the agent by `list_stream_profiles`. */
export interface ProfileSummary {
  name: string;
  description?: string;
  category: string;
  /** Raw title, templates (`{YYYY-MM-DD}`, `{DAY}`) left unresolved — this is what is stored. */
  title: string;
  tags: string[];
}

/** Every failure any tool can return. */
export type ToolFailure =
  | { ok: false; kind: 'not_found'; message: string; candidates?: string[] }
  | { ok: false; kind: 'auth_required' | 'network' | 'validation' | 'twitch_error'; message: string };

/** Result of a tool that changes the channel (`activate_stream_profile`, `update_stream_details`). */
export type ApplyToolResult = { ok: true; applied: AppliedStream } | ToolFailure;

/** Result of `list_stream_profiles`. */
export type ListToolResult = { ok: true; profiles: ProfileSummary[] } | ToolFailure;

/** Union of every tool result shape. */
export type ToolResult = ApplyToolResult | ListToolResult;

/** The error shape `APIResult` carries — narrower than importing the whole client here. */
export interface APIErrorLike {
  code: string;
  message: string;
}

/**
 * Maps an `APIResult` error onto a tool failure kind.
 *
 * Auth and transport codes are the ones the agent can act on; everything else Twitch reports
 * (HTTP errors, Helix error strings, missing data) is `twitch_error` — surfaced with its message
 * rather than flattened into a generic failure.
 */
export function toToolError(error: APIErrorLike | undefined): ToolFailure {
  if (!error) {
    return { ok: false, kind: 'twitch_error', message: 'Twitch request failed for an unknown reason' };
  }

  switch (error.code) {
    case 'AUTH_REQUIRED':
    case 'TOKEN_EXPIRED':
    case 'unauthorized':
      return { ok: false, kind: 'auth_required', message: error.message };
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return { ok: false, kind: 'network', message: error.message };
    default:
      return { ok: false, kind: 'twitch_error', message: error.message };
  }
}

/** Builds a `validation` failure — the agent sent arguments the tool can't act on. */
export function validationError(message: string): ToolFailure {
  return { ok: false, kind: 'validation', message };
}

/** Projects a stored profile into the summary the agent sees. */
export function profileSummary(profile: StreamProfile): ProfileSummary {
  return {
    name: profile.name,
    description: profile.description,
    category: profile.category.name,
    title: profile.title,
    tags: profile.tags,
  };
}
