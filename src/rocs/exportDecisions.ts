import type { PrisRCluster, RocDecisionResult } from '../context/types';

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportDecisionGeoJson(result: RocDecisionResult): void {
  if (!result.decisionFeatures) {
    return;
  }

  download(
    'rocs-site-decisions.geojson',
    JSON.stringify(result.decisionFeatures, null, 2),
    'application/geo+json',
  );
}

export function exportDecisionCsv(result: RocDecisionResult): void {
  const header = ['site_id', 'decision', 'confidence', 'cluster_id', 'explanation', 'inputs'];
  const rows = result.decisions.map((decision) =>
    [
      decision.siteId,
      decision.selected,
      decision.confidence,
      decision.clusterId ?? '',
      decision.explanation.join(' | '),
      decision.inputs.join(' | '),
    ]
      .map(escapeCsv)
      .join(','),
  );
  download('rocs-site-decisions.csv', [header.join(','), ...rows].join('\n'), 'text/csv');
}

export function exportClusterGeoJson(clusters: PrisRCluster[]): void {
  download(
    'rocs-pris-r-clusters.geojson',
    JSON.stringify(
      {
        type: 'FeatureCollection',
        features: clusters.map((cluster) => ({
          type: 'Feature',
          id: cluster.clusterId,
          geometry: cluster.coverageGeometry,
          properties: {
            clusterId: cluster.clusterId,
            memberCount: cluster.memberCount,
            memberSiteIds: cluster.memberSiteIds.join(','),
            reason: cluster.reason.join(' '),
          },
        })),
      },
      null,
      2,
    ),
    'application/geo+json',
  );
}
