ALTER TABLE tools ADD COLUMN cutter_material TEXT NOT NULL DEFAULT 'carbide' CHECK (cutter_material IN ('carbide', 'hss'));

CREATE INDEX idx_tools_public_material ON tools(is_public, cutter_material);
