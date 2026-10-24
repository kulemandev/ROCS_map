import type {
  ClusterContext,
  DatasetFeature,
  DatasetFeatureCollection,
  DatasetId,
  DatasetViewModel,
  LngLatCoordinate,
  Phase3Config,
  SelectedMapFeature,
  SiteAnalysisResult,
  SiteContext,
} from './types';

type DatasetLookup = Partial<Record<DatasetId, DatasetFeatureCollection>>;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineDistanceMeters(a: LngLatCoordinate, b: LngLatCoordinate): number {
  const earthRadius = 6371000;
  const deltaLat = toRadians(b[1] - a[1]);
  const deltaLon = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);

  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toLocalMeters(
  coordinate: LngLatCoordinate,
  referenceLatitudeDegrees: number,
): LngLatCoordinate {
  const metersPerDegreeLatitude = 111320;
  const metersPerDegreeLongitude = Math.cos(toRadians(referenceLatitudeDegrees)) * 111320;
  return [coordinate[0] * metersPerDegreeLongitude, coordinate[1] * metersPerDegreeLatitude];
}

function pointToSegmentDistanceMeters(
  point: LngLatCoordinate,
  segmentStart: LngLatCoordinate,
  segmentEnd: LngLatCoordinate,
): number {
  const referenceLatitude = (point[1] + segmentStart[1] + segmentEnd[1]) / 3;
  const [px, py] = toLocalMeters(point, referenceLatitude);
  const [ax, ay] = toLocalMeters(segmentStart, referenceLatitude);
  const [bx, by] = toLocalMeters(segmentEnd, referenceLatitude);
  const abx = bx - ax;
  const aby = by - ay;
  const abSquared = abx * abx + aby * aby;

  if (abSquared === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  const projection = ((px - ax) * abx + (py - ay) * aby) / abSquared;
  const clamped = Math.max(0, Math.min(1, projection));
  const closestX = ax + abx * clamped;
  const closestY = ay + aby * clamped;
  return Math.hypot(px - closestX, py - closestY);
}

function lineLengthMeters(coordinates: LngLatCoordinate[]): number {
  let total = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    total += haversineDistanceMeters(coordinates[index - 1], coordinates[index]);
  }

  return total;
}

function asCoordinatePair(value: unknown): LngLatCoordinate | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const longitude = Number(value[0]);
  const latitude = Number(value[1]);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return [longitude, latitude];
}

function getPointCoordinates(feature: DatasetFeature): LngLatCoordinate | null {
  if (!feature.geometry || feature.geometry.type !== 'Point') {
    return null;
  }

  return asCoordinatePair(feature.geometry.coordinates);
}

function getLineStrings(feature: DatasetFeature): LngLatCoordinate[][] {
  if (!feature.geometry || !feature.geometry.coordinates) {
    return [];
  }

  if (feature.geometry.type === 'LineString' && Array.isArray(feature.geometry.coordinates)) {
    const line = (feature.geometry.coordinates as unknown[])
      .map(asCoordinatePair)
      .filter((coordinate): coordinate is LngLatCoordinate => coordinate !== null);
    return line.length >= 2 ? [line] : [];
  }

  if (feature.geometry.type === 'MultiLineString' && Array.isArray(feature.geometry.coordinates)) {
    return (feature.geometry.coordinates as unknown[])
      .map((line) =>
        Array.isArray(line)
          ? line
              .map(asCoordinatePair)
              .filter((coordinate): coordinate is LngLatCoordinate => coordinate !== null)
          : [],
      )
      .filter((line): line is LngLatCoordinate[] => line.length >= 2);
  }

  return [];
}

function getFeatureId(feature: DatasetFeature, fallbackPrefix: string): string {
  if (feature.id !== undefined && feature.id !== null) {
    return String(feature.id);
  }

  const supportId = feature.properties.supportId;

  if (supportId !== undefined && supportId !== null) {
    return String(supportId);
  }

  return fallbackPrefix;
}

function getNearestDistanceToLineFeatures(
  point: LngLatCoordinate,
  features: DatasetFeature[],
): { distanceM: number | null; nearestFeature: DatasetFeature | null } {
  let minimumDistance = Number.POSITIVE_INFINITY;
  let nearestFeature: DatasetFeature | null = null;

  features.forEach((feature) => {
    getLineStrings(feature).forEach((line) => {
      for (let index = 1; index < line.length; index += 1) {
        const distance = pointToSegmentDistanceMeters(point, line[index - 1], line[index]);

        if (distance < minimumDistance) {
          minimumDistance = distance;
          nearestFeature = feature;
        }
      }
    });
  });

  return {
    distanceM: Number.isFinite(minimumDistance) ? minimumDistance : null,
    nearestFeature,
  };
}

function estimateFeatureLengthInsideRadius(
  point: LngLatCoordinate,
  feature: DatasetFeature,
  radiusM: number,
): number {
  let total = 0;

  getLineStrings(feature).forEach((line) => {
    for (let index = 1; index < line.length; index += 1) {
      const segmentStart = line[index - 1];
      const segmentEnd = line[index];
      const segmentLength = haversineDistanceMeters(segmentStart, segmentEnd);
      const sampleCount = Math.min(20, Math.max(3, Math.ceil(segmentLength / 200)));
      let insideSamples = 0;

      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const ratio = (sampleIndex + 0.5) / sampleCount;
        const longitude = segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * ratio;
        const latitude = segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * ratio;

        if (haversineDistanceMeters(point, [longitude, latitude]) <= radiusM) {
          insideSamples += 1;
        }
      }

      if (insideSamples > 0) {
        total += segmentLength * (insideSamples / sampleCount);
      }
    }
  });

  return total;
}

function getLineFeaturesWithinRadius(
  point: LngLatCoordinate,
  features: DatasetFeature[],
  radiusM: number,
): { features: DatasetFeature[]; estimatedLengthM: number; lineCodes: string[] } {
  const matches: DatasetFeature[] = [];
  const lineCodes: string[] = [];
  let estimatedLengthM = 0;

  features.forEach((feature) => {
    const estimatedInsideLength = estimateFeatureLengthInsideRadius(point, feature, radiusM);

    if (estimatedInsideLength <= 0) {
      return;
    }

    matches.push(feature);
    estimatedLengthM += estimatedInsideLength;

    const lineCode = feature.properties.code_ligne;

    if (lineCode !== undefined && lineCode !== null) {
      const normalizedCode = String(lineCode);

      if (!lineCodes.includes(normalizedCode)) {
        lineCodes.push(normalizedCode);
      }
    }
  });

  return { features: matches, estimatedLengthM, lineCodes };
}

function getPointFeatureDistances(
  point: LngLatCoordinate,
  features: DatasetFeature[],
): Array<{ feature: DatasetFeature; distanceM: number; coordinates: LngLatCoordinate }> {
  return features
    .map((feature) => {
      const coordinates = getPointCoordinates(feature);

      if (!coordinates) {
        return null;
      }

      return {
        feature,
        coordinates,
        distanceM: haversineDistanceMeters(point, coordinates),
      };
    })
    .filter(
      (entry): entry is { feature: DatasetFeature; distanceM: number; coordinates: LngLatCoordinate } =>
        entry !== null,
    );
}

function createCircleFeatureCollection(
  center: LngLatCoordinate,
  radiusM: number,
  featureId: string,
  properties: Record<string, unknown>,
): DatasetFeatureCollection {
  const earthRadius = 6371000;
  const steps = 48;
  const coordinates: LngLatCoordinate[] = [];
  const latitudeRadians = toRadians(center[1]);

  for (let step = 0; step <= steps; step += 1) {
    const angle = (Math.PI * 2 * step) / steps;
    const deltaNorth = Math.cos(angle) * radiusM;
    const deltaEast = Math.sin(angle) * radiusM;
    const latitude = center[1] + (deltaNorth / earthRadius) * (180 / Math.PI);
    const longitude =
      center[0] + (deltaEast / (earthRadius * Math.cos(latitudeRadians))) * (180 / Math.PI);
    coordinates.push([longitude, latitude]);
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: featureId,
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
        properties,
      },
    ],
  };
}

function createPointFeatureCollection(
  points: Array<{ id: string; coordinates: LngLatCoordinate; properties: Record<string, unknown> }>,
): DatasetFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      id: point.id,
      geometry: {
        type: 'Point',
        coordinates: point.coordinates,
      },
      properties: point.properties,
    })),
  };
}

function createFeatureCollectionFromFeatures(features: DatasetFeature[]): DatasetFeatureCollection {
  return {
    type: 'FeatureCollection',
    features,
  };
}

function averageCoordinates(coordinates: LngLatCoordinate[]): LngLatCoordinate {
  const totals = coordinates.reduce(
    (accumulator, coordinate) => [accumulator[0] + coordinate[0], accumulator[1] + coordinate[1]],
    [0, 0] as LngLatCoordinate,
  );

  return [totals[0] / coordinates.length, totals[1] / coordinates.length];
}

function getDatasetLookup(datasets: DatasetViewModel[]): DatasetLookup {
  const lookup: DatasetLookup = {};

  datasets.forEach((dataset) => {
    if (dataset.state.data) {
      lookup[dataset.definition.id] = dataset.state.data;
    }
  });

  return lookup;
}

function getDatasetAvailability(
  lookup: DatasetLookup,
  datasetId: DatasetId,
  limitations: string[],
  unavailableMessage: string,
): DatasetFeatureCollection | null {
  const dataset = lookup[datasetId];

  if (!dataset) {
    limitations.push(unavailableMessage);
    return null;
  }

  return dataset;
}

function hasEtcsLevel2Signal(values: string[]): boolean {
  return values.some((value) => {
    const label = value.toUpperCase();
    return (
      label.includes('ERTMS') ||
      label.includes('ETCS 2') ||
      label.includes('ETCS2') ||
      label.includes('ETCS LEVEL 2') ||
      label.includes('ETCS NIVEAU 2') ||
      label.includes('EUROPEAN TRAIN CONTROL SYSTEM 2')
    );
  });
}

function mergeFeatureCollections(
  ...collections: Array<DatasetFeatureCollection | null>
): DatasetFeatureCollection | null {
  const available = collections.filter(
    (collection): collection is DatasetFeatureCollection => collection !== null,
  );
  if (available.length === 0) {
    return null;
  }
  return {
    type: 'FeatureCollection',
    features: available.flatMap((collection) => collection.features),
  };
}

function deriveRadioDensityClass(count: number, denseThreshold: number): 'isolated' | 'moderate' | 'dense' {
  if (count >= denseThreshold) {
    return 'dense';
  }

  if (count >= Math.max(2, Math.floor(denseThreshold / 2))) {
    return 'moderate';
  }

  return 'isolated';
}

function buildComplexitySignals(
  context: {
    stationNearby: boolean | null;
    tunnelNearby: boolean | null;
    nearbyRadioSiteCount: number;
    denseSiteThreshold: number;
    radioSolTrainNearbyCount: number | null;
    kvbNearbyCount: number | null;
    cantonnementTypes: string[];
    hasEtcsNearby: boolean | null;
    trackCircuitNearbyCount: number | null;
    trackCircuitSignalThreshold: number;
  },
): string[] {
  const signals: string[] = [];

  if (context.stationNearby) {
    signals.push('station proximity');
  }

  if (context.tunnelNearby) {
    signals.push('tunnel or complex-area proximity');
  }

  if (context.nearbyRadioSiteCount >= context.denseSiteThreshold) {
    signals.push('dense radio-site neighborhood');
  }

  if ((context.radioSolTrainNearbyCount ?? 0) > 0) {
    signals.push('radio sol-train or GSM-R context');
  }

  if ((context.kvbNearbyCount ?? 0) > 0) {
    signals.push('KVB infrastructure nearby');
  }

  if ((context.hasEtcsNearby ?? false) || context.cantonnementTypes.length > 0) {
    signals.push('signalling or ETCS context');
  }

  if ((context.trackCircuitNearbyCount ?? 0) >= context.trackCircuitSignalThreshold) {
    signals.push('track-circuit concentration');
  }

  return signals;
}

function computeLightSiteSignals(
  siteFeature: DatasetFeature,
  datasets: DatasetLookup,
  config: Phase3Config,
  anfrSites: DatasetFeatureCollection,
): string[] {
  const coordinates = getPointCoordinates(siteFeature);

  if (!coordinates) {
    return [];
  }

  const limitations: string[] = [];
  const railFeatures = getDatasetAvailability(
    datasets,
    'rfn-lines',
    limitations,
    'RFN line dataset disabled; rail distance could not be checked for some cluster members.',
  );
  const stations = datasets['stations'] ?? null;
  const tunnels = datasets['derived-tunnels'] ?? null;
  const radioSolTrain = datasets['radio-sol-train'] ?? null;
  const kvbLines = datasets['kvb-lines'] ?? null;
  const cantonnement = datasets['cantonnement'] ?? null;
  const futureErtms = datasets['future-ertms'] ?? null;
  const signalling = mergeFeatureCollections(cantonnement, futureErtms);
  const trackCircuits = datasets['track-circuits'] ?? null;

  const railDistance = railFeatures
    ? getNearestDistanceToLineFeatures(coordinates, railFeatures.features).distanceM
    : null;
  const nearbyStationsCount = stations
    ? getPointFeatureDistances(coordinates, stations.features).filter(
        (entry) => entry.distanceM <= config.stationThresholdM,
      ).length
    : null;
  const nearbyTunnelCount = tunnels
    ? getLineFeaturesWithinRadius(coordinates, tunnels.features, config.tunnelThresholdM).features.length
    : null;
  const nearbyRadioSiteCount = getPointFeatureDistances(coordinates, anfrSites.features).filter((entry) => {
    if (entry.feature === siteFeature) {
      return false;
    }
    return entry.distanceM <= config.densityRadiusM;
  }).length;
  const radioSolTrainNearbyCount = radioSolTrain
    ? getLineFeaturesWithinRadius(coordinates, radioSolTrain.features, config.influenceRadiusM).features
        .length
    : null;
  const kvbNearbyCount = kvbLines
    ? getLineFeaturesWithinRadius(coordinates, kvbLines.features, config.influenceRadiusM).features.length
    : null;
  const cantonnementTypes = signalling
    ? getLineFeaturesWithinRadius(coordinates, signalling.features, config.influenceRadiusM).features
        .map((feature) => String(feature.properties.libelle ?? ''))
        .filter((value) => value.length > 0)
    : [];
  const trackCircuitNearbyCount = trackCircuits
    ? getLineFeaturesWithinRadius(coordinates, trackCircuits.features, config.influenceRadiusM).features.length
    : null;

  return buildComplexitySignals({
    stationNearby: nearbyStationsCount !== null ? nearbyStationsCount > 0 : null,
    tunnelNearby: nearbyTunnelCount !== null ? nearbyTunnelCount > 0 : null,
    nearbyRadioSiteCount,
    denseSiteThreshold: config.denseSiteThreshold,
    radioSolTrainNearbyCount,
    kvbNearbyCount,
    cantonnementTypes,
    hasEtcsNearby: hasEtcsLevel2Signal(cantonnementTypes),
    trackCircuitNearbyCount,
    trackCircuitSignalThreshold: config.trackCircuitSignalThreshold,
  }).filter(() => railDistance === null || railDistance <= config.maxRailDistanceM);
}

function computeClusterCandidate(
  selectedFeature: DatasetFeature,
  selectedSiteCoordinates: LngLatCoordinate,
  selectedSignals: string[],
  anfrSites: DatasetFeatureCollection,
  datasets: DatasetLookup,
  config: Phase3Config,
): { cluster: ClusterContext | null; members: DatasetFeatureCollection | null; coverage: DatasetFeatureCollection | null } {
  if (selectedSignals.length < config.clusterComplexityThreshold) {
    return { cluster: null, members: null, coverage: null };
  }

  const allSiteDistances = getPointFeatureDistances(selectedSiteCoordinates, anfrSites.features);
  const candidateSites = allSiteDistances
    .filter((entry) => entry.distanceM <= config.clusterRadiusM)
    .sort((left, right) => left.distanceM - right.distanceM)
    .slice(0, config.clusterMaxMembers)
    .map((entry) => ({
      feature: entry.feature,
      coordinates: entry.coordinates,
      siteId: getFeatureId(entry.feature, 'cluster-site'),
      signals: computeLightSiteSignals(entry.feature, datasets, config, anfrSites),
    }))
    .filter((entry) => entry.signals.length >= config.clusterComplexityThreshold);

  if (candidateSites.length < config.clusterMinMembers) {
    return { cluster: null, members: null, coverage: null };
  }

  const memberCoordinates = candidateSites.map((entry) => entry.coordinates);
  const centroid = averageCoordinates(memberCoordinates);
  const furthestDistance = Math.max(
    ...memberCoordinates.map((coordinate) => haversineDistanceMeters(centroid, coordinate)),
  );
  const coverageRadiusM = Math.max(config.influenceRadiusM, furthestDistance + config.influenceRadiusM * 0.35);
  const sortedIds = candidateSites.map((entry) => entry.siteId).sort();
  const clusterId = `cluster-${sortedIds[0]}-${candidateSites.length}`;
  const cluster: ClusterContext = {
    clusterId,
    memberSiteIds: sortedIds,
    memberCount: candidateSites.length,
    memberPreview: sortedIds.slice(0, 8),
    coverageRadiusM,
    centroid,
    reason: `${candidateSites.length} complex radio sites are grouped within the current estimated cluster radius.`,
  };

  return {
    cluster,
    members: createPointFeatureCollection(
      candidateSites.map((entry) => ({
        id: entry.siteId,
        coordinates: entry.coordinates,
        properties: {
          siteId: entry.siteId,
          complexitySignals: entry.signals.join(', '),
        },
      })),
    ),
    coverage: createCircleFeatureCollection(centroid, coverageRadiusM, clusterId, {
      clusterId,
      memberCount: candidateSites.length,
    }),
  };
}

export function computeSelectedSiteAnalysis(
  selectedFeature: SelectedMapFeature | null,
  datasets: DatasetViewModel[],
  config: Phase3Config,
): SiteAnalysisResult {
  const emptyResult: SiteAnalysisResult = {
    siteContext: null,
    overlays: {
      selectedSite: null,
      influenceZone: null,
      influencedRail: null,
      clusterCoverage: null,
      clusterMembers: null,
    },
  };

  if (!selectedFeature || selectedFeature.datasetId !== 'anfr-sites' || !selectedFeature.coordinates) {
    return emptyResult;
  }

  const datasetLookup = getDatasetLookup(datasets);
  const limitations: string[] = [];
  const anfrSites = getDatasetAvailability(
    datasetLookup,
    'anfr-sites',
    limitations,
    'ANFR site dataset unavailable; selected-site analysis is incomplete.',
  );
  const rfnLines = getDatasetAvailability(
    datasetLookup,
    'rfn-lines',
    limitations,
    'RFN line dataset disabled; nearest-rail analysis is unavailable.',
  );

  if (!anfrSites) {
    return emptyResult;
  }

  const selectedSiteCoordinates = selectedFeature.coordinates;
  const selectedSiteRecord =
    anfrSites.features.find(
      (feature) =>
        String(feature.properties.supportId ?? '') === String(selectedFeature.properties.supportId ?? ''),
    ) ??
    anfrSites.features.find((feature) => {
      const coordinates = getPointCoordinates(feature);

      if (!coordinates) {
        return false;
      }

      return haversineDistanceMeters(coordinates, selectedSiteCoordinates) < 1;
    }) ??
    null;

  if (!selectedSiteRecord) {
    return emptyResult;
  }

  const selectedSiteId = String(selectedSiteRecord.properties.supportId ?? selectedSiteRecord.id ?? 'site');
  const influenceZone = createCircleFeatureCollection(selectedSiteCoordinates, config.influenceRadiusM, `${selectedSiteId}-zone`, {
    siteId: selectedSiteId,
    radiusM: config.influenceRadiusM,
  });
  const selectedPoint = createPointFeatureCollection([
    {
      id: selectedSiteId,
      coordinates: selectedSiteCoordinates,
      properties: {
        siteId: selectedSiteId,
      },
    },
  ]);

  const nearestRail = rfnLines
    ? getNearestDistanceToLineFeatures(selectedSiteCoordinates, rfnLines.features)
    : { distanceM: null, nearestFeature: null };
  const influencedRail = rfnLines
    ? getLineFeaturesWithinRadius(selectedSiteCoordinates, rfnLines.features, config.influenceRadiusM)
    : { features: [], estimatedLengthM: 0, lineCodes: [] };

  const stationDataset = datasetLookup['stations'] ?? null;
  const stationDistances = stationDataset
    ? getPointFeatureDistances(selectedSiteCoordinates, stationDataset.features)
    : [];
  const nearbyStations = stationDistances
    .filter((entry) => entry.distanceM <= config.stationThresholdM)
    .sort((left, right) => left.distanceM - right.distanceM);

  if (!stationDataset) {
    limitations.push('Station dataset disabled; station proximity is unavailable.');
  }

  const tunnelDataset = datasetLookup['derived-tunnels'] ?? null;
  const nearbyTunnels = tunnelDataset
    ? getLineFeaturesWithinRadius(selectedSiteCoordinates, tunnelDataset.features, config.tunnelThresholdM)
    : { features: [], estimatedLengthM: 0, lineCodes: [] };

  if (!tunnelDataset) {
    limitations.push('Optional tunnel dataset disabled; tunnel proximity is unavailable.');
  }

  const allRadioSiteDistances = getPointFeatureDistances(selectedSiteCoordinates, anfrSites.features);
  const nearbyRadioSites = allRadioSiteDistances
    .filter((entry) => {
      if (entry.feature === selectedSiteRecord) {
        return false;
      }
      return entry.distanceM <= config.densityRadiusM;
    })
    .sort((left, right) => left.distanceM - right.distanceM);

  const radioSolTrainDataset = datasetLookup['radio-sol-train'] ?? null;
  const radioSolTrain = radioSolTrainDataset
    ? getLineFeaturesWithinRadius(selectedSiteCoordinates, radioSolTrainDataset.features, config.influenceRadiusM)
    : { features: [], estimatedLengthM: 0, lineCodes: [] };

  if (!radioSolTrainDataset) {
    limitations.push('Radio sol-train dataset disabled; radio context is unavailable.');
  }

  const exploitationDataset = datasetLookup['exploitation-regime'] ?? null;
  const exploitationRegimes = exploitationDataset
    ? getLineFeaturesWithinRadius(selectedSiteCoordinates, exploitationDataset.features, config.influenceRadiusM).features
        .map((feature) => String(feature.properties.exploitati ?? ''))
        .filter((value) => value.length > 0)
        .filter((value, index, collection) => collection.indexOf(value) === index)
    : [];

  if (!exploitationDataset) {
    limitations.push('Exploitation-regime dataset disabled; operational regime context is unavailable.');
  }

  const kvbDataset = datasetLookup['kvb-lines'] ?? null;
  const kvbFeatures = kvbDataset
    ? getLineFeaturesWithinRadius(selectedSiteCoordinates, kvbDataset.features, config.influenceRadiusM)
    : { features: [], estimatedLengthM: 0, lineCodes: [] };

  if (!kvbDataset) {
    limitations.push('KVB dataset disabled; train-protection context is unavailable.');
  }

  const cantonnementDataset = datasetLookup['cantonnement'] ?? null;
  const futureErtmsDataset = datasetLookup['future-ertms'] ?? null;
  const signallingDataset = mergeFeatureCollections(cantonnementDataset, futureErtmsDataset);
  const cantonnementFeatures = signallingDataset
    ? getLineFeaturesWithinRadius(selectedSiteCoordinates, signallingDataset.features, config.influenceRadiusM)
    : { features: [], estimatedLengthM: 0, lineCodes: [] };
  const cantonnementTypes = cantonnementFeatures.features
    .map((feature) => String(feature.properties.libelle ?? ''))
    .filter((value) => value.length > 0)
    .filter((value, index, collection) => collection.indexOf(value) === index);

  if (!signallingDataset) {
    limitations.push('Current and future signalling datasets disabled; ETCS context is unavailable.');
  }

  const trackCircuitDataset = datasetLookup['track-circuits'] ?? null;
  const trackCircuits = trackCircuitDataset
    ? getLineFeaturesWithinRadius(selectedSiteCoordinates, trackCircuitDataset.features, config.influenceRadiusM)
    : { features: [], estimatedLengthM: 0, lineCodes: [] };

  if (!trackCircuitDataset) {
    limitations.push('Track-circuit dataset disabled; detection context is unavailable.');
  }

  const complexitySignals = buildComplexitySignals({
    stationNearby: nearbyStations.length > 0,
    tunnelNearby: nearbyTunnels.features.length > 0,
    nearbyRadioSiteCount: nearbyRadioSites.length,
    denseSiteThreshold: config.denseSiteThreshold,
    radioSolTrainNearbyCount: radioSolTrain.features.length,
    kvbNearbyCount: kvbFeatures.features.length,
    cantonnementTypes,
    hasEtcsNearby: hasEtcsLevel2Signal(cantonnementTypes),
    trackCircuitNearbyCount: trackCircuits.features.length,
    trackCircuitSignalThreshold: config.trackCircuitSignalThreshold,
  }).filter(() => nearestRail.distanceM === null || nearestRail.distanceM <= config.maxRailDistanceM);

  const clusterCandidate = computeClusterCandidate(
    selectedSiteRecord,
    selectedSiteCoordinates,
    complexitySignals,
    anfrSites,
    datasetLookup,
    config,
  );

  const siteContext: SiteContext = {
    siteId: selectedSiteId,
    stationId: String(selectedSiteRecord.properties.stationId ?? ''),
    operatorName: String(selectedSiteRecord.properties.operatorName ?? 'Unknown operator'),
    supportNature: String(selectedSiteRecord.properties.supportNature ?? 'Unknown nature'),
    supportHeightM: Number.isFinite(Number(selectedSiteRecord.properties.supportHeightM))
      ? Number(selectedSiteRecord.properties.supportHeightM)
      : null,
    coordinates: selectedSiteCoordinates,
    distanceToRailM: nearestRail.distanceM,
    withinRailThreshold: nearestRail.distanceM !== null ? nearestRail.distanceM <= config.maxRailDistanceM : null,
    nearestRailLineCode:
      nearestRail.nearestFeature && nearestRail.nearestFeature.properties.code_ligne !== undefined
        ? String(nearestRail.nearestFeature.properties.code_ligne)
        : null,
    influencedRailFeatureCount: influencedRail.features.length,
    influencedRailKm: influencedRail.estimatedLengthM / 1000,
    influencedRailLineCodes: influencedRail.lineCodes.slice(0, 12),
    nearestStationDistanceM: nearbyStations.length > 0 ? nearbyStations[0].distanceM : stationDataset ? null : null,
    nearbyStationsCount: stationDataset ? nearbyStations.length : null,
    stationNearby: stationDataset ? nearbyStations.length > 0 : null,
    nearestTunnelDistanceM:
      tunnelDataset && tunnelDataset.features.length > 0
        ? getNearestDistanceToLineFeatures(selectedSiteCoordinates, tunnelDataset.features).distanceM
        : null,
    nearbyTunnelCount: tunnelDataset ? nearbyTunnels.features.length : null,
    tunnelNearby: tunnelDataset ? nearbyTunnels.features.length > 0 : null,
    nearbyRadioSiteCount: nearbyRadioSites.length,
    nearbyRadioSiteIds: nearbyRadioSites
      .slice(0, 10)
      .map((entry, index) => getFeatureId(entry.feature, `radio-neighbor-${index}`)),
    radioDensityClass: deriveRadioDensityClass(nearbyRadioSites.length, config.denseSiteThreshold),
    radioSolTrainNearbyCount: radioSolTrainDataset ? radioSolTrain.features.length : null,
    radioSolTrainTypes: radioSolTrain.features
      .map((feature) => String(feature.properties.rst ?? ''))
      .filter((value) => value.length > 0)
      .filter((value, index, collection) => collection.indexOf(value) === index),
    exploitationRegimes,
    kvbNearbyCount: kvbDataset ? kvbFeatures.features.length : null,
    cantonnementTypes,
    hasEtcsNearby: signallingDataset ? hasEtcsLevel2Signal(cantonnementTypes) : null,
    trackCircuitNearbyCount: trackCircuitDataset ? trackCircuits.features.length : null,
    complexityScore: complexitySignals.length,
    complexitySignals,
    clusterCandidate: clusterCandidate.cluster,
    limitations,
  };

  return {
    siteContext,
    overlays: {
      selectedSite: selectedPoint,
      influenceZone,
      influencedRail: createFeatureCollectionFromFeatures(influencedRail.features),
      clusterCoverage: clusterCandidate.coverage,
      clusterMembers: clusterCandidate.members,
    },
  };
}
