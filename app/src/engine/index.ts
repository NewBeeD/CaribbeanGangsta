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

// Per-run world generation (Prompt 02; design/11 regional markets).
export {
  generateWorld,
  describeStartingHand,
  basePriceAt,
  boardFor,
  neutralSupplier,
  productDisplayName,
  hydrateWorldV11,
  VOLATILITY_RANGE,
} from './world';
export type {
  World,
  StartingCountry,
  StartingHand,
  ResolvedPrice,
  BasePrice,
  Rival,
  SupplierMarket,
  SupplierGeography,
} from './world';

// The single typed balance surface + injection API (Prompt 26; design/01 §8).
export {
  DEFAULT_GAME_CONFIG,
  tunedConfig,
  TUNE_FIRST,
  knobValue,
} from './config';
export type {
  GameConfig,
  GameConfigOverrides,
  TuneFirstKnob,
  WorldTuning,
  ProductsTuning,
  MarketsTuning,
  DealsTuning,
  HeatTuning,
  StashesTuning,
  FrontsTuning,
  CrewTuning,
  CorruptionTuning,
  LendersTuning,
  EventsTuning,
  PrestigeTuning,
  TransportTuning,
  ConversionsTuning,
  VesselsTuning,
  ProductionTuning,
  StreetTuning,
  PlugsTuning,
  ArmsTuning,
  OnboardingTuning,
} from './config';

// Prestige-unlocked starting scenarios — data only, non-power (GDD §7; Prompt 26).
export { STARTING_SCENARIOS, findScenario } from './config/scenarios';
export type { StartingScenario } from './config/scenarios';

// First-session onboarding budget (design/01 §6; Prompt 24 consumes).
export {
  SESSION_TARGET_MIN_MINUTES,
  SESSION_TARGET_MAX_MINUTES,
  MINUTE_BUDGET,
  GUIDED_DEALS_AFTER_FIRST,
  MAX_INSTRUCTION_WORDS,
  SAFE_DEALS_BEFORE_RISK,
} from './config/onboarding';

// Economy / roster config (design/01 §0a, §2; design/11).
export {
  COUNTRIES,
  COUNTRY_IDS,
  START_COUNTRIES,
  REGION_DISTANCE,
  PRODUCT_PRICE_BANDS,
  PRODUCT_IDS,
  getCountry,
  findCountry,
  isTraded,
  requiresPlug,
} from './config/countries';
export type {
  ProductId,
  Region,
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
export { PRODUCTS, getProduct, EXOTIC_STRAINS } from './config/products';
export type { ProductConfig } from './config/products';

// Core run state + reducer (Prompt 03).
export {
  SCHEMA_VERSION,
  createInitialState,
  applyIntent,
  emptyInventory,
  emptyDebt,
  emptyStreetStock,
  emptyArmory,
  emptyWash,
  debtOwed,
  totalDirtyCash,
  spendableAt,
  splitCharge,
  netWorth,
  empireSize,
  isConsequentialChoice,
  dismissAllPendingChoices,
  rngFor,
  withRngState,
  ARREST_CHOICE_KIND,
  FAVOR_CHOICE_KIND,
} from './state';
export type {
  GameState,
  Intent,
  RunStatus,
  ChargeSplit,
  Clock,
  Reputation,
  Inventory,
  Stash,
  Front,
  ProductionOp,
  Vessel,
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
  MarketEvent,
  Rumor,
  StreetStock,
  WashQueue,
  MarkedEnforcement,
} from './state';

// Injected-time clock + per-tick pipeline (Prompt 03). `serveSentence` is the
// B4 arrest's no-bond exit: fast-forward the incarcerated pipeline, resume.
export { tick, TICK_STEPS, serveSentence } from './clock';
export type { TickMode, TickStep, ServeSentenceResult } from './clock';

// Deal loop — Loop 1 (Prompt 04; one-price + finite stock, Prompt 32).
export {
  getMarketPrice,
  marketEventMultiplier,
  driftPrices,
  restockMarkets,
  stockCapFor,
  computeBustProbability,
  resolveDeal,
  hasBankedWin,
  createInitialMarkets,
  BUST_MIN,
  BUST_MAX,
  DEFAULT_STASH_CAPACITY,
  DEAL_WIN_FLAG,
} from './deals';
// Market stock tuning (design/12 Item 10; Prompt 32).
export {
  STOCK_SEED_BAND,
  PLUG_STOCK_MULTIPLIER,
  RESTOCK_PER_DAY,
  SELL_RESTOCK_FRACTION,
  SCARCITY_PRICE_WEIGHT,
} from './config/markets';
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

// Product conversions — cook crack / press hash (Ideas2 §4; design/11 §4).
export { CONVERSION_RECIPES, getRecipe } from './config/conversions';
export type { RecipeId, ConversionRecipe } from './config/conversions';
export { convert, maxBatches, convertBinding } from './conversions';
export type {
  ConvertIntent,
  ConvertResult,
  ConvertRejectReason,
} from './conversions';

// Production layer — grow-ops, strains & drug factories (Ideas2 item 3) — Prompt 39.
export {
  PRODUCTION_OPS,
  PRODUCTION_MAX_LEVEL,
  PRODUCTION_COST_GROWTH,
  getProductionOp,
  productionUpgradeCost,
} from './config/production';
export type {
  ProductionOpId,
  ProductionKind,
  ProductionOpConfig,
} from './config/production';
export {
  productionYieldRate,
  productionStep,
  buyProductionOp,
  upgradeProductionOp,
  setProductionPaused,
  setProductionStash,
} from './production';
export type { ProductionResult, ProductionRejectReason } from './production';

// Street teams — the crack corner economy (design/12 Item 5; Prompt 34).
export {
  STREET_SALE_PER_CREW_PER_DAY,
  STREET_QUEUE_PER_CREW,
  STREET_HEAT_PER_UNIT,
} from './config/street';
export {
  streetQueueCap,
  streetQueueRoom,
  streetSalePerDay,
  streetRevenuePerDay,
  bookStreetStock,
  streetStep,
} from './street';

// Arms trade — broker unlock, weapon tiers, conflict demand (design/12 Item 1) — Prompt 35.
export {
  WEAPON_TIERS,
  WEAPON_TIER_IDS,
  getWeaponTier,
  ARMS_BROKER_COST,
  ARMS_BROKER_HEAT,
} from './config/arms';
export type { WeaponTierId, WeaponTierConfig } from './config/arms';
export {
  createInitialArmsMarkets,
  armsTraded,
  ARMS_COUNTRY_IDS,
  armsStockCap,
  armsTierBasePrice,
  armsConflictActive,
  getArmsPrice,
  armsBrokerQuote,
  unlockArmsBroker,
  armsBustProbability,
  resolveArmsDeal,
  armsMarketStep,
  ARMS_UNLOCKED_FLAG,
} from './arms';
export type {
  ArmsMarketState,
  ArmsMarkets,
  Armory,
  ArmsPrice,
  ArmsPriceTrend,
  ArmsBrokerQuote,
  ArmsBrokerResult,
  ArmsBrokerRejectReason,
  ArmsDealResult,
  ArmsDealOutcome,
  ArmsRejectReason,
  ArmsIntent,
  BuyArmsIntent,
  SellArmsIntent,
  UnlockArmsBrokerIntent,
} from './arms';

// Travel, transports & couriers (design/11 §3; Ideas2 §1/§3) — Prompt 30.
export {
  TRANSPORTS,
  getTransport,
  INTERDICTION_MIN,
  INTERDICTION_MAX,
  INTERDICTION_BASE,
  MODE_RISK_WEIGHT,
  DISTANCE_RISK_WEIGHT,
  CARGO_HEAT_WEIGHT,
  DEST_RISK_WEIGHT,
  PORT_PROTECTION_WEIGHT,
  PAID_PORT_RELIEF,
  CARGO_HEAT_FULL_RISK,
  MIN_LEG_DISTANCE,
  COURIER_CUT_PCT,
  ESCORT_ODDS_REDUCTION,
  COURIER_SKIM_PCT,
  CONSIGNED_BUST_HEAT_FACTOR,
  ARREST_BOND_FRACTION,
  ARREST_BOND_MIN,
  ARREST_BOND_HEAT,
} from './config/transport';
export type { TransportId, TransportConfig } from './config/transport';
export {
  interdictionChance,
  interdictionBreakdown,
  quoteShipment,
  ship,
  travelStep,
  shipmentsInFlight,
  shipmentRoute,
  launchHeat,
  patternOddsSurcharge,
  patternHeatSurcharge,
  arrestBond,
  postBond,
  favorQuote,
  callFavor,
  declineFavor,
  massiveUncoveredSurcharge,
  helmingInFlight,
  peopleTotal,
  peopleOut,
  peopleAvailable,
  effectiveCargoCap,
} from './travel';
export type {
  Shipment,
  ShipIntent,
  ShipRejectReason,
  ShipmentQuote,
  ShipResult,
  PostBondResult,
  FavorQuote,
  FavorResult,
  OddsTerm,
  InterdictionBreakdown,
} from './travel';

// Owned vessels — the late-game logistics money sink (design/13 E) — Prompt 47.
export {
  VESSELS,
  VESSEL_MAX_LEVEL,
  VESSEL_COST_GROWTH,
  VESSEL_CARGO_GROWTH,
  getVessel,
} from './config/vessels';
export type { VesselId, VesselConfig } from './config/vessels';
export {
  vesselCargoCap,
  vesselUpgradeCost,
  vesselValue,
  vesselsValue,
  ownedVesselForMode,
  buyVessel,
  upgradeVessel,
} from './vessels';
export type { VesselResult, VesselRejectReason } from './vessels';

// Plugs — true-source connections (Ideas2 §2; design/11 §2).
export {
  buyPlug,
  hasPlug,
  plugQuote,
  plugQuotes,
  PLUG_MEETING_HEAT,
} from './plugs';
export type {
  BuyPlugIntent,
  PlugQuote,
  PlugResult,
  PlugRejectReason,
} from './plugs';

// Heat & law enforcement — Prompt 05.
export {
  addHeat,
  decayHeat,
  currentTier,
  tierForHeat,
  tierDots,
  checkTierEscalation,
  applyHeatEscalation,
  setLieLow,
  raidChance,
  rollRaid,
  investigationActive,
} from './heat';
export type {
  LeTier,
  TierEscalation,
  LieLowIntent,
  RaidEvent,
} from './heat';

// The six-source heat model (design/13 B5) — Prompt 44.
export {
  passiveHeatTerms,
  passiveHeatPerHour,
  heatSourcesStep,
  maybeOpenInvestigation,
  portUseKey,
  recentUseOf,
  bumpRecentUse,
} from './heatSources';
export type { PassiveHeatTerm } from './heatSources';
export {
  HEAT_MIN,
  HEAT_MAX,
  HEAT_TIERS,
  HEAT_DOTS_TOTAL,
  HEAT_DECAY_RATE_PER_HOUR,
  LIE_LOW_DECAY_MULTIPLIER,
  LIE_LOW_INCOME_MULTIPLIER,
  EMPIRE_DECAY_SLOWDOWN,
  PAYROLLED_COP_DECAY_MULTIPLIER,
  TIER_TELEGRAPH_MARGIN,
  RAID_TIPOFF_LOOKAHEAD_HOURS,
  RAID_TIPOFF_MIN_CHANCE,
  RAID_BASE_RATE_PER_HOUR,
  RAID_EMPIRE_FACTOR,
  SHIPMENT_LAUNCH_HEAT_FACTOR,
  SHIPMENT_LANDING_HEAT_FACTOR,
  CONCENTRATION_UNITS_THRESHOLD,
  CONCENTRATION_HEAT_PER_UNIT_HOUR,
  PATTERN_DECAY_PER_HOUR,
  PATTERN_HEAT_PER_USE,
  PATTERN_ODDS_PER_USE,
  RAID_SURVIVED_HEAT,
  RIVAL_CLASH_HEAT,
  CONSPICUOUS_PURCHASE_HEAT,
  CONSPICUOUS_FRONT_TYPES,
  INVESTIGATION_SPIKE_THRESHOLD,
  INVESTIGATION_HOURS,
  INVESTIGATION_DECAY_MULTIPLIER,
  INVESTIGATION_RAID_MULTIPLIER,
  EMPIRE_HEAT_PER_SIZE_HOUR,
  EMPIRE_HEAT_FREE_SIZE,
} from './config/heat';
export type { HeatTierConfig } from './config/heat';

// Contraband storage — Prompt 06.
export {
  STASH_TYPES,
  STARTING_STASH_TYPE,
  getStashType,
  stashCost,
  stashUpgradeCost,
  stashLevelCapacity,
  smallestLevelForCapacity,
  STASH_COST_GROWTH,
  STASH_MAX_LEVEL,
  STASH_CAPACITY_GROWTH,
  CREW_CARRY_PER_MEMBER,
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
  stashLevel,
  stashCapacity,
  capacityRemaining,
  effectiveCapacity,
  effectiveCapacityRemaining,
  effectiveSeizurePct,
  diversificationIndex,
  addStash,
  upgradeStash,
  nextUpgradeCost,
  foldStashesOnePerSpot,
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

// Meaningful territory expansion — Prompt 41 (Ideas2 item 5).
export {
  isHeldCountry,
  distinctCountriesHeld,
  newRegionDistance,
  footholdCost,
  countryName,
  requiresLieutenant,
  hasAvailableLieutenant,
  crewGateBlocksOpen,
  stashVulnerability,
  maxVulnerability,
  isStashConsolidated,
  isCountryConsolidated,
  consolidationProgress,
} from './territory';
export {
  TERRITORY_REACH_GROWTH,
  TERRITORY_NEW_REGION_JUMP,
  TERRITORY_TAKEOVER_HEAT,
  VULNERABILITY_WINDOW_HOURS,
  VULNERABILITY_RAID_MULTIPLIER,
  CONSOLIDATION_HOURS,
  TERRITORY_LT_REQUIRED_AFTER,
  territoryExpansionCost,
} from './config/territory';

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
  TRADE_LAUNDER_FRACTION,
  tradeLaunderCapacity,
  WASH_MAX_DEPOSIT,
  WASH_DEPOSITS_PER_DAY,
  WASH_CUT,
  washRatePerHour,
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
} from './laundering';
export type {
  OfflineReport,
  GoldenHourEvent,
  FrontResult,
  LaunderRejectReason,
} from './laundering';

// Money-mule wash queue — the batched dirty→clean converter (deposits under $10k
// over time; complements fronts, eats a cut). See engine/wash.ts.
export {
  washRate,
  washCut,
  washCleanRate,
  washEtaHours,
  queueWash,
  cancelWash,
  washStep,
} from './wash';
export type { WashResult, WashRejectReason } from './wash';

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
  LIEUTENANT_MAX_PRODUCTION_OPS,
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
  assignProduction,
  unassignProduction,
  frontLieutenantBonus,
  productionLieutenantBonus,
  crewPayrollPerWeek,
  chargeWages,
} from './crew';
export type {
  LoyaltyEvent,
  LoyaltyResult,
  RecruitResult,
  TrainResult,
  PromoteResult,
  PromoteTarget,
  CrewRejectReason,
  AssignProductionResult,
  AssignProductionReject,
  WageChargeResult,
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
  RAISE_MAX_MULTIPLE,
  RAISE_MIN_WEEKS_BETWEEN,
  MAJOR_PORT_COUNTRY_IDS,
  isMajorPort,
  PORT_MAJOR_ASK_MULTIPLE,
  PORT_MAJOR_DURATION_FRACTION,
  FAVOR_OFFICIAL_IDS,
  FAVOR_FEE_FRACTION,
  FAVOR_LOYALTY_COST,
  FAVOR_MIN_LOYALTY,
  MASSIVE_UNITS_THRESHOLD,
  MASSIVE_VALUE_THRESHOLD,
  MASSIVE_UNCOVERED_SURCHARGE,
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
  hasCustomsProtection,
  favorOfficialFor,
  spendFavorLoyalty,
  hasMassiveShipmentCoverage,
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

// Debt & loan sharks — capital source, come-up hook & lifeline — Prompt 10.
export {
  LENDERS,
  getLender,
  findLender,
  CAP_REPUTATION_FLOOR,
  CAP_REPUTATION_SCALE,
  CAP_COLLATERAL_FRACTION,
  INTEREST_DAYS_PER_WEEK,
  LADDER_MAX_RUNG,
  LADDER_SIGNS,
  LADDER_VIG_RATE_INCREASE,
  FIRST_LOAN_VIG_DAYS,
  LADDER_INCOME_CUT,
  LADDER_DAYS_PER_RUNG,
  CEILING_MAX_RUNG,
  LIFELINE_CAPITAL_THRESHOLD,
  LIFELINE_MIN_REPUTATION,
  LIFELINE_OFFER_FRACTION,
  DEBT_REPAY_REP_BONUS,
  DEBT_ONTIME_REP_BONUS,
} from './config/lenders';
export type {
  LenderId,
  LenderConfig,
  ConsequenceCeiling,
  LadderRung,
} from './config/lenders';
export {
  borrowCap,
  quoteLoan,
  borrow,
  accrueInterest,
  repay,
  defaultLadder,
  debtStep,
  enforcementStep,
  lifelineOffer,
  isDebtMarked,
  DEBT_MARKED_FLAG,
  DEBT_DEFAULT_CHOICE,
  DEBT_CLEARED_CHOICE,
  DEBT_COLLECTOR_CHOICE,
} from './debt';
export type {
  LoanQuote,
  BorrowResult,
  RepayResult,
  LenderOffer,
  DebtRejectReason,
} from './debt';

// Endgame — death spiral, permadeath, high score & prestige — Prompt 11.
export {
  EMPIRE_WEIGHTS,
  PRESTIGE_UNLOCKS,
  findPrestige,
  SPIRAL_HEAT_UNMANAGED,
  SPIRAL_HEAT_HUNTED,
  SPIRAL_RIVAL_HUNTED,
} from './config/prestige';
export type {
  PrestigeCategory,
  PrestigeRequirementKind,
  PrestigeUnlockConfig,
} from './config/prestige';
export {
  actReached,
  empireComposite,
  bankPeaks,
  operatingCapital,
  evaluateSpiral,
  runStats,
  evaluatePrestige,
  endRun,
  retire,
  LEGACY_MODE_ENABLED,
} from './endgame';
export type {
  SpiralStage,
  SpiralStep,
  SpiralExit,
  SpiralStatus,
  RunStats,
  RunEndCause,
  RunRecap,
  RunEndResult,
} from './endgame';

// Chaos Engine — procedural world events (design/05 §2; design/01 §4.7) — Prompt 12.
export {
  CHAOS_EVENTS,
  getChaosEvent,
  CHAOS_BASE_RATE_PER_HOUR,
  CHAOS_MAX_PER_TICK,
  ALT_ROUTE_FLAG,
  CHAOS_FLAG_PREFIX,
  CHAOS_MAJOR_DISRUPTION_FLAG,
  CHAOS_SUPPLY_SHOCK_FLAG,
} from './config/events';
export type { ChaosEventId, ChaosEffect, ChaosEventConfig } from './config/events';
export {
  chaosChance,
  rollChaos,
  applyChaos,
  chaosStep,
} from './chaos';
export type { ChaosEvent } from './chaos';

// World price events & the rumor ticker (design/12 Item 6) — Prompt 33.
export {
  MARKET_EVENT_RATE_PER_HOUR,
  RUMOR_TRUTH_RATE,
  RUMOR_LEAD_DAYS,
  RUMOR_TTL_DAYS,
  MARKET_EVENT_DURATION_DAYS,
  MARKET_EVENT_MODERATE_MULT,
  MARKET_EVENT_SHARP_MULT,
  MARKET_EVENT_SHARP_CHANCE,
  MARKET_EVENT_STOCK_SHOCK,
  MARKET_EVENT_MAX_ACTIVE,
  MARKET_EVENT_SCOPE_WEIGHTS,
} from './config/events';
export type {
  MarketEventScope,
  MarketEventMagnitude,
  MarketEventDirection,
} from './config/events';
export {
  marketEventStep,
  rollRumor,
  rumorChance,
  eventFromRumor,
  shockStockForEvent,
  eventCoversCountry,
} from './marketEvents';

// Narrative-beat engine — state → beats (design/05) — Prompt 12.
export {
  BEAT_TRIGGERS,
  checkBeats,
  isPlateau,
  beatStep,
  ON_THE_MAP_CLEAN_CASH,
  CROWN_PEAK_NET_WORTH,
  ARMS_UNLOCK_FLAG,
  INTERNATIONAL_ROUTES_FLAG,
  JUDGE_COMEBACK_FLAG,
  MAJOR_BEATS_PER_TICK,
} from './beats';
export type {
  BeatTrigger,
  BeatTriggerType,
  BeatAct,
  FiredBeat,
} from './beats';

// Story-card system — schema, registry & MVP content (design/08) — Prompt 13.
export {
  dominantRepTrack,
  validateCard,
  validateEffect,
  cardForBeat,
  cardForPending,
  applyChoice,
  applyEffect,
  getCard,
  allCards,
  isCardEligible,
  prerequisitesMet,
  hasCardFired,
  cardFiredFlag,
  variantText,
  auditRegistry,
  ALL_CARDS,
  CARD_FIRED_PREFIX,
  MVP_CRITICAL_BEATS,
  FIRST_SALE_FLAG,
  HEAT_LESSON_FLAG,
  FIRST_RUNNER_FLAG,
} from './cards';
export type {
  RepTrack,
  CardTriggerType,
  HookRole,
  CardArc,
  CardEffect,
  Choice,
  ReputationVariants,
  StoryCard,
  CardValidationIssue,
  ApplyChoiceReject,
  RegistryIssue,
} from './cards';

export const ENGINE_VERSION = '0.0.0' as const;

export interface Game {
  readonly version: string;
}

/** Minimal placeholder factory — proves the build/test wiring end to end. */
export function createGame(): Game {
  return { version: ENGINE_VERSION };
}
