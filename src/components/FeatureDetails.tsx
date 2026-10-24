import type {
  PrisRCluster,
  RocDecision,
  SelectedMapFeature,
  SiteContext,
} from '../context/types';
import { rocLegendItems } from '../rocs/legend';

function prettifyKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return 'n/a';
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

function formatDistance(distance: number | null): string {
  return distance === null ? 'n/a' : `${Math.round(distance).toLocaleString()} m`;
}

function formatCount(value: number | null): string {
  return value === null ? 'n/a' : value.toLocaleString();
}

function formatKilometers(value: number): string {
  return `${value.toFixed(2)} km`;
}

interface FeatureDetailsProps {
  selectedFeature: SelectedMapFeature | null;
  siteContext: SiteContext | null;
  decision: RocDecision | null;
  cluster: PrisRCluster | null;
  onClear: () => void;
}

function GenericDetails({ selectedFeature, onClear }: { selectedFeature: SelectedMapFeature; onClear: () => void }) {
  const entries = Object.entries(selectedFeature.properties).filter(([, value]) => value !== null);

  return (
    <div className="details-panel">
      <div className="details-panel__header">
        <div>
          <strong>{selectedFeature.datasetName}</strong>
          <p>{selectedFeature.geometryType}</p>
        </div>
        <button type="button" className="inline-button" onClick={onClear}>
          Clear
        </button>
      </div>

      <a className="details-panel__link" href={selectedFeature.sourceUrl} target="_blank" rel="noreferrer">
        Open source page
      </a>

      <dl className="details-grid">
        {entries.slice(0, 18).map(([key, value]) => (
          <div key={key} className="details-grid__row">
            <dt>{prettifyKey(key)}</dt>
            <dd>{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SiteContextDetails({
  selectedFeature,
  siteContext,
  decision,
  cluster,
  onClear,
}: {
  selectedFeature: SelectedMapFeature;
  siteContext: SiteContext;
  decision: RocDecision | null;
  cluster: PrisRCluster | null;
  onClear: () => void;
}) {
  const rawEntries = Object.entries(selectedFeature.properties).filter(([, value]) => value !== null);
  const decisionColor =
    rocLegendItems.find((item) => item.algorithm === decision?.selected)?.color ?? '#8f96a3';

  return (
    <div className="details-panel">
      <div className="details-panel__header">
        <div>
          <strong>Candidate site {siteContext.siteId}</strong>
          <p>{siteContext.operatorName}</p>
        </div>
        <button type="button" className="inline-button" onClick={onClear}>
          Clear
        </button>
      </div>

      <a className="details-panel__link" href={selectedFeature.sourceUrl} target="_blank" rel="noreferrer">
        Open source page
      </a>

      <div className="decision-card" style={{ borderColor: decisionColor }}>
        <div className="decision-card__heading">
          <span className="decision-dot" style={{ backgroundColor: decisionColor }} />
          <div>
            <span>ROCS decision estimate</span>
            <strong>{decision?.selected ?? 'HSRS'}</strong>
          </div>
          <span className="confidence-pill">{decision?.confidence ?? 'low'} confidence</span>
        </div>
        {decision ? (
          <ul className="compact-list">
            {decision.explanation.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : (
          <p>The decision engine has no usable candidate-site record for this feature.</p>
        )}
      </div>

      <dl className="details-grid">
        <div className="details-grid__row">
          <dt>Support nature</dt>
          <dd>{siteContext.supportNature}</dd>
        </div>
        <div className="details-grid__row">
          <dt>Support height</dt>
          <dd>{siteContext.supportHeightM === null ? 'n/a' : `${siteContext.supportHeightM} m`}</dd>
        </div>
        <div className="details-grid__row">
          <dt>Nearest rail distance</dt>
          <dd>{formatDistance(siteContext.distanceToRailM)}</dd>
        </div>
        <div className="details-grid__row">
          <dt>Nearest RFN line code</dt>
          <dd>{siteContext.nearestRailLineCode ?? 'n/a'}</dd>
        </div>
        <div className="details-grid__row">
          <dt>Estimated influenced rail</dt>
          <dd>
            {siteContext.influencedRailFeatureCount.toLocaleString()} feature(s),{' '}
            {formatKilometers(siteContext.influencedRailKm)}
          </dd>
        </div>
        <div className="details-grid__row">
          <dt>Stations nearby</dt>
          <dd>
            {formatCount(siteContext.nearbyStationsCount)} within threshold, nearest{' '}
            {formatDistance(siteContext.nearestStationDistanceM)}
          </dd>
        </div>
        <div className="details-grid__row">
          <dt>Tunnels nearby</dt>
          <dd>
            {formatCount(siteContext.nearbyTunnelCount)} within threshold, nearest{' '}
            {formatDistance(siteContext.nearestTunnelDistanceM)}
          </dd>
        </div>
        <div className="details-grid__row">
          <dt>Radio-site density</dt>
          <dd>
            {siteContext.nearbyRadioSiteCount.toLocaleString()} nearby site(s), {siteContext.radioDensityClass}
          </dd>
        </div>
        <div className="details-grid__row">
          <dt>Radio sol-train context</dt>
          <dd>
            {formatCount(siteContext.radioSolTrainNearbyCount)} segment(s),{' '}
            {siteContext.radioSolTrainTypes.length > 0 ? siteContext.radioSolTrainTypes.join(', ') : 'n/a'}
          </dd>
        </div>
        <div className="details-grid__row">
          <dt>Exploitation regime</dt>
          <dd>{siteContext.exploitationRegimes.length > 0 ? siteContext.exploitationRegimes.join(', ') : 'n/a'}</dd>
        </div>
        <div className="details-grid__row">
          <dt>KVB nearby</dt>
          <dd>{formatCount(siteContext.kvbNearbyCount)} segment(s)</dd>
        </div>
        <div className="details-grid__row">
          <dt>Current / planned ETCS</dt>
          <dd>{siteContext.cantonnementTypes.length > 0 ? siteContext.cantonnementTypes.join(', ') : 'n/a'}</dd>
        </div>
      </dl>

      <div className="subsection-card">
        <h3>PRIS-R cluster assignment</h3>
        {cluster ? (
          <>
            <p>{cluster.clusterId} with {cluster.memberCount} member site(s).</p>
            <p>Coverage radius: {Math.round(cluster.coverageRadiusM).toLocaleString()} m</p>
            <p>Members: {cluster.memberSiteIds.slice(0, 12).join(', ')}{cluster.memberCount > 12 ? '…' : ''}</p>
          </>
        ) : (
          <p>This site is not assigned to a PRIS-R cluster under the current configuration.</p>
        )}
      </div>

      <div className="subsection-card">
        <h3>Source properties</h3>
        <dl className="details-grid">
          {rawEntries.slice(0, 12).map(([key, value]) => (
            <div key={key} className="details-grid__row">
              <dt>{prettifyKey(key)}</dt>
              <dd>{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function FeatureDetails({
  selectedFeature,
  siteContext,
  decision,
  cluster,
  onClear,
}: FeatureDetailsProps) {
  if (!selectedFeature) {
    return (
      <div className="empty-state">
        <strong>No feature selected yet</strong>
        <p>
          Click an ANFR candidate site to inspect its live ROCS decision, explanation, computed
          context, and PRIS-R cluster assignment.
        </p>
      </div>
    );
  }

  if (siteContext) {
    return (
      <SiteContextDetails
        selectedFeature={selectedFeature}
        siteContext={siteContext}
        decision={decision}
        cluster={cluster}
        onClear={onClear}
      />
    );
  }

  return <GenericDetails selectedFeature={selectedFeature} onClear={onClear} />;
}
