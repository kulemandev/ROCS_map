#!/usr/bin/env python3
"""Build the DGITM 2024 future-ERTMS scenario on SNCF RFN geometry."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any


Coordinate = tuple[float, float]

CURRENT_ETCS_LGV_CODES = {
    "005000",
    "408000",
    "408305",
    "408315",
    "408320",
    "408340",
    "408345",
    "408360",
    "408370",
    "538310",
    "538311",
    "538315",
    "566000",
    "570345",
    "570350",
    "570360",
    "570380",
    "570385",
    "570390",
}

# Named routes are transcribed from the November 2024 DGITM deployment-plan map.
# The coordinates only delimit sections; output geometry always comes from SNCF RFN.
ROUTE_SECTIONS = (
    ("Luxembourg-Spain", "2024-2044 staged", "180000", (6.13, 49.47), (6.17, 49.36)),
    ("Luxembourg-Spain", "2024-2044 staged", "180000", (6.17, 49.36), (6.18, 49.12)),
    ("Luxembourg-Spain", "2024-2044 staged", "090000", (6.18, 49.12), (6.18, 48.69)),
    ("Luxembourg-Spain", "2024-2044 staged", "070000", (6.18, 48.69), (5.89, 48.67)),
    ("Luxembourg-Spain", "2024-2044 staged", "032000", (5.89, 48.67), (5.47, 47.82)),
    ("Luxembourg-Spain", "2024-2044 staged", "843000", (5.47, 47.82), (5.11, 47.53)),
    ("Luxembourg-Spain", "2024-2044 staged", "849000", (5.11, 47.53), (5.04, 47.32)),
    ("Luxembourg-Spain", "2024-2044 staged", "830000", (5.04, 47.32), (4.81, 43.95)),
    ("Luxembourg-Spain", "2024-2044 staged", "800000", (4.81, 43.95), (4.36, 43.84)),
    ("Luxembourg-Spain", "2024-2044 staged", "810000", (4.36, 43.84), (3.88, 43.61)),
    ("Luxembourg-Spain", "2024-2044 staged", "640000", (3.88, 43.61), (3.00, 43.18)),
    ("Luxembourg-Spain", "2024-2044 staged", "677000", (3.00, 43.18), (3.16, 42.44)),
    ("Macon-Modane", "2029-2033", "883000", (4.83, 46.31), (5.35, 45.96)),
    ("Macon-Modane", "2029-2033", "890000", (5.35, 45.96), (5.79, 45.85)),
    ("Macon-Modane", "2029-2033", "900000", (5.79, 45.85), (6.66, 45.20)),
    ("Marseille-Vintimille", "Deployment in progress", "930000", (5.37, 43.30), (7.60, 43.79)),
    ("Nantes-Angers-Sable", "2032-2037", "515000", (-1.55, 47.22), (-0.56, 47.47)),
    ("Nantes-Angers-Sable", "2032-2037", "450000", (-0.56, 47.47), (-0.34, 47.84)),
    ("Rennes-Brest", "By 2044", "420000", (-1.68, 48.11), (-4.49, 48.39)),
    ("Rennes-Nantes", "By 2044", "468000", (-1.68, 48.11), (-2.08, 47.65)),
    ("Rennes-Nantes", "By 2044", "470000", (-2.08, 47.65), (-1.94, 47.36)),
    ("Rennes-Nantes", "By 2044", "515000", (-1.94, 47.36), (-1.55, 47.22)),
)


def squared_distance(left: Coordinate, right: Coordinate) -> float:
    latitude = math.radians((left[1] + right[1]) / 2.0)
    dx = (left[0] - right[0]) * math.cos(latitude)
    dy = left[1] - right[1]
    return dx * dx + dy * dy


def line_coordinates(feature: dict[str, Any]) -> list[list[float]]:
    geometry = feature.get("geometry") or {}
    if geometry.get("type") != "LineString":
        return []
    return geometry.get("coordinates") or []


def nearest_index(coordinates: list[list[float]], target: Coordinate) -> int:
    return min(
        range(len(coordinates)),
        key=lambda index: squared_distance((coordinates[index][0], coordinates[index][1]), target),
    )


def extract_section(
    features: list[dict[str, Any]],
    code: str,
    start: Coordinate,
    end: Coordinate,
) -> tuple[list[list[float]], dict[str, Any]]:
    candidates = [
        feature
        for feature in features
        if str(feature.get("properties", {}).get("code_ligne", "")) == code
        and feature.get("properties", {}).get("libelle") == "Exploitée"
        and len(line_coordinates(feature)) >= 2
    ]
    if not candidates:
        raise RuntimeError(f"No operated RFN geometry found for line {code}")

    def candidate_score(feature: dict[str, Any]) -> float:
        coordinates = line_coordinates(feature)
        start_point = coordinates[nearest_index(coordinates, start)]
        end_point = coordinates[nearest_index(coordinates, end)]
        return squared_distance((start_point[0], start_point[1]), start) + squared_distance(
            (end_point[0], end_point[1]), end
        )

    feature = min(candidates, key=candidate_score)
    coordinates = line_coordinates(feature)
    start_index = nearest_index(coordinates, start)
    end_index = nearest_index(coordinates, end)
    low, high = sorted((start_index, end_index))
    section = coordinates[low : high + 1]
    if start_index > end_index:
        section.reverse()
    if len(section) < 2:
        raise RuntimeError(f"RFN section {code} collapsed to fewer than two coordinates")
    return section, feature.get("properties", {})


def scenario_properties(
    route: str,
    deployment_window: str,
    code: str,
    source_properties: dict[str, Any],
) -> dict[str, Any]:
    return {
        "libelle": "Planned ERTMS Level 2",
        "type": "ERTMS deployment-plan scenario",
        "route": route,
        "deployment_window": deployment_window,
        "code_ligne": code,
        "pk_debut_r": source_properties.get("pk_debut_r") or source_properties.get("pkd"),
        "pk_fin_r": source_properties.get("pk_fin_r") or source_properties.get("pkf"),
        "scenario_source": "DGITM ERTMS deployment plan, November 2024",
        "geometry_source": "SNCF RFN open data",
    }


def build_scenario(rfn: dict[str, Any], lgv: dict[str, Any]) -> dict[str, Any]:
    output: list[dict[str, Any]] = []
    seen_lgv: set[str] = set()

    for feature in lgv.get("features", []):
        properties = feature.get("properties", {})
        code = str(properties.get("code_ligne", ""))
        category = str(properties.get("catlig", "")).lower()
        if "grande vitesse" not in category or code in CURRENT_ETCS_LGV_CODES:
            continue
        geometry = feature.get("geometry")
        if not geometry or code in seen_lgv:
            continue
        seen_lgv.add(code)
        output.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": scenario_properties(
                    "Progressive coverage of remaining LGVs",
                    "2026-2044 staged",
                    code,
                    properties,
                ),
            }
        )

    rfn_features = rfn.get("features", [])
    for route, window, code, start, end in ROUTE_SECTIONS:
        coordinates, properties = extract_section(rfn_features, code, start, end)
        output.append(
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coordinates},
                "properties": scenario_properties(route, window, code, properties),
            }
        )

    return {"type": "FeatureCollection", "features": output}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rfn-lines", required=True, type=Path)
    parser.add_argument("--lgv-lines", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    with args.rfn_lines.open(encoding="utf-8") as handle:
        rfn = json.load(handle)
    with args.lgv_lines.open(encoding="utf-8") as handle:
        lgv = json.load(handle)

    scenario = build_scenario(rfn, lgv)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(scenario, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Wrote {len(scenario['features'])} future ERTMS features to {args.output}")


if __name__ == "__main__":
    main()
