export type ToolUnits = 'mm';
export type ToolCoolant = 'off' | 'flood' | 'mist';
export type CutterMaterial = 'carbide' | 'hss';
export type ToolCoating = 'dlc' | 'uncoated' | 'altin' | 'altisin' | 'other';
export type ToolType =
  | 'endmill'
  | 'ballmill'
  | 'vbit'
  | 'drill'
  | 'surfacing'
  | 'engraving'
  | 'chamfer'
  | 'other';

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface Tool {
  id: string;
  ownerUserId: string;
  name: string;
  type: ToolType;
  units: ToolUnits;
  diameter: number;
  flutes: number;
  vAngle: number;
  manufacturer: string;
  cutterMaterial: CutterMaterial;
  coating: ToolCoating;
  productUrl: string;
  notes: string;
  source: 'manual' | 'fusion' | 'bearsender';
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Recipe {
  id: string;
  toolId: string;
  ownerUserId: string;
  material: string;
  operation: string;
  rpm: number;
  feed: number;
  plunge: number;
  stepdown: number;
  stepover: number;
  coolant: ToolCoolant;
  notes: string;
  voteCount: number;
  viewerHasVoted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryTool extends Tool {
  recipes: Recipe[];
}

export interface UserTool {
  tool: Tool;
  recipe: Recipe | null;
  toolNumber: number;
}

export interface ToolInput {
  name: string;
  type: ToolType;
  units: ToolUnits;
  diameter: number;
  flutes: number;
  vAngle: number;
  manufacturer: string;
  cutterMaterial: CutterMaterial;
  coating: ToolCoating;
  productUrl: string;
  notes: string;
  source: Tool['source'];
  isPublic: boolean;
}

export interface RecipeInput {
  toolId?: string;
  material: string;
  operation: string;
  rpm: number;
  feed: number;
  plunge: number;
  stepdown: number;
  stepover: number;
  coolant: ToolCoolant;
  notes: string;
}

export interface PublishToolInput {
  tool: ToolInput;
  recipe: RecipeInput;
  addToMyTools?: boolean;
  toolNumber?: number;
}

export interface BearSenderTool {
  id: string;
  toolNumber: number;
  name: string;
  type: ToolType;
  units: ToolUnits;
  diameter: number;
  flutes: number;
  vAngle: number;
  defaultRpm: number;
  defaultFeed: number;
  defaultPlunge: number;
  stepdown: number;
  stepover: number;
  coolant: ToolCoolant;
  notes: string;
  manufacturer?: string;
  cutterMaterial?: CutterMaterial;
  coating?: ToolCoating;
}

export interface BearSenderPayload {
  version: 1;
  tools: BearSenderTool[];
}

export const TOOL_TYPES: ToolType[] = ['endmill', 'ballmill', 'vbit', 'drill', 'surfacing', 'engraving', 'chamfer', 'other'];
export const COOLANT_MODES: ToolCoolant[] = ['off', 'flood', 'mist'];
export const CUTTER_MATERIALS: CutterMaterial[] = ['carbide', 'hss'];
export const TOOL_COATINGS: ToolCoating[] = ['dlc', 'uncoated', 'altin', 'altisin', 'other'];
export const WORK_MATERIALS = ['Wood', 'Plastic', 'Brass', 'Bronze', 'Aluminium', 'Mild Steel', 'Other'] as const;
export const FLUTE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export const TOOL_TYPE_LABELS: Record<ToolType, string> = {
  endmill: 'End Mill',
  ballmill: 'Ball Mill',
  vbit: 'V-Bit',
  drill: 'Drill',
  surfacing: 'Surfacing',
  engraving: 'Engraving',
  chamfer: 'Chamfer',
  other: 'Other',
};

export const CUTTER_MATERIAL_LABELS: Record<CutterMaterial, string> = {
  carbide: 'Carbide',
  hss: 'HSS',
};

export const TOOL_COATING_LABELS: Record<ToolCoating, string> = {
  dlc: 'DLC',
  uncoated: 'Uncoated',
  altin: 'AlTiN',
  altisin: 'AlTiSiN',
  other: 'Other',
};

export function generatedToolName(tool: Pick<ToolInput, 'manufacturer' | 'cutterMaterial' | 'coating' | 'type' | 'diameter' | 'flutes'>): string {
  const parts = [
    tool.manufacturer.trim(),
    CUTTER_MATERIAL_LABELS[tool.cutterMaterial],
    TOOL_COATING_LABELS[tool.coating],
    `${tool.diameter || 0} mm`,
    `${tool.flutes}F`,
    TOOL_TYPE_LABELS[tool.type],
  ].filter(Boolean);
  return parts.join(' ');
}

export function emptyToolInput(): ToolInput {
  return {
    name: '',
    type: 'endmill',
    units: 'mm',
    diameter: 6,
    flutes: 2,
    vAngle: 0,
    manufacturer: '',
    cutterMaterial: 'carbide',
    coating: 'uncoated',
    productUrl: '',
    notes: '',
    source: 'manual',
    isPublic: true,
  };
}

export function emptyRecipeInput(): RecipeInput {
  return {
    material: 'Aluminium',
    operation: 'Adaptive clearing',
    rpm: 18000,
    feed: 1200,
    plunge: 250,
    stepdown: 1,
    stepover: 40,
    coolant: 'off',
    notes: '',
  };
}
