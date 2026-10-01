/**
 * Preset presentation
 *
 * Maps a preset's accent key to solid Tailwind classes (written out in full so
 * Tailwind's scanner finds them) and resolves icon/accent fallbacks for presets
 * saved before those fields existed.
 */

import {
  DEFAULT_PRESET_ACCENT,
  DEFAULT_PRESET_ICON,
  type AccentKey,
  type StreamProfile,
} from '@/types/Profile';

export const ACCENT_STYLES: Record<AccentKey, { label: string; edge: string; fill: string }> = {
  indigo: { label: 'Indigo', edge: 'border-l-indigo-500', fill: 'bg-indigo-600' },
  emerald: { label: 'Emerald', edge: 'border-l-emerald-500', fill: 'bg-emerald-600' },
  amber: { label: 'Amber', edge: 'border-l-amber-500', fill: 'bg-amber-600' },
  purple: { label: 'Purple', edge: 'border-l-purple-500', fill: 'bg-purple-600' },
  rose: { label: 'Rose', edge: 'border-l-rose-500', fill: 'bg-rose-600' },
  cyan: { label: 'Cyan', edge: 'border-l-cyan-500', fill: 'bg-cyan-600' },
};

/** Quick picks for the icon field; any single emoji is allowed */
export const SUGGESTED_PRESET_ICONS = ['🎮', '💻', '☕', '🎨', '🎵', '🎯', '🍿', '📚', '🛠️', '🎙️', '🏃', '🌙'];

export function presetIcon(profile: Pick<StreamProfile, 'icon'>): string {
  return profile.icon || DEFAULT_PRESET_ICON;
}

export function presetAccent(profile: Pick<StreamProfile, 'accent'>) {
  return ACCENT_STYLES[profile.accent ?? DEFAULT_PRESET_ACCENT] ?? ACCENT_STYLES[DEFAULT_PRESET_ACCENT];
}

/**
 * Twitch box art URLs carry a literal `{width}x{height}` placeholder
 */
export function boxArtSrc(url: string | undefined, width: number, height: number): string | undefined {
  return url?.replace('{width}', String(width)).replace('{height}', String(height));
}
