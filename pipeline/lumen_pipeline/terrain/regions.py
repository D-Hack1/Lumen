# Owner: Shiva Shakthi
# Artemis region shapefiles -> SVG + regions.json.
"""S-7 Artemis III candidate-region geometry.

Per contracts/data_terrain_misc.md §6, region geometry must come from
official USGS/NASA sources; nothing here invents a name, identifier,
coordinate, boundary or polygon.

What was verified (see docs/s7_artemis_regions_blocker in the S-7 final
report for the full trail): the authoritative USGS ScienceBase data
release "Down Selected Artemis III Candidate Landing Site Navigational
Grids" (item id 671a6fa8d34efed5620f89f8, DOI 10.5066/P1MEQ6UK,
https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8) lists
exactly nine per-region files, confirming the official region identifiers
used by USGS for the nine down-selected Artemis III candidate landing
regions. That item's own description also names a tenth file,
"A3_9regions-lonlat-simplified.zip", which is almost certainly the region
*boundary* geometry (as opposed to the fine-resolution navigational grid
lines bundled in each per-region zip, confirmed by inspecting
Mons_Mouton.zip's contents: only *_S_Grid.shp/.dbf/.shx/.prj navigation
grid files at 1 km/100 m/10 m, no boundary/footprint polygon).

That boundary file could not be retrieved in this environment: ScienceBase
serves it through an S3-backed "manager" API whose plain file/download
endpoints return only the manager's single-page-app HTML shell rather than
the file bytes; the usual secondary routes (the catalog's legacy
`__disk__` path convention used successfully for the per-region grid
zips, and the declared S3 bucket directly) were refused or did not serve
the file either, within this session's tooling and permissions. This is
reported as an explicit blocker (see the module-level `REGIONS` table and
the S-7 final report) rather than substituted with invented or
approximated geometry.
"""

from __future__ import annotations

# Official region identifiers, verified directly against the file listing
# of USGS ScienceBase item 671a6fa8d34efed5620f89f8 (fetched and inspected
# live; see module docstring). Names use the exact per-region zip/file
# naming from that listing. No centroid, boundary or polygon is included:
# none was obtained from an authoritative source.
REGIONS: tuple[dict[str, object], ...] = (
    {"region_id": "de_gerlache_rim_2", "name": "de Gerlache Rim 2"},
    {"region_id": "haworth", "name": "Haworth"},
    {"region_id": "malapert_massif", "name": "Malapert Massif"},
    {"region_id": "mons_mouton", "name": "Mons Mouton"},
    {"region_id": "mons_mouton_plateau", "name": "Mons Mouton Plateau"},
    {"region_id": "nobile_rim_1", "name": "Nobile Rim 1"},
    {"region_id": "nobile_rim_2", "name": "Nobile Rim 2"},
    {"region_id": "peak_near_cabeus_b", "name": "Peak Near Cabeus B"},
    {"region_id": "slater_plain", "name": "Slater Plain"},
)

SOURCE_NEEDED = (
    "USGS ScienceBase item 671a6fa8d34efed5620f89f8 "
    "(DOI 10.5066/P1MEQ6UK, https://www.sciencebase.gov/catalog/item/671a6fa8d34efed5620f89f8), "
    "file A3_9regions-lonlat-simplified.zip (S3 key "
    "671a6fa8d34efed5620f89f8/A3_9regions-lonlat-simplified.zip, bucket "
    "prod-is-usgs-sb-prod-content, declared size 637136 bytes), OR an "
    "equivalent officially published boundary/footprint polygon for the "
    "same nine regions."
)

UNAVAILABLE_REASON = (
    "Region boundary/footprint geometry was not retrievable in this "
    "environment: the ScienceBase file/download endpoints for this item "
    "serve only its single-page-app HTML shell for this file, not the "
    "file bytes, and the known fallback URL patterns (legacy __disk__ "
    "catalog route, direct S3 bucket) were refused or unavailable. The "
    "per-region zip files that *were* downloaded successfully contain "
    "only fine-resolution navigation grid lines (1 km/100 m/10 m "
    "*_S_Grid.shp), not a region boundary polygon, and were not used as a "
    "substitute for one."
)


def build_regions_index() -> dict[str, object]:
    """Build the regions.json payload: one entry per known official
    region, each explicitly marked unavailable with the exact reason and
    exact source needed. No geometry is invented."""

    entries = []
    for region in REGIONS:
        entries.append(
            {
                "region_id": region["region_id"],
                "name": region["name"],
                "centroid_lat_deg": None,
                "centroid_lon_deg": None,
                "svg_path": None,
                "geometry_available": False,
                "unavailable_reason": UNAVAILABLE_REASON,
                "source_needed": SOURCE_NEEDED,
                "source_catalog": (
                    "USGS ScienceBase item 671a6fa8d34efed5620f89f8 "
                    "(DOI 10.5066/P1MEQ6UK) -- region identifier and name "
                    "only; no coordinates or boundary verified"
                ),
            }
        )
    return {
        "version": "0.1.0",
        "regions": entries,
    }
