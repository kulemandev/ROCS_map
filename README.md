# ROCS Map

ROCS Map is a France-wide public-data demonstrator for exploring where different railway slicing xApps may be appropriate in a Future Railway Mobile Communication System (FRMCS) deployment. It combines railway infrastructure, signaling systems, radio-support locations, stations, tunnels, and a national ERTMS planning scenario in an interactive MapLibre Web GUI.

The Web GUI can be used to examine how railway and signaling conditions vary geographically, compare current and future ERTMS scenarios, test deployment assumptions, identify candidate multi-site control areas, and export reproducible site or cluster data for railway communication research, preliminary planning studies, and teaching.

The GUI assigns one candidate slicing approach to each mapped SNCF radio-support site:

- **HSRS** [[1]](https://hal.science/hal-05781058) for local deterministic slicing in lower-complexity areas.
- **ADSS** [[2]](https://ieeexplore.ieee.org/document/11598960) for local intelligent scheduling in denser or more complex areas.
- **PRIS-R** [[3]](https://hal.science/hal-05781343) for coordinated proactive/reactive operation across eligible multi-site clusters.

These assignments are static deployment-suitability estimates derived from the enabled map context. They complement the runtime ROCS orchestration framework, which can dynamically select an xApp within an operational control area. ROCS Map does not execute the xApps, predict radio coverage, or reproduce the runtime orchestrator.

## What the Web GUI provides

- A national view of the French railway network and candidate SNCF radio-support sites.
- Selectable infrastructure datasets with their source and loading status shown in the GUI.
- Current ETCS Level 2/ERTMS, KVB/TVM, radio sol-train, station, tunnel, and other railway context.
- A switch between the currently published signaling network and the DGITM horizon-2044 ERTMS scenario.
- Automatic HSRS, ADSS, and PRIS-R assignment for every candidate site.
- PRIS-R clusters containing between 3 and 8 sites.
- Per-site explanations, contributing context, confidence, and cluster membership.
- GeoJSON and CSV exports of site decisions and a GeoJSON export of PRIS-R clusters.

## Data sources and their roles

The map distinguishes between data fetched directly from official APIs and derived files bundled with the repository.

| Dataset | Provider and origin | Contents | Access | Use in ROCS Map |
|---|---|---|---|---|
| [RFN railway line shapes](https://ressources.data.sncf.com/explore/dataset/formes-des-lignes-du-rfn/) | SNCF Réseau Open Data | National railway line geometry and line identifiers | Live GeoJSON API | Base railway geometry and selected-site rail context |
| [Radio sol-train equipped lines](https://ressources.data.sncf.com/explore/dataset/lignes-equipees-de-liaison-radio-sol-train/) | SNCF Réseau Open Data | Sections equipped with radio sol-train/GSM-R liaison | Live GeoJSON API | Operational radio context and map overlay |
| [Railway operating regimes](https://ressources.data.sncf.com/explore/dataset/regime-dexploitation-des-lignes/) | SNCF Réseau Open Data | Operational line regimes such as double track, single track, and banalized operation | Live GeoJSON API; disabled by default | Optional infrastructure inspection layer |
| [KVB-equipped lines](https://ressources.data.sncf.com/explore/dataset/lignes-equipees-de-kvb/) | SNCF Réseau Open Data | Railway sections equipped with KVB train protection | Live GeoJSON API | Signaling context and green line overlay |
| [Line-block/signaling modes](https://ressources.data.sncf.com/explore/dataset/mode-de-cantonnement-des-lignes/) | SNCF Réseau Open Data | Published cantonnement, TVM, and ETCS signaling attributes | Live GeoJSON API | Current ETCS Level 2 eligibility and KVB/TVM versus ETCS display |
| [Track circuits](https://ressources.data.sncf.com/explore/dataset/liste-des-circuits-de-voie/) | SNCF Réseau Open Data | Track-circuit infrastructure segments | Live GeoJSON API; disabled by default because of its size | Optional detailed context in selected-site inspection |
| [Passenger stations](https://ressources.data.sncf.com/explore/dataset/gares-de-voyageurs/) | SNCF Gares & Connexions Open Data | Passenger-station locations and attributes | Live GeoJSON API | Station proximity and visible railway anchors |
| [Radio installations above 5 W](https://www.data.gouv.fr/datasets/donnees-sur-les-installations-radioelectriques-de-plus-de-5-watts-1/) | Agence nationale des fréquences (ANFR), distributed through data.gouv.fr | Radio stations, supports, operators, coordinates, support types, heights, owners, and commissioning information | Filtered GeoJSON bundled in `public/data` | Candidate SNCF radio-support sites used as deployment nodes |
| [Derived railway tunnels](https://github.com/nicolaswurtz/extras-opendata-sncf-reseau) | Nicolas Wurtz, derived from public railway data | Railway tunnel line geometry | GeoJSON bundled in `public/data` | Tunnel/underground context and black map overlay |
| [National ERTMS deployment plan](https://www.ecologie.gouv.fr/sites/default/files/documents/202411%20Consultation%20DGITM%20-%20ERTMS.pdf) | Direction générale des infrastructures, des transports et des mobilités (DGITM), November 2024 | Government planning map for progressive ERTMS deployment through 2044 | Derived scenario GeoJSON bundled in `public/data` | Optional future ETCS/ERTMS eligibility scenario |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | OpenStreetMap contributors | Raster map tiles | Live tile service | Geographic basemap |

The live API definitions and source links are maintained in `src/data/datasetRegistry.ts`. Provenance and feature counts for bundled files are recorded in `public/data/source-manifest.json`.

## Bundled datasets

### ANFR candidate sites

`public/data/anfr-sncf-reseau-supports.geojson` is generated from the official ANFR data and reference ZIP exports. The preprocessing script joins station and support records, converts their DMS coordinates to decimal longitude/latitude, resolves operator and support reference values, and retains supports linked to operator identifiers `202` and `206` (SNCF Réseau and SNCF).

The resulting file contains **4,356 candidate support locations**. Each feature includes the support and station identifiers, operator, support nature and height, owner type, address, municipality code, user station code, and in-service date. A support is a physical hosting location in the ANFR registry; it is treated here as a candidate railway deployment node, not as proof of an FRMCS gNB installation or validated railway radio coverage.

### Tunnel geometry

`public/data/nicolas-wurtz-tunnels.geojson` contains **1,469 tunnel features** extracted from the public `extras-opendata-sncf-reseau` dataset. This is a derived third-party railway layer rather than an official SNCF API layer. It contributes tunnel and underground context and can be enabled or disabled from the dataset registry.

### ERTMS 2044 scenario

`public/data/dgitm-future-ertms-2044.geojson` is a reproducible cartographic transcription of the November 2024 DGITM plan. The route names and deployment windows are transcribed from the official planning document, while the actual line geometry is taken from SNCF RFN and LGV open data.

The bundled scenario contains **77 line features** with an estimated combined length of **3,666.1 km**. It includes named conventional corridors and progressive coverage of remaining high-speed lines. It is not an official machine-readable deployment dataset and must not be interpreted as a detailed construction schedule or commissioning record.

The two official planning documents used for this scenario are retained in `docs/` for traceability.

## How deployment assignments are computed

The ANFR extract supplies candidate sites, while spatial indexes derive radio-site density and proximity to current or planned ETCS/ERTMS sections and tunnels. The engine recomputes assignments whenever a relevant dataset, scenario, or threshold changes.

By default, PRIS-R requires an ETCS Level 2/ERTMS section within 8 km, at least two enabled context signals, and a connected group of 3-8 eligible sites with inter-site links below 8 km. Non-PRIS-R sites reaching the local complexity threshold are assigned to ADSS; HSRS is the fallback. Tunnel proximity strengthens complexity but is not mandatory.

The selected-site panel additionally reports nearby railway geometry, stations, radio sol-train, KVB, signaling modes, and track circuits. Its confidence label reflects available explanatory evidence, not a calibrated probability of deployment correctness.

## Default spatial settings

All values can be changed from the ROCS Configuration panel and restored with **Clear & set ROCS defaults**.

| Parameter | Default | Purpose |
|---|---:|---|
| ETCS/ERTMS influence radius | 8 km | Maximum distance used to associate a candidate site with a current or planned ETCS/ERTMS section |
| Maximum rail distance | 1.5 km | Rail-association threshold used by detailed site-context inspection |
| Station threshold | 1.5 km | Distance at which station context becomes active |
| Tunnel threshold | 1.2 km | Distance at which tunnel context becomes active |
| Radio-density radius | 2 km | Neighborhood used to count nearby candidate sites |
| Dense-site threshold | 4 neighboring sites | Activates the dense radio-site context signal |
| PRIS-R inter-site distance | 8 km | Maximum neighbor link used to construct connected PRIS-R candidate groups |
| PRIS-R cluster size | 3-8 sites | Minimum and maximum membership of one coordinated cluster |
| PRIS-R complexity threshold | 2 signals | Minimum enabled context evidence for ETCS-eligible cluster members |
| ADSS complexity threshold | 2 signals | Minimum local complexity for ADSS when the site is not assigned to PRIS-R |
| Track-circuit context threshold | 4 segments | Activates track-circuit concentration in detailed site inspection |

## Current and 2044 network scenarios

**Current network** uses only ETCS Level 2/ERTMS sections published in the current SNCF signaling data. **2044 ERTMS plan** keeps the current sections and adds all sections represented in the bundled DGITM scenario.

Activating the 2044 scenario does not directly force a site to use PRIS-R. It extends the ETCS/ERTMS eligibility geography, after which the same complexity, inter-site-distance, and cluster-size rules are recomputed. Deployment counts therefore change only where the added signaling sections make nearby candidate groups eligible.

## Map semantics

Base-station symbols and railway lines encode different information:

- **Orange-red antenna:** PRIS-R deployment assignment.
- **Green antenna:** HSRS deployment assignment.
- **Blue antenna:** ADSS deployment assignment.
- **Solid orange-red line:** currently published ETCS Level 2/ERTMS section.
- **Dashed orange-red line:** section added by the horizon-2044 ERTMS scenario.
- **Green line:** KVB or TVM signaling; ETCS Level 2/ERTMS takes visual priority where systems overlap.
- **Black line:** tunnel geometry.

## Run locally

The Web GUI requires Node.js with npm and an internet connection for the live SNCF datasets and OpenStreetMap tiles.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. For a production build:

```bash
npm run build
npm run preview
```

The repository combines the derived ANFR, tunnel, and ERTMS scenario files, so no separate data download is required for those layers. The GUI is not completely offline because the current SNCF layers and basemap are intentionally loaded from their publishers at runtime.

## Using the GUI

1. Wait for the default datasets to report `loaded` in the Public Dataset Registry.
2. Enable or disable datasets to inspect their contribution and map geometry.
3. Choose **Current network** or **2044 ERTMS plan**.
4. Adjust the spatial and complexity settings if a different deployment assumption is required.
5. Select an antenna symbol to inspect its assignment, evidence, nearby infrastructure, and PRIS-R cluster membership.
6. Review the national HSRS, ADSS, and PRIS-R counts in Deployment Overview.
7. Export the current site decisions or cluster geometries.

The track-circuit dataset is disabled by default because its live export is substantially larger than the other SNCF layers.

## Exported results

- **Site GeoJSON** preserves the candidate-site geometry and adds the selected xApp, confidence, cluster identifier, current/future ETCS proximity, tunnel context, and decision explanation.
- **Site CSV** provides a tabular representation of the current site decisions.
- **Cluster GeoJSON** exports PRIS-R cluster identifiers, members, centroids, estimated coverage geometry, and cluster rationale.

Exports always reflect the datasets, scenario, and configuration currently active in the browser.

## Reproducing the derived data

The repository includes the preprocessing utilities used to create the bundled files:

- The ANFR/tunnel preprocessing utility in `scripts/` reads the official ANFR data/reference ZIP archives, filters SNCF-related supports, and extracts the tunnel GeoJSON.
- `scripts/build_future_ertms_scenario.py` clips SNCF RFN geometry to the routes represented in the DGITM planning document.

To rebuild the ERTMS scenario, download the current SNCF RFN line-shape and LGV GeoJSON exports and run:

```bash
python3 scripts/build_future_ertms_scenario.py \
  --rfn-lines /path/to/formes-des-lignes-du-rfn.geojson \
  --lgv-lines /path/to/lignes-lgv-et-par-ecartement.geojson \
  --output public/data/dgitm-future-ertms-2044.geojson
```

Because the live source datasets can evolve, regenerated outputs may differ from the bundled research snapshot. Record source dates and feature counts when generating a new snapshot.

## Repository structure

- `src/components`: GUI panels, controls, selected-feature details, and export actions.
- `src/context`: geospatial context computation and shared data types.
- `src/data`: dataset registry, GeoJSON loading, and runtime dataset state.
- `src/map`: MapLibre setup, France view, rendering, and interaction.
- `src/rocs`: deployment decision engine, legend definitions, and result exporters.
- `src/config`: GUI metadata and default spatial/decision parameters.
- `src/styles`: global GUI styling.
- `public/data`: bundled derived GeoJSON files and provenance manifest.
- `scripts`: reproducible public-data preprocessing utilities.
- `docs`: official government documents used to construct the ERTMS planning scenario.

## Scope and limitations

ROCS Map was designed to demonstrate how heterogeneous public railway datasets can be fused into a transparent national deployment analysis, and how signaling evolution can change the suitability of railway slicing approaches. It provides a reproducible basis for geographic exploration, scenario comparison, candidate-cluster generation, and communication between railway, telecommunications, and research stakeholders.

Its outputs remain research estimates rather than an official SNCF deployment plan or validated engineering design. Influence areas are geometric rather than radio-propagation results; public datasets have different precision and update cycles; and the 2044 layer remains a planning scenario.

Future work can combine these geographic foundations with radio propagation, mobility, traffic, live telemetry, and infrastructure-state models to develop a railway digital twin for dynamic FRMCS planning and orchestration. Users redistributing source or derived data should review the attribution and reuse terms published by SNCF, ANFR/data.gouv.fr, OpenStreetMap, DGITM, and the tunnel dataset author.

## References

[1] D. K. Mukuhi, L. Mendiboure, R. Langar, R. Fargeon, S. Cherrier, M. Berbineau, and P.-Y. Petton, “Distributed Hierarchical Slack-Reduction in Slicing for Railways FRMCS,” in *Proc. IEEE WiMob*, pp. 211-216, 2025. [Online]. Available: [HAL](https://hal.science/hal-05781058)

[2] D. Kule Mukuhi, L. Mendiboure, R. Langar, R. Fargeon, S. Cherrier, M. Berbineau, and P.-Y. Petton, “Application-Aware Slicing for FRMCS: A Deep Reinforcement Learning Approach,” *IEEE Transactions on Network and Service Management*, vol. 23, pp. 6261-6274, 2026. [Online]. Available: [IEEE Xplore](https://ieeexplore.ieee.org/document/11598960)

[3] D. K. Mukuhi, L. Mendiboure, R. Langar, R. Fargeon, S. Cherrier, M. Berbineau, and P.-Y. Petton, “PRIS-R: Proactive-Reactive Intelligent Slicing for Congested FRMCS Railway Networks,” 2026. [Online]. Available: [HAL](https://hal.science/hal-05781343)
