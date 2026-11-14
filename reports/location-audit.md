# Singapore location coverage audit

Generated from the committed POI bake (2026-08-13T19:42:18.443Z) and URA Master Plan 2019 Planning Area Boundary (No Sea) boundaries.

Expansion source snapshot: 2026-11-14T17:53:31.889Z. Original bake timestamp is preserved above.

- Baseline: 6991 POIs. Current bake: 18284 (+11293).
- Verified HDBs: 1434 before; 3940 now.
- Duplicate OSM IDs: 0.
- Outlined locations: 7967.

HDB checks require both OSM apartments/residential tags (without an amenity) and a pin inside an official HDB building footprint. Unmatched does **not** mean proven fake: concave outlines, position error, outdated sources and missing tags can reject real blocks. We fail closed for HDB gameplay.

## Planning areas, sparsest first

| Area | Before | Now | HDB | km² | POIs/km² | Samples >500m from a POI |
|---|---:|---:|---:|---:|---:|---:|
| Simpang | 0 | 1 | 0 | 8.2 | 0.1 | 74% |
| North-Eastern Islands | 3 | 16 | 0 | 67.2 | 0.2 | 94% |
| Mandai | 0 | 10 | 0 | 11.7 | 0.9 | 65% |
| Lim Chu Kang | 6 | 16 | 0 | 17.5 | 0.9 | 71% |
| Changi Bay | 1 | 2 | 0 | 2.0 | 1.0 | 67% |
| Marina East | 1 | 2 | 0 | 1.8 | 1.1 | 21% |
| Western Islands | 66 | 68 | 0 | 45.7 | 1.5 | 61% |
| Paya Lebar | 12 | 24 | 0 | 11.7 | 2.0 | 51% |
| Straits View | 2 | 3 | 0 | 1.1 | 2.7 | 31% |
| Changi | 60 | 148 | 0 | 41.5 | 3.6 | 64% |
| Tuas | 231 | 247 | 0 | 47.7 | 5.2 | 36% |
| Sungei Kadut | 75 | 96 | 0 | 17.6 | 5.4 | 29% |
| Seletar | 29 | 59 | 0 | 10.8 | 5.5 | 43% |
| Pioneer | 87 | 92 | 0 | 12.2 | 7.5 | 18% |
| Boon Lay | 66 | 71 | 0 | 8.3 | 8.5 | 19% |
| Tengah | 21 | 100 | 40 | 7.4 | 13.6 | 30% |
| Southern Islands | 18 | 111 | 0 | 7.1 | 15.7 | 20% |
| Marina South | 4 | 28 | 0 | 1.6 | 17.2 | 0% |
| Jurong East | 153 | 336 | 95 | 17.9 | 18.8 | 15% |
| Yishun | 223 | 626 | 253 | 21.0 | 29.7 | 25% |
| Pasir Ris | 175 | 477 | 140 | 15.8 | 30.2 | 16% |
| Bukit Timah | 117 | 536 | 12 | 17.5 | 30.6 | 2% |
| Sembawang | 163 | 390 | 102 | 12.6 | 30.9 | 1% |
| Tanglin | 39 | 233 | 2 | 7.5 | 30.9 | 0% |
| Queenstown | 301 | 766 | 102 | 21.7 | 35.3 | 15% |
| Newton | 18 | 75 | 0 | 2.1 | 36.1 | 0% |
| Tampines | 292 | 829 | 292 | 20.8 | 39.9 | 11% |
| Ang Mo Kio | 249 | 584 | 192 | 14.0 | 41.9 | 6% |
| Clementi | 183 | 411 | 99 | 9.5 | 43.3 | 2% |
| Bukit Panjang | 129 | 409 | 130 | 9.0 | 45.2 | 5% |
| Woodlands | 227 | 622 | 248 | 13.6 | 45.6 | 0% |
| Bukit Batok | 167 | 524 | 155 | 11.2 | 46.9 | 1% |
| Serangoon | 127 | 475 | 79 | 10.1 | 46.9 | 0% |
| Marine Parade | 107 | 291 | 28 | 6.1 | 47.5 | 5% |
| Bedok | 388 | 1038 | 238 | 21.8 | 47.6 | 1% |
| Bukit Merah | 300 | 719 | 159 | 14.5 | 49.8 | 9% |
| Bishan | 114 | 384 | 76 | 7.6 | 50.5 | 2% |
| River Valley | 16 | 78 | 0 | 1.5 | 53.1 | 0% |
| Novena | 163 | 478 | 33 | 9.0 | 53.3 | 1% |
| Jurong West | 350 | 789 | 252 | 14.7 | 53.8 | 1% |
| Hougang | 272 | 791 | 201 | 13.9 | 56.7 | 0% |
| Punggol | 228 | 557 | 197 | 9.4 | 59.3 | 5% |
| Sengkang | 231 | 644 | 212 | 10.6 | 60.6 | 6% |
| Toa Payoh | 225 | 577 | 167 | 8.2 | 70.2 | 0% |
| Choa Chu Kang | 135 | 429 | 185 | 6.1 | 70.3 | 0% |
| Kallang | 233 | 630 | 105 | 8.6 | 73.4 | 0% |
| Geylang | 375 | 831 | 120 | 9.7 | 86.1 | 0% |
| Downtown Core | 159 | 497 | 0 | 5.1 | 97.9 | 1% |
| Museum | 36 | 96 | 0 | 0.8 | 117.8 | 0% |
| Singapore River | 40 | 122 | 0 | 1.0 | 126.0 | 0% |
| Orchard | 64 | 161 | 0 | 1.0 | 167.7 | 0% |
| Outram | 80 | 259 | 11 | 1.4 | 190.7 | 0% |
| Rochor | 136 | 349 | 15 | 1.6 | 218.1 | 0% |

## Interpretation and limits

- These are available baked sites, before runtime caps, deduplication and walkability filtering. They are not a census of all real places.
- Gap percentages use a 250m sample grid and 500m straight-line radius, not walkable routes. Inland water, restricted land, parks and undeveloped plots are included in planning-area area; naturally empty land is not evidence of missing shops.
- The committed towns overlay omits Central and Western Water Catchment. Islands and locations outside its polygons are not assigned to a row; totals need not sum to the bake.
- New HDBs use ~122m sampling cells, ordinary residences ~200m, eateries ~72m. Dense areas remain capped to 220 sites / 100 HDBs / 50 ordinary residences / 50 eateries per world chunk. Raising the global count alone does not guarantee better local coverage.
- This audit independently validates HDB identity only. Other categories retain their existing OSM evidence and may need separate classification reviews.

## Adding real locations

1. Prioritise populated low-density areas (especially private-housing districts), then examine individual 500m gaps. Keep reservoirs, military grounds and empty reclaimed land sparse.
2. NEA hawkers and PA community clubs are now imported with proximity/name/footprint deduplication. Future official MOH clinics and MOE schools could complement OSM.
3. Ordinary housing, community sites, parks and eateries now have separate categories. Only independently verified HDBs open block interiors.
4. Refresh the cached HDB/OSM sources for new estates. This expansion preserves prior IDs and fills remaining sampling cells; it does not remove stale baseline sites.
5. Repeat this report after each targeted addition; measure filled gaps, source provenance and payload growth rather than raw POI count.

Sources: [HDB Existing Building](https://data.gov.sg/datasets/d_16b157c52ed637edd6ba1232e026258d/view), [NEA Hawker Centres](https://data.gov.sg/datasets/d_4a086da0a5553be1d89383cd90d07ecd/view), [PA Community Clubs](https://data.gov.sg/datasets/d_f706de1427279e61fe41e89e24d440fa/view), [OpenStreetMap](https://www.openstreetmap.org/copyright), and committed URA planning-area polygons. PA source attributes date to 2021 and NEA to 2024; source snapshots can lag closures or relocations. OSM timestamps and input hashes are in location-expansion.json.

## Category counts

- clinic: 766
- community: 970
- convenience: 759
- eatery: 3070
- foodcourt: 914
- fuel: 194
- hardware: 153
- hospital: 71
- housing: 3689
- industrial: 1119
- mrt: 320
- park: 729
- pharmacy: 216
- police: 130
- residential: 3940
- school: 661
- supermarket: 583
