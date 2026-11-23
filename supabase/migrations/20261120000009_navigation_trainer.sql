-- Navigation Trainer Schema Extensions & Seed Data
-- Extends outline_nodes with node_kind, index_terms, lookup_cues, target_time_ms;
-- adds RLS-protected navigation_attempts; seeds paraphrased IPC 2021 & UPC 2024 outline nodes.

ALTER TABLE public.outline_nodes
  ADD COLUMN IF NOT EXISTS node_kind text NOT NULL DEFAULT 'section'
    CHECK (node_kind IN ('chapter', 'section', 'table')),
  ADD COLUMN IF NOT EXISTS index_terms text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS lookup_cues text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS target_time_ms integer NOT NULL DEFAULT 25000
    CHECK (target_time_ms > 0);

CREATE INDEX IF NOT EXISTS idx_outline_nodes_family_edition
  ON public.outline_nodes (code_family, edition, node_kind, display_order);

-- ---------------------------------------------------------------------------
-- navigation_attempts (open-book lookup drills, foreground-only elapsed_ms)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.navigation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  jurisdiction_id uuid NOT NULL REFERENCES public.jurisdictions(id) ON DELETE CASCADE,
  outline_node_id uuid NOT NULL REFERENCES public.outline_nodes(id) ON DELETE CASCADE,
  chapter_node_id uuid NOT NULL REFERENCES public.outline_nodes(id) ON DELETE CASCADE,
  drill_type text NOT NULL CHECK (drill_type IN ('where_is_it', 'timed_find', 'index_term')),
  elapsed_ms integer NOT NULL CHECK (elapsed_ms >= 0),
  target_time_ms integer CHECK (target_time_ms IS NULL OR target_time_ms > 0),
  met_target_time boolean,
  first_try_correct boolean NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_navigation_attempts_user_jur_time
  ON public.navigation_attempts (user_id, jurisdiction_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_navigation_attempts_user_chapter
  ON public.navigation_attempts (user_id, chapter_node_id);

ALTER TABLE public.navigation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.navigation_attempts FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.navigation_attempts TO authenticated;

CREATE POLICY navigation_attempts_select_own
  ON public.navigation_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY navigation_attempts_insert_own_open_book
  ON public.navigation_attempts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.jurisdictions j
      WHERE j.id = jurisdiction_id
        AND j.open_book = true
    )
  );

CREATE POLICY navigation_attempts_update_own
  ON public.navigation_attempts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY navigation_attempts_delete_own
  ON public.navigation_attempts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Seed original paraphrased outline_nodes (IPC 2021 & UPC 2024)
-- ---------------------------------------------------------------------------

INSERT INTO public.outline_nodes (
  id,
  topic_id,
  parent_id,
  jurisdiction_id,
  code_family,
  edition,
  code_ref,
  title,
  summary_md,
  display_order,
  node_kind,
  index_terms,
  lookup_cues,
  target_time_ms
)
VALUES
  -- IPC 2021 Chapters
  (
    '33333333-3333-4333-8333-000000000100',
    '22222222-2222-4222-8222-222222222201',
    NULL,
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 3',
    'General Piping Protection & Supports',
    'Structural hanger spacing, corrosion sleeving, trench bedding, and pressure testing rules.',
    300,
    'chapter',
    ARRAY['Pipe supports', 'Trenching', 'Sleeves', 'Testing'],
    ARRAY['Rules for hanging horizontal piping and protecting pipes passing through concrete.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000000200',
    '22222222-2222-4222-8222-222222222202',
    NULL,
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 4',
    'Fixtures, Faucets & Clearances',
    'Occupant-based minimum fixture counts, spacing clearances, and fixture fitting standards.',
    400,
    'chapter',
    ARRAY['Fixtures', 'Clearances', 'Minimum facilities', 'Water closets'],
    ARRAY['Occupancy-based fixture counts and front/side spacing around lavatories and water closets.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000000300',
    '22222222-2222-4222-8222-222222222203',
    NULL,
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 5',
    'Water Heaters & Safety Relief',
    'T&P relief valve sizing, discharge termination, drain pans, and thermal expansion control.',
    500,
    'chapter',
    ARRAY['Water heaters', 'T&P relief valve', 'Drain pans', 'Thermal expansion'],
    ARRAY['Safety relief discharge routing and leak pan requirements for elevated storage heaters.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000000400',
    '22222222-2222-4222-8222-222222222204',
    NULL,
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 6',
    'Water Supply & Backflow Control',
    'WSFU load sizing tables, velocity limits, shutoff locations, and cross-connection protection.',
    600,
    'chapter',
    ARRAY['Water distribution', 'WSFU', 'Backflow prevention', 'Air gaps'],
    ARRAY['Sizing potable distribution lines and selecting hazard-rated cross-connection devices.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000000500',
    '22222222-2222-4222-8222-222222222206',
    NULL,
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 7',
    'Sanitary Drainage & DFU Sizing',
    'Drainage fixture units, minimum pipe slopes, fitting orientation, and cleanout spacing.',
    700,
    'chapter',
    ARRAY['Sanitary drainage', 'DFU', 'Pipe slope', 'Cleanouts'],
    ARRAY['Assigning drainage fixture unit loads, sizing branches, and placing cleanouts.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000000600',
    '22222222-2222-4222-8222-222222222207',
    NULL,
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 9',
    'Vents & Venting Systems',
    'Trap-to-vent distance limits, wet/circuit venting rules, AAVs, and vent sizing.',
    900,
    'chapter',
    ARRAY['Vents', 'Trap arm', 'Wet venting', 'Air admittance valves'],
    ARRAY['Maximum trap-arm distances and sizing dry, wet, or circuit vent runs.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000000700',
    '22222222-2222-4222-8222-222222222208',
    NULL,
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 10',
    'Traps, Interceptors & Separators',
    'Trap seal depth ranges, prohibited trap designs, grease interceptors, and oil separators.',
    1000,
    'chapter',
    ARRAY['Traps', 'Trap seal', 'Grease interceptors', 'Oil separators'],
    ARRAY['Trap seal depth bounds and interceptor sizing for commercial food or garage drains.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000000800',
    '22222222-2222-4222-8222-222222222209',
    NULL,
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 11',
    'Storm Drainage & Roof Piping',
    'Rainfall rate roof leader tables, secondary emergency roof drains, and storm subdrains.',
    1100,
    'chapter',
    ARRAY['Storm drainage', 'Roof drains', 'Rainfall rates', 'Leaders'],
    ARRAY['Sizing horizontal storm drains and secondary roof overflow conductors by rainfall rate.'],
    25000
  ),

  -- IPC 2021 Child Sections & Tables
  (
    '33333333-3333-4333-8333-000000000101',
    '22222222-2222-4222-8222-222222222201',
    '33333333-3333-4333-8333-000000000100',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 3 · Support Table',
    'Horizontal & Vertical Hanger Spacing Table',
    'Lookup table specifying maximum interval between pipe hangers and sway bracing by material.',
    301,
    'table',
    ARRAY['Hanger spacing', 'Pipe supports', 'Support intervals'],
    ARRAY['Where do you check the maximum hanger spacing interval for horizontal CPVC vs cast-iron pipe?'],
    20000
  ),
  (
    '33333333-3333-4333-8333-000000000102',
    '22222222-2222-4222-8222-222222222201',
    '33333333-3333-4333-8333-000000000100',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 3 · Protection',
    'Corrosion Shielding, Notching & Penetration Protection',
    'Requirements for protective sleeves through masonry/concrete slabs and nail plates.',
    302,
    'section',
    ARRAY['Piping protection', 'Nail plates', 'Concrete sleeves'],
    ARRAY['Locate rules requiring nail protection plates and nonmetallic sleeves through concrete slabs.'],
    22000
  ),
  (
    '33333333-3333-4333-8333-000000000201',
    '22222222-2222-4222-8222-222222222202',
    '33333333-3333-4333-8333-000000000200',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 4 · Fixture Table',
    'Minimum Plumbing Facilities by Occupancy',
    'Occupant-load ratio table determining required water closets, lavatories, and drinking fountains.',
    401,
    'table',
    ARRAY['Minimum plumbing facilities', 'Occupant load fixtures', 'Drinking fountains'],
    ARRAY['Where is the occupancy ratio table for minimum water closets and lavatories in an assembly hall?'],
    18000
  ),
  (
    '33333333-3333-4333-8333-000000000202',
    '22222222-2222-4222-8222-222222222202',
    '33333333-3333-4333-8333-000000000200',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 4 · Clearances',
    'Water Closet & Urinal Stall Clearances',
    'Minimum centerline side spacing and front clearance dimensions around plumbing fixtures.',
    402,
    'section',
    ARRAY['Fixture clearances', 'Centerline spacing', 'Compartment depth'],
    ARRAY['Locate required side-wall centerline and front clearances for water closet installations.'],
    22000
  ),
  (
    '33333333-3333-4333-8333-000000000301',
    '22222222-2222-4222-8222-222222222203',
    '33333333-3333-4333-8333-000000000300',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 5 · Relief Routing',
    'T&P Relief Valve & Discharge Piping Rules',
    'Approved relief discharge piping sizing, air gap termination points, and valve prohibited items.',
    501,
    'section',
    ARRAY['Relief valve discharge', 'Temperature and pressure relief', 'Termination elevation'],
    ARRAY['Where do you verify allowed termination height and materials for a water heater relief discharge pipe?'],
    20000
  ),
  (
    '33333333-3333-4333-8333-000000000302',
    '22222222-2222-4222-8222-222222222203',
    '33333333-3333-4333-8333-000000000300',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 5 · Drain Pans',
    'Safety Drain Pans & Pan Drain Sizing',
    'When leak pans are mandated above finished spaces and minimum pan drain pipe rules.',
    502,
    'section',
    ARRAY['Water heater pan', 'Pan drain line', 'Elevated installation'],
    ARRAY['Find the rule requiring a watertight pan under a water heater installed over finished ceilings.'],
    22000
  ),
  (
    '33333333-3333-4333-8333-000000000401',
    '22222222-2222-4222-8222-222222222204',
    '33333333-3333-4333-8333-000000000400',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 6 · WSFU Table',
    'Water Supply Fixture Units & Demand Sizing',
    'Tables translating fixture counts into WSFU loads and peak gpm flow for pipe sizing.',
    601,
    'table',
    ARRAY['WSFU load values', 'Water distribution sizing', 'Peak flow gpm'],
    ARRAY['Where do you look up WSFU demand weights for private vs public flushometer closets?'],
    18000
  ),
  (
    '33333333-3333-4333-8333-000000000402',
    '22222222-2222-4222-8222-222222222205',
    '33333333-3333-4333-8333-000000000400',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 6 · Backflow Table',
    'Cross-Connection Protection & Air Gap Table',
    'Matching degree of hazard to RPZ, PVB, double-check, or minimum air-gap multiplier.',
    602,
    'table',
    ARRAY['RPZ assemblies', 'Cross-connection hazard', 'Minimum air gap'],
    ARRAY['Where is the table pairing high-hazard chemical lines or submerged inlets with required backflow preventers?'],
    20000
  ),
  (
    '33333333-3333-4333-8333-000000000501',
    '22222222-2222-4222-8222-222222222206',
    '33333333-3333-4333-8333-000000000500',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 7 · DFU Table',
    'Drainage Fixture Units per Fixture & Trap Size',
    'Master lookup table listing assigned DFU load and minimum trap size for sanitary fixtures.',
    701,
    'table',
    ARRAY['Drainage fixture units', 'Minimum trap size', 'Sanitary load table'],
    ARRAY['Where do you find the DFU value assigned to a commercial floor drain or bathtub?'],
    16000
  ),
  (
    '33333333-3333-4333-8333-000000000502',
    '22222222-2222-4222-8222-222222222206',
    '33333333-3333-4333-8333-000000000500',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 7 · Branch Sizing',
    'Building Drain & Horizontal Branch Capacity Table',
    'Maximum DFU limits per nominal pipe diameter adjusted by 1/8, 1/4, or 1/2 in/ft slope.',
    702,
    'table',
    ARRAY['Building drain sizing', 'Horizontal slope capacity', 'Stack DFU limits'],
    ARRAY['Where do you size a 4-inch building drain pitched at 1/4 inch per foot by total DFU?'],
    18000
  ),
  (
    '33333333-3333-4333-8333-000000000503',
    '22222222-2222-4222-8222-222222222206',
    '33333333-3333-4333-8333-000000000500',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 7 · Fittings & Cleanouts',
    'Changes in Direction & Cleanout Spacing',
    'Permitted wye/combo vs sanitary tee orientations and maximum distance between cleanouts.',
    703,
    'section',
    ARRAY['Fitting orientation', 'Cleanout spacing', 'Direction changes'],
    ARRAY['Find which drainage fittings are allowed at vertical-to-horizontal transitions and cleanout spacing intervals.'],
    22000
  ),
  (
    '33333333-3333-4333-8333-000000000601',
    '22222222-2222-4222-8222-222222222207',
    '33333333-3333-4333-8333-000000000600',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 9 · Trap Arm Table',
    'Maximum Trap-to-Vent Distance Table',
    'Lookup table bounding horizontal distance from trap weir to vent opening by pipe size and slope.',
    901,
    'table',
    ARRAY['Trap arm distance', 'Trap weir to vent', 'Developed trap length'],
    ARRAY['Where do you look up the maximum unvented trap arm length for a 2-inch fixture drain?'],
    18000
  ),
  (
    '33333333-3333-4333-8333-000000000602',
    '22222222-2222-4222-8222-222222222207',
    '33333333-3333-4333-8333-000000000600',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 9 · Wet & Circuit Vents',
    'Wet Venting, Circuit Venting & Vent Sizing Table',
    'Developed length sizing table for vent piping plus bathroom-group wet vent allowances.',
    902,
    'section',
    ARRAY['Bathroom wet venting', 'Vent developed length', 'Circuit vent sizing'],
    ARRAY['Locate rules governing a single bathroom group horizontally wet-vented through a lavatory drain.'],
    22000
  ),
  (
    '33333333-3333-4333-8333-000000000701',
    '22222222-2222-4222-8222-222222222208',
    '33333333-3333-4333-8333-000000000700',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 10 · Traps',
    'Trap Seal Depth & Prohibited Trap Configurations',
    'Minimum/maximum liquid seal depth and bans on S-traps, bell traps, and double trapping.',
    1001,
    'section',
    ARRAY['Trap seal depth', 'Prohibited S-traps', 'Double trapping'],
    ARRAY['Where is the liquid seal range requirement and list of prohibited trap types?'],
    22000
  ),
  (
    '33333333-3333-4333-8333-000000000702',
    '22222222-2222-4222-8222-222222222208',
    '33333333-3333-4333-8333-000000000700',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 10 · Interceptors',
    'Grease Interceptors & Oil/Sand Separators',
    'Flow-control, venting, and retention rules for commercial kitchen grease and garage oil separators.',
    1002,
    'section',
    ARRAY['Grease traps', 'Oil separators', 'Flow control devices'],
    ARRAY['Locate sizing and venting rules for a hydromechanical grease interceptor or auto-repair oil separator.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000000801',
    '22222222-2222-4222-8222-222222222209',
    '33333333-3333-4333-8333-000000000800',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 11 · Storm Table',
    'Roof Leader & Horizontal Storm Sizing Table',
    'Projected roof square-footage capacity tables adjusted by local 100-year hourly rainfall rate.',
    1101,
    'table',
    ARRAY['Storm leader sizing', 'Projected roof area', 'Hourly rainfall rate'],
    ARRAY['Where do you convert projected roof area and inches-per-hour rainfall into vertical leader pipe diameter?'],
    20000
  ),
  (
    '33333333-3333-4333-8333-000000000802',
    '22222222-2222-4222-8222-222222222209',
    '33333333-3333-4333-8333-000000000800',
    NULL,
    'IPC',
    '2021',
    'IPC Ch. 11 · Overflow',
    'Secondary Emergency Roof Drains & Subdrains',
    'Independent overflow conductor sizing and scupper/drain elevation separation rules.',
    1102,
    'section',
    ARRAY['Secondary roof drains', 'Emergency overflow', 'Scupper elevation'],
    ARRAY['Locate requirements keeping secondary emergency roof overflow piping independent from primary leaders.'],
    25000
  ),

  -- UPC 2024 Chapters & Children (parity catalog for UPC open-book states)
  (
    '33333333-3333-4333-8333-000000002300',
    '22222222-2222-4222-8222-222222222201',
    NULL,
    NULL,
    'UPC',
    '2024',
    'UPC Ch. 3',
    'General Regulations & Pipe Supports',
    'General installation practices, workmanship, corrosion protection, and hanger spacing.',
    300,
    'chapter',
    ARRAY['UPC supports', 'Pipe sleeves', 'Backfill protection'],
    ARRAY['Locate general installation, trench backfill, and structural hanger spacing requirements.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000002301',
    '22222222-2222-4222-8222-222222222201',
    '33333333-3333-4333-8333-000000002300',
    NULL,
    'UPC',
    '2024',
    'UPC Ch. 3 · Hangers',
    'UPC Hanger & Rod Sizing Table',
    'Maximum horizontal and vertical support intervals by piping material.',
    301,
    'table',
    ARRAY['Hanger rod spacing', 'Vertical stack supports', 'Pipe clamp intervals'],
    ARRAY['Where is the UPC table for maximum hanger spacing across ABS, PVC, and copper tubing?'],
    20000
  ),
  (
    '33333333-3333-4333-8333-000000002600',
    '22222222-2222-4222-8222-222222222204',
    NULL,
    NULL,
    'UPC',
    '2024',
    'UPC Ch. 6',
    'Water Supply & Distribution',
    'WSFU load sizing, backflow assemblies, pressure regulators, and supply testing.',
    600,
    'chapter',
    ARRAY['UPC water supply', 'WSFU sizing', 'Backflow devices'],
    ARRAY['Potable water sizing tables and cross-connection control assembly requirements.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000002601',
    '22222222-2222-4222-8222-222222222204',
    '33333333-3333-4333-8333-000000002600',
    NULL,
    'UPC',
    '2024',
    'UPC Ch. 6 · Sizing Table',
    'Water Supply Fixture Units & Pipe Sizing Table',
    'Developed-length and pressure-drop water sizing tables based on fixture unit totals.',
    601,
    'table',
    ARRAY['WSFU pressure chart', 'Supply branch demand', 'Meter loss'],
    ARRAY['Find the UPC water supply sizing table adjusting pipe size by available static pressure and developed length.'],
    18000
  ),
  (
    '33333333-3333-4333-8333-000000002700',
    '22222222-2222-4222-8222-222222222207',
    NULL,
    NULL,
    'UPC',
    '2024',
    'UPC Ch. 9',
    'Vents & Venting',
    'Trap-to-vent developed length, aggregate vent area, island sink venting, and wet vents.',
    900,
    'chapter',
    ARRAY['UPC venting', 'Trap arm limits', 'Island sink vents'],
    ARRAY['Trap arm limits and UPC rules for wet venting, circuit vents, and island fixtures.'],
    25000
  ),
  (
    '33333333-3333-4333-8333-000000002701',
    '22222222-2222-4222-8222-222222222207',
    '33333333-3333-4333-8333-000000002700',
    NULL,
    'UPC',
    '2024',
    'UPC Ch. 9 · Trap Arms',
    'Trap Arm Length & Aggregate Vent Sizing',
    'UPC trap-to-vent table and aggregate cross-sectional vent sizing requirements.',
    901,
    'table',
    ARRAY['Aggregate vent area', 'Trap-to-vent table', 'Vent stack sizing'],
    ARRAY['Where do you check horizontal trap arm length limits and vent sizing for a UPC layout?'],
    18000
  )
ON CONFLICT (id) DO NOTHING;
