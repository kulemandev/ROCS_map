export type RocAlgorithm =
  | 'HSRS'
  | 'ADSS'
  | 'PRIS-R';

export type DatasetId =
  | 'rfn-lines'
  | 'anfr-sites'
  | 'radio-sol-train'
  | 'exploitation-regime'
  | 'kvb-lines'
  | 'cantonnement'
  | 'track-circuits'
  | 'stations'
  | 'future-ertms'
  | 'derived-tunnels';

export type DatasetRuntimeStatus = 'idle' | 'loading' | 'loaded' | 'error' | 'unavailable';

export type DatasetGeometryType = 'line' | 'point';
export type LngLatCoordinate = [number, number];

export interface DatasetGeometry {
  type: string;
  coordinates?: unknown;
}

export interface DatasetFeature {
  type: 'Feature';
  id?: string | number;
  geometry: DatasetGeometry | null;
  properties: Record<string, unknown>;
}

export interface DatasetFeatureCollection {
  type: 'FeatureCollection';
  features: DatasetFeature[];
}

export interface DatasetStyleDefinition {
  geometryType: DatasetGeometryType;
  color: string;
  opacity: number;
  width?: number;
  radius?: number;
  dasharray?: number[];
  sortOrder: number;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface CsvSourceGeometry {
  type: 'point';
  latitudeField: string;
  longitudeField: string;
}

export type DatasetSourceDefinition =
  | {
      kind: 'geojson';
      location: 'remote' | 'local';
      url: string;
    }
  | {
      kind: 'csv';
      location: 'remote' | 'local';
      url: string;
      delimiter?: string;
      geometry: CsvSourceGeometry;
      idField?: string;
    }
  | {
      kind: 'unavailable';
      reason: string;
    };

export interface DatasetRegistryItem {
  id: DatasetId;
  layer: 'layer-2';
  name: string;
  shortName: string;
  sourceLabel: string;
  sourceUrl: string;
  type: string;
  optional: boolean;
  enabledByDefault: boolean;
  description: string;
  notes: string;
  heavy?: boolean;
  interactive: boolean;
  source: DatasetSourceDefinition;
  style: DatasetStyleDefinition;
}

export interface DatasetRuntimeState {
  enabled: boolean;
  loadStatus: DatasetRuntimeStatus;
  error?: string;
  featureCount: number;
  data?: DatasetFeatureCollection;
}

export interface DatasetViewModel {
  definition: DatasetRegistryItem;
  state: DatasetRuntimeState;
}

export interface SelectedMapFeature {
  datasetId: DatasetId;
  datasetName: string;
  sourceUrl: string;
  geometryType: string;
  properties: Record<string, unknown>;
  coordinates: LngLatCoordinate | null;
}

export interface Phase3Config {
  influenceRadiusM: number;
  maxRailDistanceM: number;
  stationThresholdM: number;
  tunnelThresholdM: number;
  densityRadiusM: number;
  denseSiteThreshold: number;
  clusterRadiusM: number;
  clusterMinMembers: number;
  clusterMaxMembers: number;
  clusterComplexityThreshold: number;
  trackCircuitSignalThreshold: number;
}

export interface RocConfig extends Phase3Config {
  adssComplexityThreshold: number;
}

export interface ClusterContext {
  clusterId: string;
  memberSiteIds: string[];
  memberCount: number;
  memberPreview: string[];
  coverageRadiusM: number;
  centroid: LngLatCoordinate;
  reason: string;
}

export interface SiteContext {
  siteId: string;
  stationId: string;
  operatorName: string;
  supportNature: string;
  supportHeightM: number | null;
  coordinates: LngLatCoordinate;
  distanceToRailM: number | null;
  withinRailThreshold: boolean | null;
  nearestRailLineCode: string | null;
  influencedRailFeatureCount: number;
  influencedRailKm: number;
  influencedRailLineCodes: string[];
  nearestStationDistanceM: number | null;
  nearbyStationsCount: number | null;
  stationNearby: boolean | null;
  nearestTunnelDistanceM: number | null;
  nearbyTunnelCount: number | null;
  tunnelNearby: boolean | null;
  nearbyRadioSiteCount: number;
  nearbyRadioSiteIds: string[];
  radioDensityClass: 'isolated' | 'moderate' | 'dense';
  radioSolTrainNearbyCount: number | null;
  radioSolTrainTypes: string[];
  exploitationRegimes: string[];
  kvbNearbyCount: number | null;
  cantonnementTypes: string[];
  hasEtcsNearby: boolean | null;
  trackCircuitNearbyCount: number | null;
  complexityScore: number;
  complexitySignals: string[];
  clusterCandidate: ClusterContext | null;
  limitations: string[];
}

export type RocConfidence = 'high' | 'medium' | 'low';

export interface RocDecision {
  siteId: string;
  selected: RocAlgorithm;
  clusterId?: string;
  confidence: RocConfidence;
  scores: Record<RocAlgorithm, number>;
  explanation: string[];
  inputs: string[];
}

export interface PrisRCluster {
  clusterId: string;
  memberSiteIds: string[];
  memberCount: number;
  centroid: LngLatCoordinate;
  coverageRadiusM: number;
  coverageGeometry: DatasetGeometry;
  reason: string[];
}

export interface RocDecisionResult {
  decisions: RocDecision[];
  decisionsBySiteId: Record<string, RocDecision>;
  decisionFeatures: DatasetFeatureCollection | null;
  clusters: PrisRCluster[];
  counts: Record<RocAlgorithm, number>;
}

export interface SiteAnalysisOverlays {
  selectedSite: DatasetFeatureCollection | null;
  influenceZone: DatasetFeatureCollection | null;
  influencedRail: DatasetFeatureCollection | null;
  clusterCoverage: DatasetFeatureCollection | null;
  clusterMembers: DatasetFeatureCollection | null;
}

export interface SiteAnalysisResult {
  siteContext: SiteContext | null;
  overlays: SiteAnalysisOverlays;
}
