import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type {
  DatasetFeatureCollection,
  DatasetId,
  DatasetViewModel,
  PrisRCluster,
  RocDecisionResult,
  SelectedMapFeature,
  SiteAnalysisResult,
} from '../context/types';
import { datasetRegistry } from '../data/datasetRegistry';
import { Legend } from '../components/Legend';
import { baseMapStyle } from './mapStyle';
import { franceBounds, franceCenter, franceZoom } from './franceView';

const RESET_LABEL = 'Reset to France';
const DATASET_LAYER_PREFIX = 'dataset-layer-';
const DATASET_SOURCE_PREFIX = 'dataset-source-';
const ANALYSIS_SOURCE_PREFIX = 'analysis-source-';
const ANALYSIS_LAYER_PREFIX = 'analysis-layer-';
const ANTENNA_ICON_ID = 'rocs-antenna-site';

function createAntennaIcon(): ImageData {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    return new ImageData(size, size);
  }

  context.strokeStyle = '#000000';
  context.fillStyle = '#000000';
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(32, 19);
  context.lineTo(32, 48);
  context.moveTo(32, 31);
  context.lineTo(20, 54);
  context.moveTo(32, 31);
  context.lineTo(44, 54);
  context.moveTo(24, 45);
  context.lineTo(40, 45);
  context.moveTo(18, 55);
  context.lineTo(46, 55);
  context.stroke();

  context.beginPath();
  context.arc(32, 17, 4, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.arc(32, 17, 11, -0.75, 0.75);
  context.moveTo(32, 6);
  context.arc(32, 17, 11, Math.PI - 0.75, Math.PI + 0.75);
  context.stroke();

  context.lineWidth = 3;
  context.beginPath();
  context.arc(32, 17, 19, -0.68, 0.68);
  context.moveTo(32, -2);
  context.arc(32, 17, 19, Math.PI - 0.68, Math.PI + 0.68);
  context.stroke();

  return context.getImageData(0, 0, size, size);
}

function getEtcsFilter(): unknown[] {
  const label = [
    'upcase',
    [
      'concat',
      ['to-string', ['get', 'libelle']],
      ' ',
      ['to-string', ['get', 'mode']],
      ' ',
      ['to-string', ['get', 'type']],
    ],
  ];

  return [
    'any',
    ['in', 'ERTMS', label],
    ['in', 'ETCS 2', label],
    ['in', 'ETCS2', label],
    ['in', 'ETCS LEVEL 2', label],
    ['in', 'ETCS NIVEAU 2', label],
    ['in', 'EUROPEAN TRAIN CONTROL SYSTEM 2', label],
  ];
}

function getTvmFilter(): unknown[] {
  const label = [
    'upcase',
    [
      'concat',
      ['to-string', ['get', 'libelle']],
      ' ',
      ['to-string', ['get', 'mode']],
      ' ',
      ['to-string', ['get', 'type']],
    ],
  ];

  return [
    'any',
    ['in', 'TVM', label],
    ['in', 'TRANSMISSION VOIE-MACHINE', label],
  ];
}

interface MapViewProps {
  datasets: DatasetViewModel[];
  siteAnalysis: SiteAnalysisResult;
  decisionResult: RocDecisionResult;
  selectedCluster: PrisRCluster | null;
  onFeatureSelect: (feature: SelectedMapFeature | null) => void;
}

function getSourceId(datasetId: DatasetId): string {
  return `${DATASET_SOURCE_PREFIX}${datasetId}`;
}

function getLayerId(datasetId: DatasetId): string {
  return `${DATASET_LAYER_PREFIX}${datasetId}`;
}

function getDatasetIdFromLayerId(layerId: string): DatasetId | null {
  if (!layerId.startsWith(DATASET_LAYER_PREFIX)) {
    return null;
  }

  return layerId.replace(DATASET_LAYER_PREFIX, '').split('--')[0] as DatasetId;
}

function removeDatasetLayer(map: maplibregl.Map, datasetId: DatasetId) {
  const layerId = getLayerId(datasetId);
  const sourceId = getSourceId(datasetId);

  if (map.getLayer(`${layerId}--etcs`)) {
    map.removeLayer(`${layerId}--etcs`);
  }

  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }

  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

function removeAnalysisLayer(map: maplibregl.Map, id: string) {
  const layerId = `${ANALYSIS_LAYER_PREFIX}${id}`;
  const sourceId = `${ANALYSIS_SOURCE_PREFIX}${id}`;

  if (map.getLayer(layerId)) {
    map.removeLayer(layerId);
  }

  if (map.getSource(sourceId)) {
    map.removeSource(sourceId);
  }
}

function buildSelection(
  feature: maplibregl.MapGeoJSONFeature,
  dataset: DatasetViewModel,
): SelectedMapFeature {
  let coordinates: [number, number] | null = null;

  if (feature.geometry.type === 'Point' && Array.isArray(feature.geometry.coordinates)) {
    const rawCoordinates = feature.geometry.coordinates as number[];

    if (rawCoordinates.length >= 2) {
      coordinates = [Number(rawCoordinates[0]), Number(rawCoordinates[1])];
    }
  }

  return {
    datasetId: dataset.definition.id,
    datasetName: dataset.definition.name,
    sourceUrl: dataset.definition.sourceUrl,
    geometryType: feature.geometry.type,
    properties: feature.properties ?? {},
    coordinates,
  };
}

function addAnalysisFeatureCollection(
  map: maplibregl.Map,
  id: string,
  collection: DatasetFeatureCollection | null,
  layerType: 'fill' | 'line' | 'circle',
  paint: Record<string, unknown>,
) {
  removeAnalysisLayer(map, id);

  if (!collection || collection.features.length === 0) {
    return;
  }

  const sourceId = `${ANALYSIS_SOURCE_PREFIX}${id}`;
  const layerId = `${ANALYSIS_LAYER_PREFIX}${id}`;

  map.addSource(sourceId, {
    type: 'geojson',
    data: collection,
  });

  map.addLayer({
    id: layerId,
    type: layerType,
    source: sourceId,
    paint,
  });
}

export function MapView({
  datasets,
  siteAnalysis,
  decisionResult,
  selectedCluster,
  onFeatureSelect,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: baseMapStyle,
      center: franceCenter,
      zoom: franceZoom,
      maxZoom: 18,
      minZoom: 3.5,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({}), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 160, unit: 'metric' }), 'bottom-left');

    map.on('load', () => {
      if (!map.hasImage(ANTENNA_ICON_ID)) {
        map.addImage(ANTENNA_ICON_ID, createAntennaIcon(), {
          pixelRatio: 2,
          sdf: true,
        });
      }
      map.fitBounds(franceBounds, { padding: 32, duration: 0 });
      setMapReady(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    datasetRegistry.forEach((definition) => {
      removeDatasetLayer(map, definition.id);
    });

    const sortedDatasets = [...datasets].sort(
      (left, right) => left.definition.style.sortOrder - right.definition.style.sortOrder,
    );

    sortedDatasets.forEach((dataset) => {
      if (!dataset.state.data) {
        return;
      }

      const sourceId = getSourceId(dataset.definition.id);
      const layerId = getLayerId(dataset.definition.id);

      map.addSource(sourceId, {
        type: 'geojson',
        data: dataset.state.data,
      });

      if (dataset.definition.style.geometryType === 'line') {
        if (dataset.definition.id === 'cantonnement') {
          map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            filter: getTvmFilter() as never,
            paint: {
              'line-color': '#2f9e44',
              'line-opacity': 0.94,
              'line-width': 3,
            },
          });
          map.addLayer({
            id: `${layerId}--etcs`,
            type: 'line',
            source: sourceId,
            filter: getEtcsFilter() as never,
            paint: {
              'line-color': '#f4511e',
              'line-opacity': 0.98,
              'line-width': 3.5,
            },
          });
          return;
        }

        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': dataset.definition.style.color,
            'line-opacity': dataset.definition.style.opacity,
            'line-width': dataset.definition.style.width ?? 1.5,
            'line-dasharray': dataset.definition.style.dasharray ?? [1, 0],
          },
        });
        return;
      }

      if (dataset.definition.id === 'anfr-sites') {
        map.addLayer({
          id: layerId,
          type: 'symbol',
          source: sourceId,
          layout: {
            'icon-image': ANTENNA_ICON_ID,
            'icon-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 0.22,
              7, 0.42,
              10, 0.7,
              14, 0.9,
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
          paint: {
            'icon-color': [
              'match',
              ['get', 'rocDecision'],
              'HSRS', '#2f9e44',
              'ADSS', '#1c7ed6',
              'PRIS-R', '#f4511e',
              '#4b5563',
            ],
            'icon-opacity': 0.96,
            'icon-halo-color': '#ffffff',
            'icon-halo-width': 1.5,
          },
        });
        return;
      }

      map.addLayer({
        id: layerId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-color': dataset.definition.style.color,
          'circle-opacity': dataset.definition.style.opacity,
          'circle-radius': dataset.definition.style.radius ?? 4,
          'circle-stroke-color': dataset.definition.style.strokeColor ?? '#ffffff',
          'circle-stroke-width': dataset.definition.style.strokeWidth ?? 1,
        },
      });
    });
  }, [datasets, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(getSourceId('anfr-sites')) as maplibregl.GeoJSONSource | undefined;

    if (!mapReady || !source || !decisionResult.decisionFeatures) {
      return;
    }

    source.setData(decisionResult.decisionFeatures as GeoJSON.FeatureCollection);
  }, [decisionResult.decisionFeatures, mapReady]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    const interactiveLayers = datasets
      .filter((dataset) => dataset.definition.interactive)
      .flatMap((dataset) =>
        dataset.definition.id === 'cantonnement'
          ? [getLayerId(dataset.definition.id), `${getLayerId(dataset.definition.id)}--etcs`]
          : [getLayerId(dataset.definition.id)],
      )
      .filter((layerId) => map.getLayer(layerId));

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      if (interactiveLayers.length === 0) {
        onFeatureSelect(null);
        return;
      }

      const features = map.queryRenderedFeatures(event.point, { layers: interactiveLayers });

      if (features.length === 0) {
        onFeatureSelect(null);
        return;
      }

      const datasetId = getDatasetIdFromLayerId(features[0].layer.id);

      if (!datasetId) {
        onFeatureSelect(null);
        return;
      }

      const dataset = datasets.find((entry) => entry.definition.id === datasetId);

      if (!dataset) {
        onFeatureSelect(null);
        return;
      }

      onFeatureSelect(buildSelection(features[0], dataset));
    };

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      const hovered = map.queryRenderedFeatures(event.point, { layers: interactiveLayers });
      map.getCanvas().style.cursor = hovered.length > 0 ? 'pointer' : '';
    };

    map.on('click', handleClick);
    map.on('mousemove', handleMouseMove);

    return () => {
      map.off('click', handleClick);
      map.off('mousemove', handleMouseMove);
      map.getCanvas().style.cursor = '';
    };
  }, [datasets, mapReady, onFeatureSelect]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady) {
      return;
    }

    addAnalysisFeatureCollection(map, 'influence-zone', siteAnalysis.overlays.influenceZone, 'fill', {
      'fill-color': '#4b5563',
      'fill-opacity': 0.08,
    });
    addAnalysisFeatureCollection(map, 'influenced-rail', siteAnalysis.overlays.influencedRail, 'line', {
      'line-color': '#20252d',
      'line-width': 3.4,
      'line-opacity': 0.7,
    });
    const liveClusterCoverage: DatasetFeatureCollection | null = selectedCluster
      ? {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            id: selectedCluster.clusterId,
            geometry: selectedCluster.coverageGeometry,
            properties: { clusterId: selectedCluster.clusterId },
          }],
        }
      : null;
    const liveClusterMembers: DatasetFeatureCollection | null = selectedCluster && decisionResult.decisionFeatures
      ? {
          type: 'FeatureCollection',
          features: decisionResult.decisionFeatures.features.filter((feature) =>
            selectedCluster.memberSiteIds.includes(String(feature.properties.supportId ?? feature.id ?? '')),
          ),
        }
      : null;

    addAnalysisFeatureCollection(map, 'cluster-coverage', liveClusterCoverage, 'fill', {
      'fill-color': '#f4511e',
      'fill-opacity': 0.09,
    });
    addAnalysisFeatureCollection(map, 'cluster-members', liveClusterMembers, 'circle', {
      'circle-color': '#f4511e',
      'circle-radius': 9,
      'circle-opacity': 0,
      'circle-stroke-color': '#f4511e',
      'circle-stroke-width': 1.5,
    });
    addAnalysisFeatureCollection(map, 'selected-site', siteAnalysis.overlays.selectedSite, 'circle', {
      'circle-color': '#ffffff',
      'circle-radius': 12,
      'circle-opacity': 0,
      'circle-stroke-color': '#111827',
      'circle-stroke-width': 2.5,
    });
  }, [decisionResult.decisionFeatures, mapReady, selectedCluster, siteAnalysis]);

  const handleResetView = () => {
    mapRef.current?.fitBounds(franceBounds, {
      padding: 32,
      duration: 900,
      essential: true,
    });
  };

  return (
    <section className="map-stage" aria-label="ROCS live decision map">
      <div className="map-stage__header">
        <h2>French Republic Context</h2>
      </div>

      <div className="map-frame">
        <div ref={mapContainerRef} className="map-canvas" />

        <div className="map-overlay map-overlay--left">
          <button type="button" className="map-action" onClick={handleResetView}>
            {RESET_LABEL}
          </button>
        </div>

      </div>

      <div className="map-legend">
        <h2>Map Legend</h2>
        <Legend />
      </div>
    </section>
  );
}
