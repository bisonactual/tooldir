ALTER TABLE tools ADD COLUMN coating TEXT NOT NULL DEFAULT 'uncoated' CHECK (coating IN ('dlc', 'uncoated', 'altin', 'altisin', 'other'));

CREATE INDEX idx_tools_public_coating ON tools(is_public, coating);
