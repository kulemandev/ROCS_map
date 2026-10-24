import type { ChangeEvent } from 'react';
import type { RocConfig } from '../context/types';

interface NumericControl {
  id: keyof RocConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  suffix: string;
  helper: string;
}

const numericControls: NumericControl[] = [
  { id: 'influenceRadiusM', label: 'Influence radius', min: 2000, max: 20000, step: 500, suffix: 'm', helper: 'Estimated geometry, not validated radio coverage.' },
  { id: 'maxRailDistanceM', label: 'Max rail distance', min: 200, max: 5000, step: 100, suffix: 'm', helper: 'Rail-adjacency threshold used by detailed site context.' },
  { id: 'stationThresholdM', label: 'Station threshold', min: 250, max: 5000, step: 100, suffix: 'm', helper: 'Distance at which station context becomes active.' },
  { id: 'tunnelThresholdM', label: 'Tunnel threshold', min: 250, max: 5000, step: 100, suffix: 'm', helper: 'Applies when the optional tunnel dataset is enabled.' },
  { id: 'densityRadiusM', label: 'Density radius', min: 500, max: 5000, step: 100, suffix: 'm', helper: 'Neighborhood used for live site-density scoring.' },
  { id: 'denseSiteThreshold', label: 'Dense-site threshold', min: 2, max: 12, step: 1, suffix: 'sites', helper: 'Neighbor count that adds a complexity signal.' },
  { id: 'clusterMinMembers', label: 'PRIS-R minimum members', min: 2, max: 8, step: 1, suffix: 'sites', helper: 'Minimum connected sites; each cluster is capped at 8 members.' },
];

interface ContextControlPanelProps {
  config: RocConfig;
  onChange: <K extends keyof RocConfig>(id: K, value: RocConfig[K]) => void;
}

export function ContextControlPanel({ config, onChange }: ContextControlPanelProps) {
  const numericChange =
    (id: keyof RocConfig) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      onChange(id, Number(event.target.value) as never);
    };

  return (
    <div className="control-stack">
      {numericControls.map((control) => (
        <div key={control.id} className="control-row">
          <div className="control-row__header">
            <label htmlFor={String(control.id)}>{control.label}</label>
            <strong>{Number(config[control.id]).toLocaleString()} {control.suffix}</strong>
          </div>
          <input
            id={String(control.id)}
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={Number(config[control.id])}
            onChange={numericChange(control.id)}
          />
          <p>{control.helper}</p>
        </div>
      ))}
    </div>
  );
}
