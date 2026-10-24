import type {
  DatasetFeature,
  DatasetFeatureCollection,
  DatasetId,
  DatasetViewModel,
  LngLatCoordinate,
  PrisRCluster,
  RocAlgorithm,
  RocConfig,
  RocDecision,
  RocDecisionResult,
} from '../context/types';

interface SiteRecord {
  feature: DatasetFeature;
  siteId: string;
  coordinates: LngLatCoordinate;
  nearbyCount: number;
  complexity: number;
  signals: string[];
  etcsNearby: boolean;
  currentEtcsNearby: boolean;
  futureEtcsNearby: boolean;
  tunnelNearby: boolean;
}

interface EtcsSegment {
  start: LngLatCoordinate;
  end: LngLatCoordinate;
}

const algorithms: RocAlgorithm[] = ['HSRS', 'ADSS', 'PRIS-R'];

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(a: LngLatCoordinate, b: LngLatCoordinate): number {
  const earthRadius = 6371000;
  const deltaLat = toRadians(b[1] - a[1]);
  const deltaLon = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function pointCoordinates(feature: DatasetFeature): LngLatCoordinate | null {
  const coordinates = feature.geometry?.coordinates;

  if (feature.geometry?.type !== 'Point' || !Array.isArray(coordinates)) {
    return null;
  }

  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
}

function coordinatePair(value: unknown): LngLatCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
}

function lineStrings(feature: DatasetFeature): LngLatCoordinate[][] {
  const coordinates = feature.geometry?.coordinates;

  if (!coordinates || !Array.isArray(coordinates)) {
    return [];
  }

  if (feature.geometry?.type === 'LineString') {
    const line = coordinates
      .map(coordinatePair)
      .filter((coordinate): coordinate is LngLatCoordinate => coordinate !== null);
    return line.length >= 2 ? [line] : [];
  }

  if (feature.geometry?.type === 'MultiLineString') {
    return coordinates
      .map((line) =>
        Array.isArray(line)
          ? line
              .map(coordinatePair)
              .filter((coordinate): coordinate is LngLatCoordinate => coordinate !== null)
          : [],
      )
      .filter((line): line is LngLatCoordinate[] => line.length >= 2);
  }

  return [];
}

function isEtcsLevel2(feature: DatasetFeature): boolean {
  const label = [
    feature.properties.libelle,
    feature.properties.mode,
    feature.properties.type,
  ]
    .map((value) => String(value ?? '').toUpperCase())
    .join(' ');

  return (
    label.includes('ERTMS') ||
    label.includes('ETCS 2') ||
    label.includes('ETCS2') ||
    label.includes('ETCS LEVEL 2') ||
    label.includes('ETCS NIVEAU 2') ||
    label.includes('EUROPEAN TRAIN CONTROL SYSTEM 2')
  );
}

function pointToSegmentDistanceMeters(
  point: LngLatCoordinate,
  start: LngLatCoordinate,
  end: LngLatCoordinate,
): number {
  const referenceLatitude = toRadians((point[1] + start[1] + end[1]) / 3);
  const longitudeScale = Math.cos(referenceLatitude) * 111320;
  const latitudeScale = 111320;
  const px = point[0] * longitudeScale;
  const py = point[1] * latitudeScale;
  const ax = start[0] * longitudeScale;
  const ay = start[1] * latitudeScale;
  const bx = end[0] * longitudeScale;
  const by = end[1] * latitudeScale;
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;

  if (lengthSquared === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const projection = Math.max(
    0,
    Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lengthSquared),
  );
  return Math.hypot(px - (ax + projection * abx), py - (ay + projection * aby));
}

function buildSegmentGrid(
  collection: DatasetFeatureCollection | undefined,
  radiusM: number,
  includeFeature: (feature: DatasetFeature) => boolean,
): Map<string, EtcsSegment[]> {
  const grid = new Map<string, EtcsSegment[]>();

  if (!collection) {
    return grid;
  }

  const size = cellSizeDegrees(radiusM);
  const radiusDegrees = radiusM / 111320;

  collection.features.filter(includeFeature).forEach((feature) => {
    lineStrings(feature).forEach((line) => {
      for (let index = 1; index < line.length; index += 1) {
        const segment = { start: line[index - 1], end: line[index] };
        const minLongitude = Math.min(segment.start[0], segment.end[0]) - radiusDegrees;
        const maxLongitude = Math.max(segment.start[0], segment.end[0]) + radiusDegrees;
        const minLatitude = Math.min(segment.start[1], segment.end[1]) - radiusDegrees;
        const maxLatitude = Math.max(segment.start[1], segment.end[1]) + radiusDegrees;

        for (
          let x = Math.floor(minLongitude / size);
          x <= Math.floor(maxLongitude / size);
          x += 1
        ) {
          for (
            let y = Math.floor(minLatitude / size);
            y <= Math.floor(maxLatitude / size);
            y += 1
          ) {
            const key = `${x}:${y}`;
            const segments = grid.get(key) ?? [];
            segments.push(segment);
            grid.set(key, segments);
          }
        }
      }
    });
  });

  return grid;
}

function isLineNearby(
  coordinates: LngLatCoordinate,
  grid: Map<string, EtcsSegment[]>,
  radiusM: number,
): boolean {
  const segments = grid.get(cellKey(coordinates, cellSizeDegrees(radiusM))) ?? [];
  return segments.some(
    (segment) =>
      pointToSegmentDistanceMeters(coordinates, segment.start, segment.end) <= radiusM,
  );
}

function siteId(feature: DatasetFeature, index: number): string {
  return String(feature.properties.supportId ?? feature.id ?? `site-${index + 1}`);
}

function cellSizeDegrees(radiusM: number): number {
  return Math.max(radiusM / 111320, 0.001);
}

function cellKey(coordinates: LngLatCoordinate, size: number): string {
  return `${Math.floor(coordinates[0] / size)}:${Math.floor(coordinates[1] / size)}`;
}

function neighborKeys(coordinates: LngLatCoordinate, size: number): string[] {
  const longitudeCell = Math.floor(coordinates[0] / size);
  const latitudeCell = Math.floor(coordinates[1] / size);
  const keys: string[] = [];

  for (let x = longitudeCell - 1; x <= longitudeCell + 1; x += 1) {
    for (let y = latitudeCell - 1; y <= latitudeCell + 1; y += 1) {
      keys.push(`${x}:${y}`);
    }
  }

  return keys;
}

function buildGrid(sites: SiteRecord[], radiusM: number): Map<string, SiteRecord[]> {
  const size = cellSizeDegrees(radiusM);
  const grid = new Map<string, SiteRecord[]>();

  sites.forEach((site) => {
    const key = cellKey(site.coordinates, size);
    const members = grid.get(key) ?? [];
    members.push(site);
    grid.set(key, members);
  });

  return grid;
}

function nearbySites(
  site: SiteRecord,
  grid: Map<string, SiteRecord[]>,
  radiusM: number,
): SiteRecord[] {
  const size = cellSizeDegrees(radiusM);

  return neighborKeys(site.coordinates, size)
    .flatMap((key) => grid.get(key) ?? [])
    .filter((candidate) => candidate.siteId !== site.siteId)
    .filter((candidate) => distanceMeters(site.coordinates, candidate.coordinates) < radiusM);
}

function averageCoordinates(sites: SiteRecord[]): LngLatCoordinate {
  const total = sites.reduce(
    (sum, site): LngLatCoordinate => [
      sum[0] + site.coordinates[0],
      sum[1] + site.coordinates[1],
    ],
    [0, 0] as LngLatCoordinate,
  );
  return [total[0] / sites.length, total[1] / sites.length];
}

function circleGeometry(center: LngLatCoordinate, radiusM: number) {
  const earthRadius = 6371000;
  const latitudeRadians = toRadians(center[1]);
  const ring: LngLatCoordinate[] = [];

  for (let step = 0; step <= 48; step += 1) {
    const angle = (Math.PI * 2 * step) / 48;
    const north = Math.cos(angle) * radiusM;
    const east = Math.sin(angle) * radiusM;
    ring.push([
      center[0] + (east / (earthRadius * Math.cos(latitudeRadians))) * (180 / Math.PI),
      center[1] + (north / earthRadius) * (180 / Math.PI),
    ]);
  }

  return { type: 'Polygon', coordinates: [ring] };
}

function availableDatasetIds(datasets: DatasetViewModel[]): Set<DatasetId> {
  return new Set(
    datasets
      .filter((dataset) => dataset.state.enabled && dataset.state.loadStatus === 'loaded')
      .map((dataset) => dataset.definition.id),
  );
}

function scoreTemplate(): Record<RocAlgorithm, number> {
  return { HSRS: 0, ADSS: 0, 'PRIS-R': 0 };
}

function createDecision(
  site: SiteRecord,
  selected: RocAlgorithm,
  explanation: string[],
  inputs: string[],
  scores: Record<RocAlgorithm, number>,
  clusterId?: string,
): RocDecision {
  const evidenceCount = inputs.length;

  return {
    siteId: site.siteId,
    selected,
    clusterId,
    confidence: evidenceCount >= 5 ? 'high' : evidenceCount >= 3 ? 'medium' : 'low',
    scores,
    explanation,
    inputs,
  };
}

function deriveSiteSignals(
  site: SiteRecord,
  config: RocConfig,
  available: Set<DatasetId>,
): void {
  const supportNature = String(site.feature.properties.supportNature ?? '').toLowerCase();
  const signals: string[] = [];

  if (
    supportNature.includes('tunnel') ||
    supportNature.includes('souterrain') ||
    site.tunnelNearby
  ) {
    signals.push('tunnel or underground environment');
  }

  if (site.nearbyCount >= config.denseSiteThreshold) {
    signals.push('dense radio-site neighborhood');
  }

  const operationalInputs: string[] = [];

  if (available.has('radio-sol-train')) {
    operationalInputs.push('GSM-R');
  }

  if (available.has('kvb-lines')) {
    operationalInputs.push('KVB/TVM');
  }

  if (site.currentEtcsNearby) {
    signals.push('ETCS Level 2/ERTMS section within influence radius');
  }

  if (site.futureEtcsNearby) {
    signals.push('planned ERTMS section within influence radius');
  }

  if (operationalInputs.length > 0) {
    signals.push(`operational signalling inputs enabled: ${operationalInputs.join(', ')}`);
  }

  site.signals = signals;
  site.complexity = signals.length;
}

function buildClusters(sites: SiteRecord[], config: RocConfig): PrisRCluster[] {
  const eligible = sites.filter(
    (site) =>
      site.etcsNearby &&
      site.complexity >= config.clusterComplexityThreshold,
  );
  const grid = buildGrid(eligible, config.clusterRadiusM);
  const byId = new Map(eligible.map((site) => [site.siteId, site]));
  const visited = new Set<string>();
  const clusters: PrisRCluster[] = [];

  eligible.forEach((seed) => {
    if (visited.has(seed.siteId)) {
      return;
    }

    const queue = [seed];
    const component: SiteRecord[] = [];
    visited.add(seed.siteId);

    while (queue.length > 0) {
      const current = queue.shift();

      if (!current) {
        continue;
      }

      component.push(current);
      nearbySites(current, grid, config.clusterRadiusM).forEach((neighbor) => {
        if (!visited.has(neighbor.siteId) && byId.has(neighbor.siteId)) {
          visited.add(neighbor.siteId);
          queue.push(neighbor);
        }
      });
    }

    const minimumMembers = Math.min(config.clusterMinMembers, config.clusterMaxMembers);

    if (component.length < minimumMembers) {
      return;
    }

    const groupCount = Math.ceil(component.length / config.clusterMaxMembers);
    const baseGroupSize = Math.floor(component.length / groupCount);
    const largerGroupCount = component.length % groupCount;
    let offset = 0;

    for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
      const groupSize = baseGroupSize + (groupIndex < largerGroupCount ? 1 : 0);
      const members = component.slice(offset, offset + groupSize);
      offset += groupSize;

      if (members.length < minimumMembers) {
        continue;
      }

      const memberSiteIds = members.map((site) => site.siteId).sort();
      const centroid = averageCoordinates(members);
      const furthestMemberM = Math.max(
        ...members.map((site) => distanceMeters(centroid, site.coordinates)),
      );
      const coverageRadiusM = Math.max(
        config.influenceRadiusM,
        furthestMemberM + config.influenceRadiusM * 0.35,
      );
      const clusterId = `PRISR-${clusters.length + 1}-${memberSiteIds[0]}`;

      clusters.push({
        clusterId,
        memberSiteIds,
        memberCount: memberSiteIds.length,
        centroid,
        coverageRadiusM,
        coverageGeometry: circleGeometry(centroid, coverageRadiusM),
        reason: [
          `${memberSiteIds.length} sites were partitioned from a connected ETCS-eligible candidate network using ${config.clusterRadiusM.toLocaleString()} m neighbor links.`,
        ],
      });
    }
  });

  return clusters;
}

function decideSite(
  site: SiteRecord,
  config: RocConfig,
  available: Set<DatasetId>,
  clusterBySiteId: Map<string, PrisRCluster>,
): RocDecision {
  const scores = scoreTemplate();
  const inputs = [
    `${site.nearbyCount} nearby radio sites`,
    `${site.complexity} enabled complexity signals`,
    `ETCS Level 2/ERTMS proximity: ${site.etcsNearby ? 'yes' : 'no'}`,
    ...site.signals,
  ];

  if (!available.has('rfn-lines')) {
    scores.HSRS = 100;
    return createDecision(
      site,
      'HSRS',
      ['HSRS is used as the safe default because RFN railway geometry is unavailable.'],
      inputs,
      scores,
    );
  }

  const cluster = clusterBySiteId.get(site.siteId);

  if (cluster) {
    scores['PRIS-R'] = 90 + Math.min(10, site.complexity);
    scores.ADSS = 55 + site.complexity * 4;
    scores.HSRS = 35;
    return createDecision(
      site,
      'PRIS-R',
      [
        `The site belongs to ${cluster.clusterId}, a ${cluster.memberCount}-site operational cluster.`,
        site.currentEtcsNearby
          ? 'A current ETCS Level 2/ERTMS section makes this site eligible for PRIS-R assessment.'
          : 'The enabled DGITM future ERTMS scenario makes this site eligible for PRIS-R assessment.',
        'Cluster-level proactive/reactive coordination outranks a local per-site decision.',
      ],
      inputs,
      scores,
      cluster.clusterId,
    );
  }

  if (site.complexity >= config.adssComplexityThreshold) {
    scores.ADSS = 75 + Math.min(20, site.complexity * 4);
    scores.HSRS = 55;
    return createDecision(
      site,
      'ADSS',
      ['Sufficient local context complexity supports near-real-time ADSS scheduling.'],
      inputs,
      scores,
    );
  }

  scores.HSRS = 75;
  scores.ADSS = 45;
  return createDecision(
    site,
    'HSRS',
    ['The site has usable rail context without enough live complexity to require ADSS or PRIS-R.'],
    inputs,
    scores,
  );
}

export function computeRocDecisions(
  datasets: DatasetViewModel[],
  config: RocConfig,
): RocDecisionResult {
  const available = availableDatasetIds(datasets);
  const anfr = datasets.find(
    (dataset) =>
      dataset.definition.id === 'anfr-sites' &&
      dataset.state.enabled &&
      dataset.state.loadStatus === 'loaded' &&
      dataset.state.data,
  )?.state.data;
  const counts = algorithms.reduce<Record<RocAlgorithm, number>>((result, algorithm) => {
    result[algorithm] = 0;
    return result;
  }, {} as Record<RocAlgorithm, number>);

  if (!anfr) {
    return {
      decisions: [],
      decisionsBySiteId: {},
      decisionFeatures: null,
      clusters: [],
      counts,
    };
  }

  const sites = anfr.features
    .map<SiteRecord | null>((feature, index) => {
      const coordinates = pointCoordinates(feature);
      return coordinates
        ? {
            feature,
            siteId: siteId(feature, index),
            coordinates,
            nearbyCount: 0,
            complexity: 0,
            signals: [] as string[],
            etcsNearby: false,
            currentEtcsNearby: false,
            futureEtcsNearby: false,
            tunnelNearby: false,
          }
        : null;
    })
    .filter((site): site is SiteRecord => site !== null);
  const densityGrid = buildGrid(sites, config.densityRadiusM);
  const cantonnement = datasets.find(
    (dataset) =>
      dataset.definition.id === 'cantonnement' &&
      dataset.state.enabled &&
      dataset.state.loadStatus === 'loaded' &&
      dataset.state.data,
  )?.state.data;
  const futureErtms = datasets.find(
    (dataset) =>
      dataset.definition.id === 'future-ertms' &&
      dataset.state.enabled &&
      dataset.state.loadStatus === 'loaded' &&
      dataset.state.data,
  )?.state.data;
  const tunnels = datasets.find(
    (dataset) =>
      dataset.definition.id === 'derived-tunnels' &&
      dataset.state.enabled &&
      dataset.state.loadStatus === 'loaded' &&
      dataset.state.data,
  )?.state.data;
  const currentEtcsGrid = buildSegmentGrid(cantonnement, config.influenceRadiusM, isEtcsLevel2);
  const futureEtcsGrid = buildSegmentGrid(futureErtms, config.influenceRadiusM, isEtcsLevel2);
  const tunnelGrid = buildSegmentGrid(tunnels, config.tunnelThresholdM, () => true);

  sites.forEach((site) => {
    site.nearbyCount = nearbySites(site, densityGrid, config.densityRadiusM).length;
    site.currentEtcsNearby = isLineNearby(
      site.coordinates,
      currentEtcsGrid,
      config.influenceRadiusM,
    );
    site.futureEtcsNearby = isLineNearby(
      site.coordinates,
      futureEtcsGrid,
      config.influenceRadiusM,
    );
    site.etcsNearby = site.currentEtcsNearby || site.futureEtcsNearby;
    site.tunnelNearby = isLineNearby(site.coordinates, tunnelGrid, config.tunnelThresholdM);
    deriveSiteSignals(site, config, available);
  });

  const clusters = buildClusters(sites, config);
  const clusterBySiteId = new Map<string, PrisRCluster>();
  clusters.forEach((cluster) => {
    cluster.memberSiteIds.forEach((memberId) => clusterBySiteId.set(memberId, cluster));
  });

  const decisions = sites.map((site) =>
    decideSite(site, config, available, clusterBySiteId),
  );
  const decisionsBySiteId = decisions.reduce<Record<string, RocDecision>>((result, decision) => {
    result[decision.siteId] = decision;
    counts[decision.selected] += 1;
    return result;
  }, {});

  return {
    decisions,
    decisionsBySiteId,
    clusters,
    counts,
    decisionFeatures: {
      type: 'FeatureCollection',
      features: sites.map((site) => {
        const decision = decisionsBySiteId[site.siteId];
        return {
          ...site.feature,
          properties: {
            ...site.feature.properties,
            rocDecision: decision.selected,
            rocConfidence: decision.confidence,
            rocClusterId: decision.clusterId ?? '',
            rocEtcsLevel2Nearby: site.etcsNearby,
            rocCurrentEtcsNearby: site.currentEtcsNearby,
            rocFutureErtmsNearby: site.futureEtcsNearby,
            rocTunnelNearby: site.tunnelNearby,
            rocExplanation: decision.explanation.join(' '),
          },
        };
      }),
    },
  };
}
