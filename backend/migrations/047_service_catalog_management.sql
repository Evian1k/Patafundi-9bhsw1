-- Service catalog hardening: one canonical taxonomy, country availability/pricing,
-- and an explicit permission for authorized platform/content staff.
-- Existing service and country rows are preserved; deactivation is soft-only.

ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE service_categories ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);

ALTER TABLE country_service_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Enforce referential integrity for newly inserted/updated country rows while
-- leaving any pre-existing legacy rows untouched until separately reconciled.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'country_service_categories_service_category_fk'
      AND conrelid = 'country_service_categories'::regclass
  ) THEN
    ALTER TABLE country_service_categories
      ADD CONSTRAINT country_service_categories_service_category_fk
      FOREIGN KEY (service_category) REFERENCES service_categories(slug)
      ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_service_categories_active_order
  ON service_categories (is_active, sort_order, slug);
CREATE INDEX IF NOT EXISTS idx_country_service_categories_available
  ON country_service_categories (country_code, is_available, service_category);

-- The starter seeds did not cover all master-prompt services. These are initial
-- catalog records, not frontend constants; authorized staff can edit/deactivate
-- them through the permission-scoped admin API. Existing values are never reset.
INSERT INTO service_categories (slug, title, description, icon, sort_order, aliases)
VALUES
  ('plumbing', 'Plumbing', 'Leaks, fixtures, drainage, and urgent plumbing repairs.', 'water', 10, ARRAY['plumber','pipes','leak','drainage']),
  ('electrical', 'Electrical', 'Fault diagnosis, wiring, lighting, and electrical repairs.', 'flash', 20, ARRAY['electrician','wiring','power','lighting']),
  ('hvac', 'AC & HVAC', 'Air conditioning installation, maintenance, and repair.', 'snow', 30, ARRAY['air conditioning','aircon','ac','heating']),
  ('cleaning', 'Cleaning', 'Home, office, and move-in/move-out cleaning.', 'sparkles', 40, ARRAY['cleaner','house cleaning','office cleaning']),
  ('auto-repair', 'Auto Repair', 'Vehicle diagnostics, repair, and maintenance.', 'car', 50, ARRAY['mechanic','vehicle repair','car repair']),
  ('mechanic', 'Mechanic', 'Automotive mechanics, servicing, and repairs.', 'car', 55, ARRAY['auto repair','car mechanic']),
  ('vehicle-services', 'Vehicle Services', 'Vehicle repair and maintenance services.', 'car', 60, ARRAY['vehicle repair','automotive']),
  ('carpentry', 'Carpentry', 'Furniture repair, installation, and custom woodwork.', 'hammer', 70, ARRAY['carpenter','woodwork','cabinet']),
  ('painting', 'Painting', 'Interior and exterior painting services.', 'color-palette', 80, ARRAY['painter','repainting']),
  ('general-repairs', 'General Repairs', 'Everyday home and property repair work.', 'construct', 90, ARRAY['handyman','general repair','home repair']),
  ('appliance-repair', 'Appliance Repair', 'Repair and maintenance for household appliances.', 'construct', 100, ARRAY['fridge repair','washing machine','oven repair']),
  ('cctv-security', 'CCTV & Security', 'CCTV, alarm, access-control, and security installation.', 'videocam', 110, ARRAY['cctv','security cameras','alarms']),
  ('internet-wifi', 'Internet & Wi-Fi', 'Router, Wi-Fi, network, and internet installation support.', 'wifi', 120, ARRAY['wifi','wi-fi','router','network']),
  ('construction-renovation', 'Construction & Renovation', 'Construction, remodeling, and renovation services.', 'business', 130, ARRAY['renovation','remodeling','construction']),
  ('landscaping', 'Landscaping & Gardening', 'Landscaping, garden care, and outdoor maintenance.', 'leaf', 140, ARRAY['gardening','garden care','lawn']),
  ('gardening', 'Gardening', 'Garden maintenance and horticultural services.', 'leaf', 145, ARRAY['landscaping','lawn care']),
  ('pest-control', 'Pest Control', 'Pest inspection and control services.', 'bug', 150, ARRAY['fumigation','exterminator','termites']),
  ('moving', 'Moving & Packing', 'Household and office moving, packing, and transport.', 'truck', 160, ARRAY['movers','relocation','packing']),
  ('moving-services', 'Moving Services', 'Relocation and heavy-item transport services.', 'truck', 165, ARRAY['moving','movers']),
  ('roofing', 'Roofing', 'Roof inspection, repair, and installation.', 'home', 170, ARRAY['roof repair','gutters']),
  ('welding', 'Welding', 'Welding and metal fabrication services.', 'flame', 180, ARRAY['metalwork','fabrication']),
  ('masonry', 'Masonry & Concrete', 'Brickwork, blockwork, and concrete services.', 'cube', 190, ARRAY['brickwork','concrete']),
  ('tiling-flooring', 'Tiling & Flooring', 'Floor and wall tiling, installation, and repair.', 'grid', 200, ARRAY['tiles','flooring']),
  ('glass-windows', 'Glass & Windows', 'Glass, windows, and glazing installation or repair.', 'grid', 210, ARRAY['glazing','window repair']),
  ('locksmith', 'Locksmith', 'Lock, key, and access services.', 'key', 220, ARRAY['locks','keys']),
  ('solar', 'Solar Installation', 'Solar panel, inverter, and related installation.', 'sunny', 230, ARRAY['solar panels','inverter']),
  ('electronics-repair', 'Electronics Repair', 'Repair and diagnosis of household electronics.', 'hardware-chip', 240, ARRAY['electronics']),
  ('phone-repair', 'Phone Repair', 'Mobile phone and tablet repair.', 'phone-portrait', 250, ARRAY['mobile repair','screen repair']),
  ('computer-repair', 'Computer Repair', 'Computer, laptop, and network-device repair.', 'laptop', 260, ARRAY['laptop repair','pc repair']),
  ('furniture-assembly', 'Furniture Assembly', 'Furniture assembly, repair, and installation.', 'cube', 270, ARRAY['flat-pack assembly']),
  ('generator', 'Generator Services', 'Generator installation, maintenance, and repair.', 'flash', 280, ARRAY['genset']),
  ('water-irrigation', 'Water & Irrigation', 'Water-system and irrigation installation or repair.', 'water', 290, ARRAY['irrigation','water system']),
  ('commercial-maintenance', 'Commercial Maintenance', 'Maintenance services for commercial premises.', 'briefcase', 300, ARRAY['business maintenance']),
  ('other', 'Other service', 'Describe a legitimate service not currently listed.', 'ellipsis-horizontal', 999, ARRAY['other service','not listed'])
ON CONFLICT (slug) DO UPDATE SET
  aliases = CASE WHEN cardinality(service_categories.aliases) = 0 THEN EXCLUDED.aliases ELSE service_categories.aliases END,
  color = COALESCE(service_categories.color, EXCLUDED.color);

-- Kenya is the launch country. Seed missing availability rows only; never
-- overwrite any existing per-country activation or pricing decisions.
INSERT INTO country_service_categories (country_code, service_category, is_available, display_name)
SELECT 'KE', slug, true, title
FROM service_categories
WHERE is_active = true
ON CONFLICT (country_code, service_category) DO NOTHING;

INSERT INTO permissions (code, description, category, is_dangerous)
VALUES ('can_manage_service_catalog', 'Create and manage database-backed service categories and country availability', 'system', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code)
VALUES ('super_admin', 'can_manage_service_catalog'), ('admin', 'can_manage_service_catalog')
ON CONFLICT DO NOTHING;
