import type { RocAlgorithm } from '../context/types';

export interface RocLegendItem {
  algorithm: RocAlgorithm;
  color: string;
  description: string;
}

export const rocLegendItems: RocLegendItem[] = [
  {
    algorithm: 'HSRS',
    color: '#2f9e44',
    description: 'Local deterministic slicing',
  },
  {
    algorithm: 'ADSS',
    color: '#1c7ed6',
    description: 'Local intelligent near-real-time scheduling',
  },
  {
    algorithm: 'PRIS-R',
    color: '#f4511e',
    description: 'Operation-aware proactive/reactive mode',
  },
];
