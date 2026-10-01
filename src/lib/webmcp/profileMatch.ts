/**
 * Fuzzy profile lookup for agent phrasing.
 *
 * An agent says "my writing stream" where the saved profile is "Writing Stream", so the match
 * runs in widening tiers — exact, case-insensitive, then substring — and stops at the first tier
 * that produces candidates. A tier matching more than one profile is ambiguous rather than an
 * arbitrary pick: the caller reports the candidates back and lets the agent (or user) choose.
 */

import type { StreamProfile } from '@/types/Profile';

/** Outcome of matching a query against the saved profiles. */
export type ProfileMatch =
  | { status: 'matched'; profile: StreamProfile }
  | { status: 'ambiguous'; candidates: StreamProfile[] }
  | { status: 'none' };

/** Match tiers, widest last. The first tier with any hit decides the outcome. */
const MATCH_TIERS: ReadonlyArray<(profile: StreamProfile, query: string) => boolean> = [
  (profile, query) => profile.name.trim() === query,
  (profile, query) => profile.name.trim().toLowerCase() === query.toLowerCase(),
  (profile, query) => profile.name.trim().toLowerCase().includes(query.toLowerCase()),
];

/**
 * Finds the profile a query names, widening from exact to substring matching.
 *
 * A blank query matches nothing (`none`) rather than every profile via the substring tier.
 */
export function findProfile(profiles: readonly StreamProfile[], query: string): ProfileMatch {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return { status: 'none' };
  }

  for (const matches of MATCH_TIERS) {
    const hits = profiles.filter(profile => matches(profile, trimmedQuery));

    if (hits.length === 1) {
      return { status: 'matched', profile: hits[0] };
    }
    if (hits.length > 1) {
      return { status: 'ambiguous', candidates: hits };
    }
  }

  return { status: 'none' };
}
