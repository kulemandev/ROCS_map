#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import io
import json
import zipfile
from pathlib import Path


def dms_to_decimal(degrees: str, minutes: str, seconds: str, hemisphere: str) -> float:
    sign = -1 if hemisphere in {"S", "W"} else 1
    value = float(degrees) + (float(minutes) / 60.0) + (float(seconds) / 3600.0)
    return sign * value


def load_reference_table(zip_path: Path, filename: str, key: str, value: str) -> dict[str, str]:
    with zipfile.ZipFile(zip_path) as archive:
        with archive.open(filename) as handle:
            reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8", newline=""), delimiter=";")
            return {row[key]: row[value] for row in reader}


def build_anfr_sites(anfr_data_zip: Path, anfr_ref_zip: Path) -> tuple[dict, dict]:
    operator_names = load_reference_table(anfr_ref_zip, "SUP_EXPLOITANT.txt", "ADM_ID", "ADM_LB_NOM")
    support_natures = load_reference_table(anfr_ref_zip, "SUP_NATURE.txt", "NAT_ID", "NAT_LB_NOM")
    owner_types = load_reference_table(anfr_ref_zip, "SUP_PROPRIETAIRE.txt", "TPO_ID", "TPO_LB")

    matching_stations: dict[str, dict[str, str]] = {}
    features: list[dict] = []

    with zipfile.ZipFile(anfr_data_zip) as archive:
        with archive.open("SUP_STATION.txt") as handle:
            reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8", newline=""), delimiter=";")
            for row in reader:
                if row["ADM_ID"] not in {"202", "206"}:
                    continue

                matching_stations[row["STA_NM_ANFR"]] = row

        with archive.open("SUP_SUPPORT.txt") as handle:
            reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8", newline=""), delimiter=";")
            for row in reader:
                station = matching_stations.get(row["STA_NM_ANFR"])

                if station is None:
                    continue

                latitude = dms_to_decimal(
                    row["COR_NB_DG_LAT"],
                    row["COR_NB_MN_LAT"],
                    row["COR_NB_SC_LAT"],
                    row["COR_CD_NS_LAT"],
                )
                longitude = dms_to_decimal(
                    row["COR_NB_DG_LON"],
                    row["COR_NB_MN_LON"],
                    row["COR_NB_SC_LON"],
                    row["COR_CD_EW_LON"],
                )

                address_parts = [
                    row["ADR_LB_LIEU"],
                    row["ADR_LB_ADD1"],
                    row["ADR_LB_ADD2"],
                    row["ADR_LB_ADD3"],
                ]
                address = ", ".join(part.strip() for part in address_parts if part and part.strip())

                features.append(
                    {
                        "type": "Feature",
                        "id": row["SUP_ID"],
                        "geometry": {
                            "type": "Point",
                            "coordinates": [longitude, latitude],
                        },
                        "properties": {
                            "supportId": row["SUP_ID"],
                            "stationId": row["STA_NM_ANFR"],
                            "operatorId": station["ADM_ID"],
                            "operatorName": operator_names.get(station["ADM_ID"], station["ADM_ID"]),
                            "supportNatureId": row["NAT_ID"],
                            "supportNature": support_natures.get(row["NAT_ID"], row["NAT_ID"]),
                            "supportHeightM": row["SUP_NM_HAUT"],
                            "ownerTypeId": row["TPO_ID"],
                            "ownerType": owner_types.get(row["TPO_ID"], row["TPO_ID"]),
                            "address": address,
                            "postalCode": row["ADR_NM_CP"],
                            "communeInsee": row["COM_CD_INSEE"],
                            "stationUserCode": station["STA_NM_USER"],
                            "inServiceDate": station["DTE_EN_SERVICE"],
                        },
                    }
                )

    feature_collection = {
        "type": "FeatureCollection",
        "features": features,
    }
    metadata = {
        "featureCount": len(features),
        "operatorFilter": ["202", "206"],
        "operatorNames": ["SNCF Réseau", "SNCF"],
    }
    return feature_collection, metadata


def extract_tunnels_geojson(tunnels_zip: Path) -> tuple[dict, dict]:
    with zipfile.ZipFile(tunnels_zip) as archive:
        names = [name for name in archive.namelist() if name.endswith(".geojson")]

        if not names:
            raise RuntimeError("No GeoJSON file found in Nicolas Wurtz tunnel archive.")

        with archive.open(names[0]) as handle:
            payload = json.load(handle)

    metadata = {
        "featureCount": len(payload.get("features", [])),
        "archiveEntry": names[0],
    }
    return payload, metadata


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build local Phase 2 public-data extracts for ROCS_map.")
    parser.add_argument("--anfr-data", required=True, type=Path)
    parser.add_argument("--anfr-ref", required=True, type=Path)
    parser.add_argument("--tunnels-zip", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    anfr_geojson, anfr_meta = build_anfr_sites(args.anfr_data, args.anfr_ref)
    tunnels_geojson, tunnels_meta = extract_tunnels_geojson(args.tunnels_zip)

    anfr_output = args.output_dir / "anfr-sncf-reseau-supports.geojson"
    tunnels_output = args.output_dir / "nicolas-wurtz-tunnels.geojson"
    manifest_output = args.output_dir / "source-manifest.json"

    write_json(anfr_output, anfr_geojson)
    write_json(tunnels_output, tunnels_geojson)
    write_json(
        manifest_output,
        {
            "anfrCandidateSites": {
                "file": anfr_output.name,
                "sourceDataset": "Données sur les installations radioélectriques de plus de 5 watts",
                "sourcePage": "https://www.data.gouv.fr/datasets/donnees-sur-les-installations-radioelectriques-de-plus-de-5-watts-1/",
                "sourceArtifact": args.anfr_data.name,
                "referenceArtifact": args.anfr_ref.name,
                "notes": "Filtered to supports linked to stations operated by SNCF Réseau or SNCF in the official ANFR export.",
                "metadata": anfr_meta,
            },
            "derivedTunnels": {
                "file": tunnels_output.name,
                "sourcePage": "https://github.com/nicolaswurtz/extras-opendata-sncf-reseau",
                "sourceArtifact": args.tunnels_zip.name,
                "notes": "Optional derived tunnel layer published by Nicolas Wurtz from public railway data sources.",
                "metadata": tunnels_meta,
            },
        },
    )


if __name__ == "__main__":
    main()
