import { useEffect, useMemo, useState } from 'react';
import type {
  DatasetId,
  DatasetRuntimeState,
  DatasetRuntimeStatus,
  DatasetViewModel,
} from '../context/types';
import { loadDataset } from './loadDataset';
import { datasetRegistry } from './datasetRegistry';

function getInitialLoadStatus(id: DatasetId): DatasetRuntimeStatus {
  const definition = datasetRegistry.find((entry) => entry.id === id);

  if (!definition) {
    return 'error';
  }

  return definition.source.kind === 'unavailable' ? 'unavailable' : 'idle';
}

function createInitialState(): Record<DatasetId, DatasetRuntimeState> {
  return datasetRegistry.reduce<Record<DatasetId, DatasetRuntimeState>>((accumulator, definition) => {
    accumulator[definition.id] = {
      enabled: definition.enabledByDefault && definition.source.kind !== 'unavailable',
      loadStatus: getInitialLoadStatus(definition.id),
      featureCount: 0,
    };
    return accumulator;
  }, {} as Record<DatasetId, DatasetRuntimeState>);
}

export function useDatasetManager() {
  const [stateById, setStateById] = useState<Record<DatasetId, DatasetRuntimeState>>(() =>
    createInitialState(),
  );

  useEffect(() => {
    const pendingLoads = datasetRegistry.filter((definition) => {
      const runtime = stateById[definition.id];
      return runtime.enabled && runtime.loadStatus === 'idle';
    });

    pendingLoads.forEach((definition) => {
      setStateById((currentState) => {
        const currentRuntime = currentState[definition.id];

        if (currentRuntime.loadStatus !== 'idle') {
          return currentState;
        }

        return {
          ...currentState,
          [definition.id]: {
            ...currentRuntime,
            loadStatus: 'loading',
            error: undefined,
          },
        };
      });

      loadDataset(definition)
        .then((data) => {
          setStateById((currentState) => ({
            ...currentState,
            [definition.id]: {
              ...currentState[definition.id],
              loadStatus: 'loaded',
              featureCount: data.features.length,
              data,
              error: undefined,
            },
          }));
        })
        .catch((error: Error) => {
          setStateById((currentState) => ({
            ...currentState,
            [definition.id]: {
              ...currentState[definition.id],
              loadStatus: 'error',
              error: error.message,
            },
          }));
        });
    });
  }, [stateById]);

  const toggleDataset = (id: DatasetId) => {
    setStateById((currentState) => {
      const currentRuntime = currentState[id];
      const definition = datasetRegistry.find((entry) => entry.id === id);

      if (!definition || definition.source.kind === 'unavailable') {
        return currentState;
      }

      return {
        ...currentState,
        [id]: {
          ...currentRuntime,
          enabled: !currentRuntime.enabled,
        },
      };
    });
  };

  const retryDataset = (id: DatasetId) => {
    setStateById((currentState) => ({
      ...currentState,
      [id]: {
        ...currentState[id],
        loadStatus: 'idle',
        error: undefined,
      },
    }));
  };

  const datasets = useMemo<DatasetViewModel[]>(
    () =>
      datasetRegistry.map((definition) => ({
        definition,
        state: stateById[definition.id],
      })),
    [stateById],
  );

  const visibleDatasets = useMemo(
    () =>
      datasets.filter(
        (entry) => entry.state.enabled && entry.state.loadStatus === 'loaded' && entry.state.data,
      ),
    [datasets],
  );

  return {
    datasets,
    visibleDatasets,
    toggleDataset,
    retryDataset,
  };
}
