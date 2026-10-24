import { useEffect, useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import { appMetadata } from './config/appConfig';
import { defaultRocConfig } from './config/phase4Config';
import { computeSelectedSiteAnalysis } from './context/computeSiteContext';
import type { RocConfig, SelectedMapFeature } from './context/types';
import { useDatasetManager } from './data/useDatasetManager';
import { computeRocDecisions } from './rocs/decisionEngine';

function App() {
  const { datasets, visibleDatasets, toggleDataset, retryDataset } = useDatasetManager();
  const [selectedFeature, setSelectedFeature] = useState<SelectedMapFeature | null>(null);
  const [rocConfig, setRocConfig] = useState<RocConfig>(defaultRocConfig);

  useEffect(() => {
    if (!selectedFeature) {
      return;
    }

    const selectedDataset = datasets.find((entry) => entry.definition.id === selectedFeature.datasetId);

    if (!selectedDataset || !selectedDataset.state.enabled || selectedDataset.state.loadStatus !== 'loaded') {
      setSelectedFeature(null);
    }
  }, [datasets, selectedFeature]);

  const selectedSiteAnalysis = useMemo(
    () => computeSelectedSiteAnalysis(selectedFeature, visibleDatasets, rocConfig),
    [rocConfig, selectedFeature, visibleDatasets],
  );

  const rocDecisionResult = useMemo(
    () => computeRocDecisions(datasets, rocConfig),
    [datasets, rocConfig],
  );

  const selectedSiteId = selectedSiteAnalysis.siteContext?.siteId;
  const selectedDecision = selectedSiteId
    ? rocDecisionResult.decisionsBySiteId[selectedSiteId] ?? null
    : null;
  const selectedCluster = selectedDecision?.clusterId
    ? rocDecisionResult.clusters.find((cluster) => cluster.clusterId === selectedDecision.clusterId) ?? null
    : null;

  const handleConfigChange = <K extends keyof RocConfig>(id: K, value: RocConfig[K]) => {
    setRocConfig((currentConfig) => ({
      ...currentConfig,
      [id]: value,
    }));
  };

  const handleClearAndReset = () => {
    setSelectedFeature(null);
    setRocConfig({ ...defaultRocConfig });
  };

  return (
    <AppShell
      appMetadata={appMetadata}
      datasets={datasets}
      visibleDatasets={visibleDatasets}
      selectedFeature={selectedFeature}
      siteAnalysis={selectedSiteAnalysis}
      rocConfig={rocConfig}
      rocDecisionResult={rocDecisionResult}
      selectedDecision={selectedDecision}
      selectedCluster={selectedCluster}
      onConfigChange={handleConfigChange}
      onClearAndReset={handleClearAndReset}
      onFeatureSelect={setSelectedFeature}
      onToggleDataset={toggleDataset}
      onRetryDataset={retryDataset}
    />
  );
}

export default App;
