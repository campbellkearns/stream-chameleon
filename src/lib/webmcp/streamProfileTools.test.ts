import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { APIResult } from '@/lib/api/twitchAPI';
import type { StreamCategory, StreamProfile, SentChannelPayload } from '@/types/Profile';
import { findProfile } from './profileMatch';
import { createStreamProfileTools, type StreamProfileToolDeps } from './streamProfileTools';

function makeProfile(overrides: Partial<StreamProfile> = {}): StreamProfile {
  const now = new Date('2026-09-03T12:00:00Z');
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    name: 'Writing Stream',
    category: { id: '509670', name: 'Science & Technology' },
    title: 'Morning pages — {YYYY-MM-DD} {DAY}',
    tags: ['writing', 'cozy'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function success(): APIResult<SentChannelPayload> {
  return {
    success: true,
    data: { title: 'stubbed payload', tags: [], gameId: null, categoryName: 'Stub Category' },
  };
}

/** The template-processed title the success payload is contractually expected to carry. */
function expectedProcessedTitle(template: string): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const dayStr = now.toLocaleDateString('en-US', { weekday: 'long' });
  return template.replace('{YYYY-MM-DD}', dateStr).replace('{DAY}', dayStr);
}

describe('findProfile', () => {
  const profiles = [
    makeProfile({ id: '1', name: 'Writing Stream' }),
    makeProfile({ id: '2', name: 'Coding Stream' }),
    makeProfile({ id: '3', name: 'Late Night Coding' }),
  ];

  it('matches an exact name', () => {
    expect(findProfile(profiles, 'Writing Stream')).toEqual({
      status: 'matched',
      profile: profiles[0],
    });
  });

  it('matches case-insensitively', () => {
    expect(findProfile(profiles, 'wRiTinG sTrEaM')).toEqual({
      status: 'matched',
      profile: profiles[0],
    });
  });

  it('matches a substring', () => {
    expect(findProfile(profiles, 'writing')).toEqual({
      status: 'matched',
      profile: profiles[0],
    });
  });

  it('reports ambiguity with the matching candidates', () => {
    const match = findProfile(profiles, 'coding');
    expect(match.status).toBe('ambiguous');
    expect(match.status === 'ambiguous' && match.candidates.map(p => p.name)).toEqual([
      'Coding Stream',
      'Late Night Coding',
    ]);
  });

  it('returns none when no tier matches', () => {
    expect(findProfile(profiles, 'IRL stream')).toEqual({ status: 'none' });
  });

  it('treats a blank query as no match rather than matching everything', () => {
    expect(findProfile(profiles, '   ')).toEqual({ status: 'none' });
  });
});

describe('stream profile tools', () => {
  let profiles: StreamProfile[];
  let applyProfile: ReturnType<typeof vi.fn>;
  let resolveCategory: ReturnType<typeof vi.fn>;
  let deps: StreamProfileToolDeps;
  let tools: ReturnType<typeof createStreamProfileTools>;

  const tool = (name: string) => {
    const found = tools.find(candidate => candidate.name === name);
    if (!found) throw new Error(`tool ${name} not built`);
    return found;
  };

  /** The one name `resolveCategory`'s default mock resolves, mirroring a real Twitch game. */
  const RESOLVABLE_CATEGORY: StreamCategory = { id: '1469308723', name: 'Software Development' };

  beforeEach(() => {
    vi.useFakeTimers();
    profiles = [makeProfile({ id: '1' }), makeProfile({ id: '2', name: 'Coding Stream', tags: ['live'] })];
    applyProfile = vi.fn<(profile: StreamProfile) => Promise<APIResult<SentChannelPayload>>>(async () => success());
    resolveCategory = vi.fn<(name: string) => Promise<StreamCategory | null>>(async name =>
      name === RESOLVABLE_CATEGORY.name ? RESOLVABLE_CATEGORY : null,
    );
    deps = { getProfiles: () => profiles, applyProfile, resolveCategory };
    tools = createStreamProfileTools(deps);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('list_stream_profiles', () => {
    it('returns summaries of the current profiles', async () => {
      await expect(tool('list_stream_profiles').execute({})).resolves.toEqual({
        ok: true,
        profiles: [
          {
            name: 'Writing Stream',
            description: undefined,
            category: 'Science & Technology',
            title: 'Morning pages — {YYYY-MM-DD} {DAY}',
            tags: ['writing', 'cozy'],
          },
          {
            name: 'Coding Stream',
            description: undefined,
            category: 'Science & Technology',
            title: 'Morning pages — {YYYY-MM-DD} {DAY}',
            tags: ['live'],
          },
        ],
      });
    });

    it('reads profiles at call time, not at build time', async () => {
      await tool('list_stream_profiles').execute({});
      profiles.push(makeProfile({ id: '3', name: 'IRL Stream' }));

      const result = await tool('list_stream_profiles').execute({});

      expect(result.ok).toBe(true);
      expect(result.ok && result.profiles.map(profile => profile.name)).toContain('IRL Stream');
    });

    it('never touches Twitch', async () => {
      await tool('list_stream_profiles').execute({});
      expect(applyProfile).not.toHaveBeenCalled();
    });
  });

  describe('activate_stream_profile', () => {
    it('applies an exactly-matched profile through twitchAPI.applyProfile', async () => {
      const result = await tool('activate_stream_profile').execute({ profile: 'Writing Stream' });

      expect(applyProfile).toHaveBeenCalledTimes(1);
      expect(applyProfile.mock.calls[0][0].id).toBe('1');
      expect(result).toEqual({
        ok: true,
        applied: {
          title: expectedProcessedTitle('Morning pages — {YYYY-MM-DD} {DAY}'),
          category: 'Science & Technology',
          tags: ['writing', 'cozy'],
        },
      });
    });

    it('resolves title templates ({YYYY-MM-DD}, {DAY}) in the success payload', async () => {
      const result = await tool('activate_stream_profile').execute({ profile: 'Writing Stream' });

      expect(result.ok).toBe(true);
      expect(result.ok && result.applied.title).toBe(
        expectedProcessedTitle('Morning pages — {YYYY-MM-DD} {DAY}'),
      );
      expect(result.ok && result.applied.title.includes('{')).toBe(false);
    });

    it('matches case-insensitively and by substring', async () => {
      await tool('activate_stream_profile').execute({ profile: 'coding' });
      expect(applyProfile.mock.calls[0][0].id).toBe('2');
    });

    it('answers an unknown name with not_found and every profile name as candidates', async () => {
      const result = await tool('activate_stream_profile').execute({ profile: 'IRL' });

      expect(result).toEqual({
        ok: false,
        kind: 'not_found',
        message: 'No profile matching "IRL"',
        candidates: ['Writing Stream', 'Coding Stream'],
      });
      expect(applyProfile).not.toHaveBeenCalled();
    });

    it('answers an ambiguous name with not_found and only the matching candidates', async () => {
      const result = await tool('activate_stream_profile').execute({ profile: 'stream' });

      expect(result).toEqual({
        ok: false,
        kind: 'not_found',
        message: '"stream" matches more than one profile — ask which one',
        candidates: ['Writing Stream', 'Coding Stream'],
      });
    });

    it('maps AUTH_REQUIRED to auth_required', async () => {
      applyProfile.mockResolvedValue({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required to update stream information' },
      });

      await expect(tool('activate_stream_profile').execute({ profile: 'Writing Stream' })).resolves.toEqual({
        ok: false,
        kind: 'auth_required',
        message: 'Authentication required to update stream information',
      });
    });

    it('maps NETWORK_ERROR and TIMEOUT to network', async () => {
      applyProfile.mockResolvedValue({
        success: false,
        error: { code: 'TIMEOUT', message: 'Request timed out. Please check your connection and try again.' },
      });

      const result = await tool('activate_stream_profile').execute({ profile: 'Writing Stream' });
      expect(result).toMatchObject({ ok: false, kind: 'network' });
    });

    it('maps unrecognised Twitch codes to twitch_error', async () => {
      applyProfile.mockResolvedValue({
        success: false,
        error: { code: 'API_ERROR', message: 'Failed to update stream: 500' },
      });

      const result = await tool('activate_stream_profile').execute({ profile: 'Writing Stream' });
      expect(result).toMatchObject({ ok: false, kind: 'twitch_error' });
    });
  });

  describe('update_stream_details', () => {
    it('applies the given fields directly, with templates resolved', async () => {
      const result = await tool('update_stream_details').execute({
        title: 'Live coding — {DAY}',
        category: 'Software Development',
        tags: ['live'],
      });

      expect(applyProfile).toHaveBeenCalledTimes(1);
      const sent = applyProfile.mock.calls[0][0];
      expect(sent.title).toBe('Live coding — {DAY}');
      expect(sent.tags).toEqual(['live']);
      expect(result).toEqual({
        ok: true,
        applied: {
          title: expectedProcessedTitle('Live coding — {DAY}'),
          category: 'Software Development',
          tags: ['live'],
        },
      });
    });

    it('resolves a category name to its real game_id via CategoryRepository', async () => {
      await tool('update_stream_details').execute({ title: 'Live coding', category: 'Software Development' });

      expect(resolveCategory).toHaveBeenCalledWith('Software Development');
      const sentCategory = applyProfile.mock.calls[0][0].category;
      expect(sentCategory).toEqual(RESOLVABLE_CATEGORY);
      expect(sentCategory.manual).not.toBe(true);
    });

    it('rejects a category name CategoryRepository has no match for', async () => {
      const result = await tool('update_stream_details').execute({
        title: 'Live coding',
        category: 'Not A Real Category',
      });

      expect(result).toEqual({
        ok: false,
        kind: 'validation',
        message: 'No category found matching "Not A Real Category"',
      });
      expect(applyProfile).not.toHaveBeenCalled();
    });

    it('keeps the current category when none is given, without sending game_id', async () => {
      await tool('update_stream_details').execute({ title: 'Just chatting today' });

      expect(resolveCategory).not.toHaveBeenCalled();
      const sent = applyProfile.mock.calls[0][0];
      expect(sent.category.manual).toBe(true);
      expect(sent.category.id.startsWith('manual:')).toBe(true);
    });

    it('caps tags at 10 like applyProfile does, instead of failing', async () => {
      const tags = Array.from({ length: 12 }, (_, index) => `tag-${index}`);
      const result = await tool('update_stream_details').execute({ title: 'Many tags', tags });

      expect(result.ok).toBe(true);
      expect(result.ok && result.applied.tags).toHaveLength(10);
    });

    it('rejects a missing title with validation', async () => {
      await expect(tool('update_stream_details').execute({ tags: ['live'] })).resolves.toMatchObject({
        ok: false,
        kind: 'validation',
      });
      expect(applyProfile).not.toHaveBeenCalled();
    });

    it('rejects a title over the Helix limit with validation', async () => {
      await expect(
        tool('update_stream_details').execute({ title: 'x'.repeat(141) }),
      ).resolves.toMatchObject({ ok: false, kind: 'validation' });
    });

    it('surfaces a failed channel update under the shared kinds', async () => {
      applyProfile.mockResolvedValue({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required to update stream information' },
      });

      await expect(
        tool('update_stream_details').execute({ title: 'Live coding' }),
      ).resolves.toMatchObject({ ok: false, kind: 'auth_required' });
    });
  });
});
