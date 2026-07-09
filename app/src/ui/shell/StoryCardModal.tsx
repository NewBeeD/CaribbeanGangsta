/**
 * The story-card presenter (Prompt 22; design/08, design/05 §4). Renders a `StoryCard`
 * as an **in-world scene with choices** — prose, the characters on screen, and 2–4
 * choice buttons — never a report or a toast. Failure/negative beats land here as
 * scenes too (design/05 §4): the same surface, the tone carried by the written prose.
 *
 * The reputation variant (the player's dominant track, stamped by the engine's
 * `cardForPending`) is woven in as the "your read" skew — the same moment told for the
 * playstyle (design/08). The scene carries meaning; UI instruction stays ≤ a few words.
 *
 * Two phases, so the declarative effects apply exactly once, when the player commits:
 *  1. **Choosing** — scene + choice buttons. Picking one only *stages* it locally.
 *  2. **Result** — the chosen option's `sceneResult` prose, then a single Continue that
 *     calls `onResolve(index)` → the store folds the effects in and drops the scene.
 * Presentation only: this component never touches game state (the store's
 * `resolveCardChoice` is the one place a choice mutates — README UI rule).
 */

import { useState, type CSSProperties } from 'react';
import { variantText, type StoryCard } from '@/engine';
import { Button, Card, SceneText } from '@/ui/components';

export interface StoryCardModalProps {
  readonly card: StoryCard;
  /** Commit the chosen option — the store applies its effects and clears the scene. */
  readonly onResolve: (choiceIndex: number) => void;
}

const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  background: 'rgba(6, 8, 12, 0.82)',
};

const PANEL_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  maxHeight: '90vh',
  overflowY: 'auto',
};

export function StoryCardModal({ card, onResolve }: StoryCardModalProps) {
  // The staged choice index — `null` until the player picks one (phase 1 → phase 2).
  const [chosen, setChosen] = useState<number | null>(null);
  const staged = chosen === null ? null : (card.choices[chosen] ?? null);

  return (
    <div
      style={OVERLAY_STYLE}
      role="dialog"
      aria-modal="true"
      aria-label="Story scene"
      data-testid="story-card"
    >
      <div style={PANEL_STYLE}>
        <Card heading={card.characters.join(' · ')}>
          <SceneText>{card.sceneText}</SceneText>
          {/* The rep-variant skew — the same scene, told for your dominant path. */}
          <SceneText who="Your read:">{variantText(card)}</SceneText>

          {staged === null ? (
            <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {card.choices.map((choice, i) => (
                <Button
                  key={i}
                  variant={i === 0 ? 'primary' : 'secondary'}
                  fullWidth
                  data-testid="scene-choice"
                  onClick={() => setChosen(i)}
                >
                  {choice.label}
                </Button>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
              {staged.sceneResult ? <SceneText>{staged.sceneResult}</SceneText> : null}
              <Button
                variant="primary"
                fullWidth
                data-testid="scene-continue"
                onClick={() => onResolve(chosen!)}
              >
                Continue
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
