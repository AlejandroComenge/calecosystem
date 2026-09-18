/** Utilidades de texto compartidas por el analizador y los generadores. */

/** Minusculas sin acentos: permite escribir los lexicos una sola vez. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function slugify(text: string): string {
  const slug = normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'app' : slug;
}

export function pascalCase(text: string): string {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

export function camelCase(text: string): string {
  const pascal = pascalCase(text);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function kebabCase(text: string): string {
  return slugify(text);
}

export function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Plural en inglés para nombres de recursos REST. Los identificadores del
 * proyecto generado son siempre ingleses aunque los requisitos vengan en
 * español: es lo que espera cualquier equipo que herede el código.
 */
export function pluralizeEnglish(word: string): string {
  const lower = word.toLowerCase();
  if (/(s|x|z|ch|sh)$/.test(lower)) return `${lower}es`;
  if (/[^aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  return `${lower}s`;
}

/** Singular aproximado para español e inglés; solo se usa antes de mapear al lexico. */
export function singularize(word: string): string {
  const lower = normalize(word);
  if (lower.endsWith('ces')) return `${lower.slice(0, -3)}z`;
  if (lower.endsWith('ies')) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith('ses') || lower.endsWith('nes') || lower.endsWith('res')) {
    return lower.slice(0, -2);
  }
  if (lower.endsWith('es') && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith('s') && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

/** Cuenta cuántos términos de una lista aparecen como palabra completa. */
export function countMatches(haystack: string, needles: readonly string[]): number {
  let total = 0;
  for (const needle of needles) {
    if (containsTerm(haystack, needle)) total += 1;
  }
  return total;
}

/** Coincidencia por palabra completa; evita que "pago" dispare con "página". */
export function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
}

export function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
