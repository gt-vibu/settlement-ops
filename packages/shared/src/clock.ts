/**
 * Clock port.
 *
 * Domain code never calls Date.now() directly. Deterministic scenario replay
 * (specs/SCENARIO_ENGINE.md) and reproducible evaluation runs both require that
 * time be injectable.
 */

export interface Clock {
  now(): Date;
}

export const systemClock = (): Clock => ({ now: () => new Date() });

export const fixedClock = (at: Date): Clock => ({ now: () => new Date(at.getTime()) });
