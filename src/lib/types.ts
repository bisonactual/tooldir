export type ToolUnits = 'mm' | 'in';
export type ToolCoolant = 'off' | 'flood' | 'mist';
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
}

export interface BearSenderPayload {
  version: 1;
  tools: BearSenderTool[];
}

export const TOOL_TYPES: ToolType[] = ['endmill', 'ballmill', 'vbit', 'drill', 'surfacing', 'engraving', 'chamfer', 'other'];
export const COOLANT_MODES: ToolCoolant[] = ['off', 'flood', 'mist'];

export function emptyToolInput(): ToolInput {
  return {
    name: '',
    type: 'endmill',
    units: 'mm',
    diameter: 6,
    flutes: 2,
    vAngle: 0,
    manufacturer: '',
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
