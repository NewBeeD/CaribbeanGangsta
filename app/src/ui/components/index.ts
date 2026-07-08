/**
 * Primitive component kit (see prompts/01_design_system.md). All are PURE
 * presentational: prop-driven, no imports from `engine/` or `store/`, no game
 * logic. Screens (prompts 15–23) compose from these instead of restyling.
 */
export { Button } from './Button';
export type { ButtonProps, ButtonVariant } from './Button';

export { Stat, DottedRow } from './Stat';
export type { StatProps, DottedRowProps, Tone } from './Stat';

export { RiskMeter } from './RiskMeter';
export type { RiskMeterProps } from './RiskMeter';

export { TrendArrow } from './TrendArrow';
export type { TrendArrowProps, TrendDirection } from './TrendArrow';

export { HeatDots } from './HeatDots';
export type { HeatDotsProps } from './HeatDots';

export { SceneText } from './SceneText';
export type { SceneTextProps, SceneTone } from './SceneText';

export { Card } from './Card';
export type { CardProps } from './Card';

export { Panel } from './Panel';
export type { PanelProps } from './Panel';

export { StampBadge } from './StampBadge';
export type { StampBadgeProps, StampVariant } from './StampBadge';

export { BottomNav } from './BottomNav';
export type { BottomNavProps, BottomNavItem } from './BottomNav';
