/**
 * Public engine API.
 *
 * The engine is a PURE, headless, deterministic simulation: no DOM, no React,
 * no store imports, no `Math.random`, no `Date.now()`. Intents in -> new
 * immutable state out. See prompts/README.md "Non-negotiable engineering rules".
 *
 * Real state/reducers/intents arrive in later prompts (03+). The randomness
 * foundation and per-run world generation (Prompt 02) live here now.
 */

// Seeded RNG — the only randomness source in the engine (Prompt 02).
export { createRng, restoreRng } from './rng';
export type { Rng, RngState } from './rng';

// Per-run world generation (Prompt 02).
export { generateWorld, describeStartingHand, VOLATILITY_RANGE } from './world';
export type {
  World,
  StartingCountry,
  StartingHand,
  ResolvedPrice,
  Rival,
  SupplierMarket,
  SupplierGeography,
} from './world';

// Economy / roster config (design/01 §0a, §2).
export {
  COUNTRIES,
  PRODUCT_PRICE_BANDS,
  PRODUCT_IDS,
} from './config/countries';
export type {
  ProductId,
  Band,
  ProductPriceBand,
  CountryConfig,
} from './config/countries';
export {
  RIVAL_ARCHETYPES,
  RIVAL_NAMES,
  RIVAL_COUNT,
} from './config/rivals';
export type { RivalArchetype } from './config/rivals';
export { PRODUCTS, getProduct } from './config/products';
export type { ProductConfig } from './config/products';
export {
  LOCATIONS,
  LOCATION_IDS,
  SOURCE_LOCATION,
  getLocation,
} from './config/locations';
export type { LocationId, LocationConfig } from './config/locations';

// Core run state + reducer (Prompt 03).
export {
  SCHEMA_VERSION,
  createInitialState,
  applyIntent,
  emptyInventory,
  totalDirtyCash,
  netWorth,
  empireSize,
  rngFor,
  withRngState,
} from './state';
export type {
  GameState,
  Intent,
  RunStatus,
  Clock,
  Reputation,
  Inventory,
  Stash,
  Front,
  CrewMember,
  MemoryEntry,
  BetrayalArc,
  BetrayalStage,
  CrewAssignment,
  OfficialTie,
  RaiseAsk,
  PaidPort,
  Corruption,
  Debt,
  RivalState,
  PendingChoice,
  HighScore,
} from './state';

// Injected-time clock + per-tick pipeline (Prompt 03).
export { tick, TICK_STEPS } from './clock';
export type { TickMode, TickStep } from './clock';

// Deal loop — Loop 1 (Prompt 04).
export {
  getMarketPrice,
  driftPrices,
  computeBustProbability,
  resolveDeal,
  hasBankedWin,
  createInitialMarkets,
  BUST_MIN,
  BUST_MAX,
  DEFAULT_STASH_CAPACITY,
  DEAL_WIN_FLAG,
} from './deals';
export type {
  MarketState,
  Markets,
  MarketPrice,
  PriceTrend,
  DealResult,
  DealOutcome,
  RejectReason,
  DealIntent,
  BuyIntent,
  SellIntent,
} from './deals';

// Heat & law enforcement — Prompt 05.
export {
  addHeat,
  decayHeat,
  reduceHeatByBribe,
  currentTier,
  tierForHeat,
  tierDots,
  checkTierEscalation,
  applyHeatEscalation,
  setLieLow,
  raidChance,
  rollRaid,
} from './heat';
export type { LeTier, TierEscalation, LieLowIntent, RaidEvent } from './heat';
export {
  HEAT_MIN,
  HEAT_MAX,
  HEAT_TIERS,
  HEAT_DOTS_TOTAL,
  HEAT_DECAY_RATE_PER_HOUR,
  LIE_LOW_DECAY_MULTIPLIER,
  LIE_LOW_INCOME_MULTIPLIER,
  EMPIRE_DECAY_SLOWDOWN,
  BRIBE_HEAT_PER_DOLLAR,
  RAID_BASE_RATE_PER_HOUR,
  RAID_EMPIRE_FACTOR,
} from './config/heat';
export type { HeatTierConfig } from './config/heat';

// Contraband storage — Prompt 06.
export {
  STASH_TYPES,
  STARTING_STASH_TYPE,
  getStashType,
  stashCost,
  STASH_COST_GROWTH,
  GUARD_CASH_THRESHOLD,
  GUARD_MAX_PENALTY,
  GUARD_UNGUARDED_PENALTY,
  WIPE_CAPITAL_THRESHOLD,
  TOTAL_ARCHETYPE_CAPACITY,
} from './config/stashes';
export type { StashType, StashTypeConfig } from './config/stashes';
export {
  stashUnits,
  totalUnits,
  stashCapacity,
  capacityRemaining,
  effectiveSeizurePct,
  diversificationIndex,
  addStash,
  moveProduct,
  storeCash,
  setStashGuard,
  resolveRaid,
  raidStep,
  WIPED_CAPITAL_FLAG,
} from './storage';
export type {
  StorageRejectReason,
  AddStashResult,
  MoveResult,
  RaidResult,
} from './storage';

// Laundering / idle-offline engine — Prompt 07.
export {
  FRONT_TYPES,
  FRONT_MAX_LEVEL,
  FRONT_COST_GROWTH,
  getFrontType,
  frontUpgradeCost,
  OFFLINE_SOFT_CAP_HOURS,
  OFFLINE_REDUCED_RATE,
  CRYPTO_SWING,
  PESO_EXCHANGE_HAIRCUT,
  TRADE_LAUNDER_FRACTION,
  tradeLaunderCapacity,
} from './config/fronts';
export type { FrontType, FrontTypeConfig } from './config/fronts';
export {
  cleanCashRate,
  cryptoSwingFactor,
  accrue,
  offlineEarnings,
  settleOffline,
  rollGoldenHour,
  buyFront,
  upgradeFront,
  pesoExchange,
  pesoExchangeQuote,
} from './laundering';
export type {
  OfflineReport,
  GoldenHourEvent,
  FrontResult,
  LaunderRejectReason,
  PesoQuote,
  PesoExchangeResult,
} from './laundering';

// Crew & NPC relatedness engine — Prompt 08.
export {
  CREW_ARCHETYPES,
  CREW_SKILLS,
  getCrewArchetype,
  findCrewArchetype,
  emptyCrewSkills,
  CREW_LOYALTY_MIN,
  CREW_LOYALTY_MAX,
  LOYALTY_EVENT_BASE,
  LOYALTY_DOLLARS_PER_POINT,
  TRAIT_EVENT_MULTIPLIER,
  BETRAYAL_PRONE_AGENDAS,
  BETRAYAL_WARNING_LOYALTY,
  BETRAYAL_PONR_LOYALTY,
  BETRAYAL_FLIP_LOYALTY,
  WIRE_HEAT_PER_HOUR,
  TRAIN_SKILL_GAIN,
  TRAIN_COST,
  CREW_SKILL_MAX,
  LIEUTENANT_FRONT_BONUS,
} from './config/crew';
export type {
  CrewArchetype,
  CrewDialogue,
  CrewSkill,
  CrewSkills,
  CrewTrait,
  CrewAgenda,
  CrewRole,
  LoyaltyEventKind,
} from './config/crew';
export {
  spawnCrew,
  hydrateLegacyCrew,
  recruit,
  dismiss,
  recordMemory,
  readsMemory,
  hasMemoryOf,
  loyaltyDelta,
  loyaltyDeltaValue,
  describeLoyalty,
  betrayalTarget,
  advanceBetrayalArc,
  advanceBetrayalArcs,
  wireHeatPerHour,
  applyWireHeat,
  crewStep,
  train,
  promote,
  assign,
  frontLieutenantBonus,
} from './crew';
export type {
  LoyaltyEvent,
  LoyaltyResult,
  RecruitResult,
  TrainResult,
  PromoteResult,
  PromoteTarget,
  CrewRejectReason,
} from './crew';

// Corruption network — port bribes & standing payroll — Prompt 09.
export {
  OFFICIALS,
  getOfficial,
  findOfficial,
  POLITICIAN_REP_BONUS,
  PORT_BRIBE_BASE_FRACTION,
  PORT_BRIBE_MIN_FRACTION,
  PORT_BRIBE_MAX_FRACTION,
  PORT_BASE_SEIZURE,
  PORT_PAID_SEIZURE,
  PORT_GREED_MIN,
  PORT_GREED_MAX,
  PORT_PAID_DURATION_HOURS,
  PORT_PRICE_DRIFT,
  PORT_DRIFT_PERIOD_HOURS,
  HAGGLE_DISCOUNT,
  HAGGLE_REFUSE_CHANCE,
  RIVAL_TENSION_SCALE,
  RIVAL_PRESSURE_CAP,
  REP_DISCOUNT_SCALE,
  MAX_REP_DISCOUNT,
  OFFICIAL_LOYALTY_MIN,
  OFFICIAL_LOYALTY_MAX,
  RETAINER_PAID_LOYALTY,
  RETAINER_MISSED_LOYALTY,
  RETAINER_UNDERPAY_LOYALTY,
  RAISE_ACCEPT_LOYALTY,
  RAISE_MIN_MARGIN,
  BUSINESS_LEVEL_SCALE,
} from './config/corruption';
export type { OfficialId, OfficialBenefit, OfficialConfig } from './config/corruption';
export {
  portGreed,
  rivalPressure,
  repDiscount,
  portDriftFactor,
  quoteBribe,
  haggle,
  payBribe,
  walk,
  hire,
  dismissOfficial,
  hydrateLegacyOfficial,
  computeRaiseAsk,
  requestRaise,
  respondToRaise,
  chargeRetainers,
  officialFlipTarget,
  advanceOfficialFlipArc,
  advanceOfficialFlipArcs,
  officialWireHeatPerHour,
  applyOfficialWireHeat,
  corruptionStep,
  judgeCanDismiss,
  hasRaidTipoff,
  hasTaskforceWarning,
  hasPoliticalProtection,
} from './corruption';
export type {
  BribeQuote,
  HaggleResult,
  PayBribeResult,
  HireResult,
  RaiseResult,
  ChargeResult,
  CorruptionRejectReason,
} from './corruption';

export const ENGINE_VERSION = '0.0.0' as const;

export interface Game {
  readonly version: string;
}

/** Minimal placeholder factory — proves the build/test wiring end to end. */
export function createGame(): Game {
  return { version: ENGINE_VERSION };
}
