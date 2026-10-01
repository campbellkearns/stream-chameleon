/**
 * The three agent-callable tools the WebMCP surface exposes.
 *
 * Handlers are deliberately thin: they parse the agent's JSON arguments, resolve a
 * `StreamProfile`, and hand it to `twitchAPI.applyProfile` — the same call the Dashboard's Apply
 * button makes. Nothing here talks to Twitch directly, so template processing, the manual-category
 * `game_id` guard, and the typed `APIResult` errors all keep working exactly as they do in the UI.
 *
 * Profiles arrive through a `getProfiles` callback rather than a captured array, so a tool the
 * browser registered once still sees profiles created or edited later in the session.
 */

import type { StreamProfile, StreamCategory, SentChannelPayload } from '@/types/Profile';
import { processTitle, manualCategoryId } from '@/types/ProfileUtils';
import { VALIDATION_LIMITS } from '@/types/constants';
import type { APIResult } from '@/lib/api/twitchAPI';
import type { ModelContextTool } from '@/lib/webmcp/modelContext';
import { findProfile } from '@/lib/webmcp/profileMatch';
import {
  profileSummary,
  toToolError,
  validationError,
  type ApplyToolResult,
  type ListToolResult,
} from '@/lib/webmcp/toolResult';

/** Twitch accepts at most 10 tags; `applyProfile` truncates rather than failing, and so do we. */
const MAX_TAGS = 10;

/** The `twitchAPI` surface these tools depend on — one call, injected so tests need no client. */
export interface StreamProfileToolDeps {
  /** Current profiles, read at call time so a long-lived registration never goes stale. */
  getProfiles: () => readonly StreamProfile[];
  /** The existing profile-application path (`twitchAPI.applyProfile`), which resolves with the sent payload. */
  applyProfile: (profile: StreamProfile) => Promise<APIResult<SentChannelPayload>>;
/**
   * Resolves a category name to its cached/live Twitch entry (`CategoryRepository.search`),
   * or `null` when nothing matches. Injected so tests don't need IndexedDB or the Twitch API.
   */
  resolveCategory: (name: string) => Promise<StreamCategory | null>;
}

/** Parsed, validated arguments for `update_stream_details`. */
interface UpdateFields {
  title: string;
  category?: string;
  tags: string[];
}

/**
 * Builds the profile summaries `list_stream_profiles` reports.
 *
 * Works offline — it reads local profiles only and never touches Twitch, which is why listing is
 * its own tool rather than a mode of activation.
 */
function listProfiles(deps: StreamProfileToolDeps): ListToolResult {
  return { ok: true, profiles: deps.getProfiles().map(profileSummary) };
}

/** Reports what Twitch received, with title templates resolved to the literal string sent. */
function appliedFrom(profile: StreamProfile): ApplyToolResult {
  return {
    ok: true,
    applied: {
      title: processTitle(profile.title).processed,
      category: profile.category.name,
      tags: profile.tags.slice(0, MAX_TAGS),
    },
  };
}

/** Applies a resolved profile through the existing Twitch path and shapes the result. */
async function applyAndReport(
  profile: StreamProfile,
  deps: StreamProfileToolDeps,
): Promise<ApplyToolResult> {
  const result = await deps.applyProfile(profile);
  return result.success ? appliedFrom(profile) : toToolError(result.error);
}

/** Resolves a fuzzy profile name and applies it. */
async function activateByName(query: unknown, deps: StreamProfileToolDeps): Promise<ApplyToolResult> {
  if (typeof query !== 'string' || query.trim().length === 0) {
    return validationError('A profile name is required');
  }

  const profiles = deps.getProfiles();
  const match = findProfile(profiles, query);

  if (match.status === 'ambiguous') {
    return {
      ok: false,
      kind: 'not_found',
      message: `"${query}" matches more than one profile — ask which one`,
      candidates: match.candidates.map(profile => profile.name),
    };
  }

  if (match.status === 'none') {
    return {
      ok: false,
      kind: 'not_found',
      message: `No profile matching "${query}"`,
      candidates: profiles.map(profile => profile.name),
    };
  }

  return applyAndReport(match.profile, deps);
}

/**
 * Validates the agent's `update_stream_details` arguments.
 *
 * A title is required because `applyProfile` always writes one — accepting an update without a
 * title would silently blank the channel title. Tags beyond 10 are truncated rather than rejected,
 * mirroring `applyProfile`.
 */
function parseUpdateFields(input: Record<string, unknown>): UpdateFields | ReturnType<typeof validationError> {
  const { title, category, tags } = input;

  if (typeof title !== 'string' || title.trim().length === 0) {
    return validationError('A title is required — updating the channel always writes its title');
  }
  if (title.trim().length > VALIDATION_LIMITS.STREAM_TITLE_MAX) {
    return validationError(`Title must be ${VALIDATION_LIMITS.STREAM_TITLE_MAX} characters or less`);
  }
  if (category !== undefined && (typeof category !== 'string' || category.trim().length === 0)) {
    return validationError('Category must be a non-empty category name');
  }
  if (tags !== undefined && (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string'))) {
    return validationError('Tags must be an array of strings');
  }

  return {
    title: title.trim(),
    category: typeof category === 'string' ? category.trim() : undefined,
    tags: (tags as string[] | undefined)?.slice(0, MAX_TAGS) ?? [],
  };
}

/**
 * Resolves the category for a direct update.
 *
 * Omitting a category keeps the current one: it produces a manual category whose synthetic id
 * makes `applyProfile` omit `game_id`, the same guard the Dashboard relies on. Naming a category
 * resolves it through `CategoryRepository.search` to a real Twitch `game_id` — an unresolved name
 * is a validation failure rather than a silent manual fallback, because sending it through as
 * manual would leave the channel's category unchanged while telling the agent it succeeded.
 */
async function resolveDirectUpdateCategory(
  name: string | undefined,
  deps: StreamProfileToolDeps,
): Promise<StreamCategory | ReturnType<typeof validationError>> {
  if (name === undefined) {
    return { id: manualCategoryId(''), name: '', manual: true };
  }

  const resolved = await deps.resolveCategory(name);
  return resolved ?? validationError(`No category found matching "${name}"`);
}

/** Applies title/category/tags directly, with no saved profile behind them. */
async function updateDirect(
  input: Record<string, unknown>,
  deps: StreamProfileToolDeps,
): Promise<ApplyToolResult> {
  const fields = parseUpdateFields(input);
  if ('ok' in fields) {
    return fields;
  }

  const category = await resolveDirectUpdateCategory(fields.category, deps);
  if ('ok' in category) {
    return category;
  }

  const now = new Date();
  const ephemeralProfile: StreamProfile = {
    id: 'webmcp-direct-update',
    name: 'Direct update',
    category,
    title: fields.title,
    tags: fields.tags,
    createdAt: now,
    updatedAt: now,
  };

  return applyAndReport(ephemeralProfile, deps);
}

/**
 * Builds the three tools in the shape `document.modelContext.registerTool` expects.
 *
 * The returned array is stable content-wise but freshly allocated per call — callers should
 * memoize it so the registration effect doesn't churn.
 */
export function createStreamProfileTools(deps: StreamProfileToolDeps): ModelContextTool[] {
  return [
    {
      name: 'list_stream_profiles',
      description:
        "List the user's saved Stream Chameleon profiles (name, category, title template, tags). Works offline.",
      inputSchema: { type: 'object', properties: {} },
      execute: async () => listProfiles(deps),
    },
    {
      name: 'activate_stream_profile',
      description:
        "Apply a saved profile to the user's Twitch channel (title, category, tags). Matches the profile name loosely; call list_stream_profiles first when unsure.",
      inputSchema: {
        type: 'object',
        properties: {
          profile: { type: 'string', description: 'Profile name; matched exactly, then loosely' },
        },
        required: ['profile'],
      },
      execute: async input => activateByName(input.profile, deps),
    },
    {
      name: 'update_stream_details',
      description:
        'Update the Twitch channel directly without a saved profile: title (templates allowed), category name, up to 10 tags.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Stream title; {YYYY-MM-DD} and {DAY} are resolved' },
          category: { type: 'string', description: 'Category name' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Up to 10 tags' },
        },
        required: ['title'],
      },
      execute: async input => updateDirect(input, deps),
    },
  ];
}

/** A tool's public description, for showing what an agent can call. */
export interface StreamProfileToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Name, description, and schema of every tool, taken from the same definitions that get
 * registered so the WebMCP Hub's list can't drift from what agents actually see.
 */
export const STREAM_PROFILE_TOOL_INFO: readonly StreamProfileToolInfo[] = createStreamProfileTools({
  getProfiles: () => [],
  applyProfile: async () => ({ success: false }),
  resolveCategory: async () => null,
}).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
