import type { Locale } from '../types';

// ============================================================
// SHANAN — Bilingual display helpers
// Picks the best existing localized string for the active UI
// locale. It NEVER fabricates a translation: when the English
// field is empty or contains Arabic-script source data, it
// falls back to the existing Arabic string instead.
// ============================================================

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF]/;

export function isArabicScript(text: string | null | undefined): boolean {
  return typeof text === 'string' && ARABIC_SCRIPT_RE.test(text);
}

interface LocalizedLike {
  en?: string | null;
  ar?: string | null;
}

export function getLocalizedText(ls: LocalizedLike | string | undefined | null, locale: Locale): string {
  if (!ls) return '';
  if (typeof ls === 'string') return ls;
  const en = typeof ls.en === 'string' ? ls.en.trim() : '';
  const ar = typeof ls.ar === 'string' ? ls.ar.trim() : '';
  if (locale === 'ar') return ar || en;
  // English locale: never show untranslated Arabic in the en column.
  if (!en) return ar;
  return isArabicScript(en) ? (ar || en) : en;
}

export function hasLocalizedText(ls: LocalizedLike | string | undefined | null): boolean {
  if (!ls) return false;
  if (typeof ls === 'string') return ls.trim().length > 0;
  return (
    (typeof ls.en === 'string' && ls.en.trim().length > 0) ||
    (typeof ls.ar === 'string' && ls.ar.trim().length > 0)
  );
}