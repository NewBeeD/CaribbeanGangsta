/**
 * Tiny classname joiner. Falsy entries (`false`, `undefined`, `null`, `''`) are
 * dropped so components can write `cx('cg-btn', active && 'is-active')` without
 * a dependency. Kept in `theme/` because it's presentational plumbing only.
 */
export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
