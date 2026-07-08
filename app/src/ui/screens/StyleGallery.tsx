import { useState } from 'react';
import {
  BottomNav,
  Button,
  Card,
  DottedRow,
  HeatDots,
  Panel,
  RiskMeter,
  SceneText,
  StampBadge,
  Stat,
  TrendArrow,
} from '@/ui/components';

/**
 * Storybook-lite gallery: every primitive in its states, on one page, as a
 * manual visual-check surface for the design system (prompts/01 acceptance).
 * PURE UI — no engine/store imports; all data below is hard-coded sample state.
 */
export function StyleGallery() {
  const [tab, setTab] = useState('deals');

  return (
    <main className="cg-app">
      <header style={{ marginBottom: 20 }}>
        <p className="cg-kicker">Design system · Gallery</p>
        <h1 className="cg-title">Caribbean Gangsta</h1>
      </header>

      <Card heading="Stamps">
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', paddingTop: 6 }}>
          <StampBadge variant="confidential" />
          <StampBadge variant="filed" />
          <StampBadge variant="danger" />
        </div>
      </Card>

      <Card heading="Buttons">
        <div style={{ display: 'grid', gap: 12 }}>
          <Button variant="primary" fullWidth>
            Make the sell
          </Button>
          <Button variant="primary" fullWidth disabled>
            Make the sell (disabled)
          </Button>
          <Button variant="secondary">
            Bribe the port official
            <small>−$5,000 · lowers heat one tier</small>
          </Button>
          <Button variant="secondary" disabled>
            Locked route
            <small>Needs a Port Royal contact</small>
          </Button>
          <Button variant="ghost">Lie low instead</Button>
        </div>
      </Card>

      <Card heading="Dossier rows">
        <Stat label="Cash on hand" value="$8,450" tone="gold" big />
        <Stat label="Clean this week" value="+$10,800" tone="green" />
        <Stat label="Outstanding debt" value="−$22,000" tone="red" />
        <DottedRow label="Clean chance" value="70%" />
        <DottedRow label="Buyer offer" value="$480 / unit" tone="gold" />
        <DottedRow label="Heat decay" value="slow" tone="dim" />
      </Card>

      <Card heading="Risk & market">
        <Panel heading="Risk this run">
          <RiskMeter probability={0.7} note="If busted: lose product + cash" />
        </Panel>
        <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
          <RiskMeter probability={0.92} label="Safe passage" />
          <RiskMeter probability={0.35} label="Flip risk" />
          <RiskMeter probability={0} label="No margin" />
        </div>
        <div
          style={{ display: 'flex', gap: 20, marginTop: 16, alignItems: 'center' }}
        >
          <TrendArrow direction="up" label="price rising" />
          <TrendArrow direction="down" label="price falling" />
          <TrendArrow direction="flat" label="steady" />
        </div>
      </Card>

      <Card heading="Heat">
        <div style={{ display: 'grid', gap: 12 }}>
          <HeatDots value={2} max={3} tier="Local" />
          <HeatDots value={6} tier="DEA" />
          <HeatDots value={10} tier="CIA" />
        </div>
      </Card>

      <Card heading="Scenes (failure is a scene, not a toast)">
        <SceneText tone="default" who="The buyer">
          counts it twice, nods, and is gone before the streetlight flickers back on.
        </SceneText>
        <SceneText tone="win">
          The car wash clears another quiet week. On paper, you&apos;re just a
          businessman.
        </SceneText>
        <SceneText tone="bust">
          Blue lights hit the alley before the deal closed. You ran; the product
          didn&apos;t.
        </SceneText>
      </Card>

      <Card heading="Bottom navigation">
        <BottomNav
          items={[
            { id: 'deals', label: 'Deals' },
            { id: 'crew', label: 'Crew' },
            { id: 'money', label: 'Money' },
            { id: 'heat', label: 'Heat' },
            { id: 'legacy', label: 'Legacy', disabled: true },
          ]}
          activeId={tab}
          onSelect={setTab}
        />
        <p className="cg-label" style={{ marginTop: 10 }}>
          Active tab: {tab}
        </p>
      </Card>
    </main>
  );
}
