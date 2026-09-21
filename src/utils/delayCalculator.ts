import { FREIGHT_DELAY_MINUTES_PER_BLOCK_HOUR, PASSENGER_DELAY_MINUTES_PER_BLOCK_HOUR } from '../data/railwayOperations';

export interface SectionDelays {
  passengerDelayMins: number;
  freightDelayMins: number;
}

export function calculateSectionDelays(durationMins: number, sectionName?: string): SectionDelays {
  void sectionName;
  const safeDuration = Math.max(0, durationMins || 0);

  // These are planning coefficients, not measured values; production should derive them from historical detention data.
  return {
    passengerDelayMins: Math.round((safeDuration / 60) * PASSENGER_DELAY_MINUTES_PER_BLOCK_HOUR),
    freightDelayMins: Math.round((safeDuration / 60) * FREIGHT_DELAY_MINUTES_PER_BLOCK_HOUR),
  };
}