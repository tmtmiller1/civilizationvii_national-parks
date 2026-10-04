-- Park land keeps its resources. Every park and wilderness marker counts as a valid improvement for every resource
-- in the database, base game, DLC or another mod's alike, so a resource tile that joins a park stays collected:
-- the marker takes over from the plantation, camp or fishing boat it replaces. Even an unimproved resource
-- tile is collected once it joins a park (Pearls on a bare sea tile, a turn later); outside the park it is not.
-- Loaded after national-parks-land.xml, which creates the markers. A new data file like this one is
-- read only after the game is relaunched: loading a save does not rescan a mod's file list.
INSERT OR IGNORE INTO Constructible_ValidResources (ConstructibleType, ResourceType)
SELECT m.ConstructibleType, r.ResourceType
FROM Resources r
CROSS JOIN (
    -- The founding improvements too, so a resource under a founding tile is collected. Rows here would make a BUILD
    -- offer resource-only (a capital's 5 plain plots became 3 resource plots), but the founding
    -- improvements are placed by script only (CityBuildable false), which no row restricts.
    SELECT 'IMPROVEMENT_NATIONAL_PARK' AS ConstructibleType
    UNION ALL SELECT 'IMPROVEMENT_WILDERNESS_AREA'
    UNION ALL SELECT 'IMPROVEMENT_NATIONAL_PARK_LAND'
    UNION ALL SELECT 'IMPROVEMENT_NATIONAL_PARK_WILD'
    UNION ALL SELECT 'IMPROVEMENT_WILDERNESS_AREA_LAND'
    UNION ALL SELECT 'IMPROVEMENT_WILDERNESS_AREA_WILD'
    UNION ALL SELECT 'IMPROVEMENT_NATIONAL_PARK_LAND_8'
    UNION ALL SELECT 'IMPROVEMENT_NATIONAL_PARK_LAND_16'
    UNION ALL SELECT 'IMPROVEMENT_NATIONAL_PARK_LAND_24'
    UNION ALL SELECT 'IMPROVEMENT_WILDERNESS_AREA_LAND_8'
    UNION ALL SELECT 'IMPROVEMENT_WILDERNESS_AREA_LAND_16'
    UNION ALL SELECT 'IMPROVEMENT_WILDERNESS_AREA_LAND_24'
) m;
