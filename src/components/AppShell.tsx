import type {
  DatasetId,
  DatasetViewModel,
  PrisRCluster,
  RocConfig,
  RocDecision,
  RocDecisionResult,
  SelectedMapFeature,
  SiteAnalysisResult,
} from '../context/types';
import { MapView } from '../map/MapView';
import {
  exportClusterGeoJson,
  exportDecisionCsv,
  exportDecisionGeoJson,
} from '../rocs/exportDecisions';
import { rocLegendItems } from '../rocs/legend';
import { ContextControlPanel } from './ContextControlPanel';
import { FeatureDetails } from './FeatureDetails';
import { SectionCard } from './SectionCard';

interface AppMetadata {
  title: string;
  subtitle: string;
}

interface AppShellProps {
  appMetadata: AppMetadata;
  datasets: DatasetViewModel[];
  visibleDatasets: DatasetViewModel[];
  selectedFeature: SelectedMapFeature | null;
  siteAnalysis: SiteAnalysisResult;
  rocConfig: RocConfig;
  rocDecisionResult: RocDecisionResult;
  selectedDecision: RocDecision | null;
  selectedCluster: PrisRCluster | null;
  onConfigChange: <K extends keyof RocConfig>(id: K, value: RocConfig[K]) => void;
  onClearAndReset: () => void;
  onFeatureSelect: (feature: SelectedMapFeature | null) => void;
  onToggleDataset: (id: DatasetId) => void;
  onRetryDataset: (id: DatasetId) => void;
}

function getRegistryStatus(dataset: DatasetViewModel): string {
  if (dataset.definition.source.kind === 'unavailable') {
    return 'unavailable';
  }

  if (!dataset.state.enabled) {
    return dataset.state.loadStatus === 'error' ? 'error' : 'disabled';
  }

  return dataset.state.loadStatus;
}

export function AppShell({
  appMetadata,
  datasets,
  visibleDatasets,
  selectedFeature,
  siteAnalysis,
  rocConfig,
  rocDecisionResult,
  selectedDecision,
  selectedCluster,
  onConfigChange,
  onClearAndReset,
  onFeatureSelect,
  onToggleDataset,
  onRetryDataset,
}: AppShellProps) {
  const futureErtmsDataset = datasets.find(
    (dataset) => dataset.definition.id === 'future-ertms',
  );
  const futureErtmsEnabled = futureErtmsDataset?.state.enabled ?? false;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Railway Operationally Compliant Slicing</p>
          <h1>{appMetadata.title}</h1>
          <p className="app-header__subtitle">{appMetadata.subtitle}</p>
        </div>

      </header>

      <main className="workspace-grid">
        <aside className="panel-column">
          <SectionCard title="ROCS Configuration" eyebrow="Live Decision Inputs">
            <ContextControlPanel config={rocConfig} onChange={onConfigChange} />
          </SectionCard>

          <SectionCard title="ERTMS Network Scenario">
            <div className="scenario-options" role="radiogroup" aria-label="ERTMS network scenario">
              <label className={`scenario-option${!futureErtmsEnabled ? ' scenario-option--selected' : ''}`}>
                <input
                  type="radio"
                  name="ertms-scenario"
                  checked={!futureErtmsEnabled}
                  onChange={() => {
                    if (futureErtmsEnabled) {
                      onToggleDataset('future-ertms');
                    }
                  }}
                />
                <span>
                  <strong>Current network</strong>
                  <small>Use only currently published ETCS/ERTMS sections.</small>
                </span>
              </label>

              <label className={`scenario-option${futureErtmsEnabled ? ' scenario-option--selected' : ''}`}>
                <input
                  type="radio"
                  name="ertms-scenario"
                  checked={futureErtmsEnabled}
                  onChange={() => {
                    if (!futureErtmsEnabled) {
                      onToggleDataset('future-ertms');
                    }
                  }}
                />
                <span>
                  <strong>2044 ERTMS plan</strong>
                  <small>Add every section included in the DGITM horizon-2044 plan.</small>
                </span>
              </label>
            </div>
            {futureErtmsDataset?.state.loadStatus === 'loading' ? (
              <p className="helper-copy">Loading the 2044 planned railway sections...</p>
            ) : null}
          </SectionCard>

          <SectionCard title="Public Dataset Registry" eyebrow="Data Sources">
            <div className="registry-list">
              {datasets.map((dataset) => {
                const registryStatus = getRegistryStatus(dataset);
                const unavailable = dataset.definition.source.kind === 'unavailable';
                const statusTone = `registry-item__status registry-item__status--${registryStatus}`;

                return (
                  <div key={dataset.definition.id} className="registry-item">
                    <div className="registry-item__title">
                      <input
                        type="checkbox"
                        disabled={unavailable}
                        checked={dataset.state.enabled}
                        onChange={() => onToggleDataset(dataset.definition.id)}
                      />
                      <span>{dataset.definition.name}</span>
                    </div>

                    <span className={statusTone}>{registryStatus}</span>
                    <details className="registry-details">
                      <summary>Details</summary>
                      <div className="registry-details__body">
                        <p>{dataset.definition.description}</p>

                        <div className="registry-meta">
                          <span>{dataset.definition.type}</span>
                          <span>{dataset.definition.sourceLabel}</span>
                          {dataset.state.featureCount > 0 ? (
                            <span>{dataset.state.featureCount.toLocaleString()} features</span>
                          ) : null}
                          {dataset.definition.heavy ? <span>large dataset</span> : null}
                        </div>

                        <p>{dataset.definition.notes}</p>

                        {dataset.state.loadStatus === 'error' ? (
                          <button
                            type="button"
                            className="inline-button"
                            onClick={() => onRetryDataset(dataset.definition.id)}
                          >
                            Retry load
                          </button>
                        ) : null}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </aside>

        <MapView
          datasets={visibleDatasets}
          siteAnalysis={siteAnalysis}
          decisionResult={rocDecisionResult}
          selectedCluster={selectedCluster}
          onFeatureSelect={onFeatureSelect}
        />

        <aside className="panel-column">
          <SectionCard
            title="Selected Feature"
            aside={
              <button type="button" className="inline-button" onClick={onClearAndReset}>
                Clear &amp; set ROCS defaults
              </button>
            }
          >
            <FeatureDetails
              selectedFeature={selectedFeature}
              siteContext={siteAnalysis.siteContext}
              decision={selectedDecision}
              cluster={selectedCluster}
              onClear={() => onFeatureSelect(null)}
            />
          </SectionCard>

          <SectionCard title="Deployment Overview">
            <div className="decision-summary">
              {rocLegendItems.map((item) => (
                <div key={item.algorithm} className="decision-summary__row">
                  <span className="dataset-swatch" style={{ backgroundColor: item.color }} />
                  <span>{item.algorithm}</span>
                  <strong>{rocDecisionResult.counts[item.algorithm].toLocaleString()}</strong>
                </div>
              ))}
            </div>
            <p className="helper-copy">
              {rocDecisionResult.clusters.length.toLocaleString()} active PRIS-R cluster(s).
            </p>
          </SectionCard>

          <SectionCard title="Export Current Results">
            <div className="export-actions">
              <button type="button" className="inline-button" onClick={() => exportDecisionGeoJson(rocDecisionResult)}>
                Site GeoJSON
              </button>
              <button type="button" className="inline-button" onClick={() => exportDecisionCsv(rocDecisionResult)}>
                Site CSV
              </button>
              <button type="button" className="inline-button" onClick={() => exportClusterGeoJson(rocDecisionResult.clusters)}>
                Cluster GeoJSON
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Safety Notice">
            <p className="helper-copy">
              These are public-data ROCS decision estimates. They are not an official SNCF
              deployment plan, validated FRMCS coverage map, vulnerability assessment, or
              engineering design.
            </p>
          </SectionCard>
        </aside>
      </main>
    </div>
  );
}
