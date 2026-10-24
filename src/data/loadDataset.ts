import type {
  CsvSourceGeometry,
  DatasetFeature,
  DatasetFeatureCollection,
  DatasetRegistryItem,
} from '../context/types';

function isFeatureCollection(value: unknown): value is DatasetFeatureCollection {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as DatasetFeatureCollection;
  return record.type === 'FeatureCollection' && Array.isArray(record.features);
}

function splitCsvRow(row: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    const nextCharacter = row[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === delimiter && !insideQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  fields.push(current);
  return fields;
}

function csvToFeatureCollection(
  text: string,
  geometry: CsvSourceGeometry,
  delimiter: string,
  idField?: string,
): DatasetFeatureCollection {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);

  if (lines.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  const headers = splitCsvRow(lines[0], delimiter);
  const features: DatasetFeature[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = splitCsvRow(lines[index], delimiter);
    const properties: Record<string, unknown> = {};

    headers.forEach((header, headerIndex) => {
      properties[header] = values[headerIndex] ?? '';
    });

    if (geometry.type === 'point') {
      const latitude = Number(String(properties[geometry.latitudeField] ?? '').replace(',', '.'));
      const longitude = Number(String(properties[geometry.longitudeField] ?? '').replace(',', '.'));

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        continue;
      }

      features.push({
        type: 'Feature',
        id: idField ? String(properties[idField] ?? `${index}`) : undefined,
        geometry: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        properties,
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

async function loadGeoJson(url: string): Promise<DatasetFeatureCollection> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading ${url}`);
  }

  const payload = (await response.json()) as unknown;

  if (!isFeatureCollection(payload)) {
    throw new Error('Unexpected GeoJSON payload received.');
  }

  return payload;
}

async function loadCsv(
  url: string,
  geometry: CsvSourceGeometry,
  delimiter = ';',
  idField?: string,
): Promise<DatasetFeatureCollection> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading ${url}`);
  }

  const payload = await response.text();
  return csvToFeatureCollection(payload, geometry, delimiter, idField);
}

export async function loadDataset(dataset: DatasetRegistryItem): Promise<DatasetFeatureCollection> {
  if (dataset.source.kind === 'unavailable') {
    throw new Error(dataset.source.reason);
  }

  if (dataset.source.kind === 'geojson') {
    return loadGeoJson(dataset.source.url);
  }

  return loadCsv(
    dataset.source.url,
    dataset.source.geometry,
    dataset.source.delimiter,
    dataset.source.idField,
  );
}
