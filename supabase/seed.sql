-- Idempotent local dev seed for `supabase db reset` (mirrors migration 20261120000003).

INSERT INTO public.jurisdictions (
  id,
  state,
  name,
  license_level,
  code_family,
  edition,
  amendments_note,
  exam_vendor,
  question_count,
  time_limit_min,
  pass_pct,
  open_book,
  allowed_refs,
  bulletin_url,
  last_verified_at
)
VALUES
  (
    '11111111-1111-4111-8111-111111111101',
    'TX',
    'Texas Journeyman Plumber',
    'journeyman',
    'IPC',
    '2021',
    'Verify Texas State Board of Plumbing Examiners (TSBPE) adopted code rules and municipal amendments prior to exam scheduling.',
    'TSBPE',
    100,
    180,
    70.00,
    false,
    '{}'::text[],
    'https://tsbpe.texas.gov/',
    '2026-11-15T00:00:00Z'::timestamptz
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    'CA',
    'California Journeyman Plumber',
    'journeyman',
    'UPC',
    '2024',
    'Verify California Plumbing Code (CPC, UPC-derived) state amendments and local AHJ rules prior to exam scheduling.',
    'PSI',
    100,
    180,
    70.00,
    false,
    '{}'::text[],
    'https://www.cslb.ca.gov/',
    '2026-11-15T00:00:00Z'::timestamptz
  ),
  (
    '11111111-1111-4111-8111-111111111103',
    'CO',
    'Colorado Journeyman Plumber',
    'journeyman',
    'IPC',
    '2021',
    'Verify Colorado State Plumbing Board adopted edition and PSI open-book reference restrictions prior to exam scheduling.',
    'PSI',
    80,
    210,
    70.00,
    true,
    ARRAY['2021 International Plumbing Code (IPC)'],
    'https://dpo.colorado.gov/Plumbing',
    '2026-11-15T00:00:00Z'::timestamptz
  )
ON CONFLICT (state, license_level) DO NOTHING;

INSERT INTO public.topics (
  id,
  slug,
  title,
  description,
  display_order
)
VALUES
  (
    '22222222-2222-4222-8222-222222222201',
    'admin-definitions',
    'Administration, Definitions & General Regulations',
    'Permits, inspections, code terminology, piping protection, hangers, supports, and general installation requirements.',
    1
  ),
  (
    '22222222-2222-4222-8222-222222222202',
    'fixtures-fittings',
    'Fixtures, Faucets & Fixture Fittings',
    'Minimum fixture counts, clearances, ADA accessibility, water closet and urinal requirements, and supply/drain fittings.',
    2
  ),
  (
    '22222222-2222-4222-8222-222222222203',
    'water-heaters',
    'Water Heaters & Safety Devices',
    'Temperature and pressure relief valves, thermal expansion control, drain pans, combustion air, and venting clearances.',
    3
  ),
  (
    '22222222-2222-4222-8222-222222222204',
    'water-supply-distribution',
    'Water Supply & Distribution Sizing',
    'WSFU load calculations, pressure loss, velocity limits, pipe materials, shutoff valves, and hot water circulation.',
    4
  ),
  (
    '22222222-2222-4222-8222-222222222205',
    'backflow-cross-connection',
    'Backflow Prevention & Cross-Connection Control',
    'Air gaps, RPZ assemblies, PVB/SVB devices, double check valves, hazard classification, and testing intervals.',
    5
  ),
  (
    '22222222-2222-4222-8222-222222222206',
    'sanitary-drainage-dwv',
    'Sanitary Drainage & DWV Systems',
    'DFU sizing, minimum pipe slopes, fitting direction rules, cleanout spacing, offsets, and building drains/sewers.',
    6
  ),
  (
    '22222222-2222-4222-8222-222222222207',
    'vents-venting',
    'Vents & Venting Systems',
    'Trap arm distances, wet venting, circuit venting, stack venting, island fixture vents, AAVs, and vent terminals.',
    7
  ),
  (
    '22222222-2222-4222-8222-222222222208',
    'traps-interceptors',
    'Traps, Interceptors & Separators',
    'Trap seal depth, crown venting prohibition, grease interceptors, oil/sand separators, and indirect waste receptors.',
    8
  ),
  (
    '22222222-2222-4222-8222-222222222209',
    'storm-drainage',
    'Storm Drainage & Roof Drains',
    'Rainfall rate sizing, horizontal and vertical leader sizing, secondary emergency roof drains, and subdrains.',
    9
  ),
  (
    '22222222-2222-4222-8222-222222222210',
    'isometric-math-special',
    'Isometric Drawing, Plumbing Math & Special Piping',
    'Isometric riser interpretation, 45-degree rolling offsets, grade fall calculations, medical/fuel gas basics, and testing.',
    10
  )
ON CONFLICT (slug) DO NOTHING;
