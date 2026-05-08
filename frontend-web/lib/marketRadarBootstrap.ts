/**
 * Market Radar data bootstrap policy.
 *
 * When `NEXT_PUBLIC_MARKET_RADAR_REQUIRE_INTENT=1`, `MarketRadar` does not call the
 * aggregator until the user applies an intent keyword (trim length ≥ 2). The map
 * then loads points (still mock or future API) scoped to that query.
 *
 * Default (unset) keeps legacy behaviour: full mock corpus on mount for demos.
 */

export function marketRadarRequiresIntentBeforeData(): boolean {
  return process.env.NEXT_PUBLIC_MARKET_RADAR_REQUIRE_INTENT === '1';
}
