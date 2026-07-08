import type { ReactNode } from 'react';
import { cx } from '@/ui/theme/cx';

export type SceneTone = 'default' | 'win' | 'bust';

export interface SceneTextProps {
  children: ReactNode;
  /** `bust` for failures, `win` for successes. Failure is a scene, not a toast. */
  tone?: SceneTone;
  /** Optional speaker/attribution shown inline before the prose. */
  who?: ReactNode;
}

const TONE_CLASS: Record<SceneTone, string | false> = {
  default: false,
  win: 'cg-scene--win',
  bust: 'cg-scene--bust',
};

/**
 * Prose block for story and outcome scenes. Failure renders here as a typed
 * case note — never an error toast (design/07, design/05 §4). Presentational:
 * the caller supplies the written scene.
 */
export function SceneText({ children, tone = 'default', who }: SceneTextProps) {
  return (
    <p className={cx('cg-scene', TONE_CLASS[tone])}>
      {who != null && <span className="cg-scene__who">{who} </span>}
      {children}
    </p>
  );
}
