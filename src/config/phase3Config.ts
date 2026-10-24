import type { Phase3Config } from '../context/types';

export const defaultPhase3Config: Phase3Config = {
  influenceRadiusM: 8000,
  maxRailDistanceM: 1500,
  stationThresholdM: 1500,
  tunnelThresholdM: 1200,
  densityRadiusM: 2000,
  denseSiteThreshold: 4,
  clusterRadiusM: 8000,
  clusterMinMembers: 3,
  clusterMaxMembers: 8,
  clusterComplexityThreshold: 2,
  trackCircuitSignalThreshold: 4,
};
