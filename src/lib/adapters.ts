import type { BearSenderPayload, BearSenderTool, ToolCoolant, ToolInput, ToolType, ToolUnits, UserTool } from './types';

const TOOL_TYPES: ToolType[] = ['endmill', 'ballmill', 'vbit', 'drill', 'surfacing', 'engraving', 'chamfer', 'other'];
const COOLANT_MODES: ToolCoolant[] = ['off', 'flood', 'mist'];

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function guid(): string {
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const r = Math.random() * 16 | 0;
    const v = char === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function slugId(name: string, fallback: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug || fallback;
}

function normalizeType(value: unknown): ToolType {
  const text = String(value || '').toLowerCase();
  return TOOL_TYPES.includes(text as ToolType) ? text as ToolType : 'endmill';
}

function normalizeUnits(value: unknown): ToolUnits {
  void value;
  return 'mm';
}

function normalizeCoolant(value: unknown): ToolCoolant {
  const text = String(value || '').toLowerCase();
  return COOLANT_MODES.includes(text as ToolCoolant) ? text as ToolCoolant : 'off';
}

export function normalizeBearSenderTool(raw: any, index: number): BearSenderTool {
  const name = String(raw?.name || raw?.label || `Tool ${index + 1}`);
  return {
    id: String(raw?.id || slugId(name, `tool-${Date.now()}-${index}`)),
    toolNumber: Math.max(0, Math.round(num(raw?.toolNumber ?? raw?.tool, index + 1))),
    name,
    type: normalizeType(raw?.type),
    units: normalizeUnits(raw?.units),
    diameter: Math.max(0, num(raw?.diameter ?? raw?.d, 6)),
    flutes: Math.max(0, Math.round(num(raw?.flutes, 2))),
    vAngle: Math.max(0, num(raw?.vAngle ?? raw?.angle, 0)),
    defaultRpm: Math.max(0, Math.round(num(raw?.defaultRpm ?? raw?.rpm, 18000))),
    defaultFeed: Math.max(0, num(raw?.defaultFeed ?? raw?.feed, 900)),
    defaultPlunge: Math.max(0, num(raw?.defaultPlunge ?? raw?.plunge, 220)),
    stepdown: Math.max(0, num(raw?.stepdown, 1)),
    stepover: Math.min(100, Math.max(0, num(raw?.stepover, 55))),
    coolant: normalizeCoolant(raw?.coolant),
    notes: String(raw?.notes || ''),
  };
}

function fusionTypeFromLocal(type: ToolType): string {
  if (type === 'ballmill') return 'ball end mill';
  if (type === 'drill') return 'drill';
  if (type === 'surfacing') return 'face mill';
  if (type === 'vbit' || type === 'engraving' || type === 'chamfer') return 'chamfer mill';
  return 'flat end mill';
}

function localTypeFromFusion(type: unknown): ToolType {
  const value = String(type || '').toLowerCase();
  if (value.includes('ball')) return 'ballmill';
  if (value.includes('drill')) return 'drill';
  if (value.includes('face')) return 'surfacing';
  if (value.includes('chamfer') || value.includes('engrave') || value.includes('v-bit') || value.includes('v bit')) return 'vbit';
  return 'endmill';
}

function parseExpressionNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value || '').match(/[-+]?\d*\.?\d+/);
  return match ? Number(match[0]) : fallback;
}

function parseStepoverPercent(expr: unknown, fallback: number): number {
  const text = String(expr || '').trim();
  const multiplier = text.match(/tool_diameter\s*\*\s*([-+]?\d*\.?\d+)/i);
  if (multiplier) return Math.max(0, Math.min(100, Number(multiplier[1]) * 100));
  const number = parseExpressionNumber(text, NaN);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : fallback;
}

function localToolFromFusion(raw: any, index: number): BearSenderTool {
  const geometry = raw?.geometry || {};
  const post = raw?.['post-process'] || {};
  const preset = Array.isArray(raw?.['start-values']?.presets) ? raw['start-values'].presets[0] || {} : {};
  const expressions = preset.expressions || {};
  return normalizeBearSenderTool({
    id: raw?.guid || `fusion-tool-${Date.now()}-${index}`,
    toolNumber: post.number ?? index + 1,
    name: raw?.description || raw?.['product-id'] || raw?.type || `Fusion tool ${index + 1}`,
    type: localTypeFromFusion(raw?.type),
    units: raw?.unit === 'inches' ? 'in' : 'mm',
    diameter: geometry.DC ?? geometry['tip-diameter'] ?? 6,
    flutes: geometry.NOF ?? 2,
    vAngle: geometry.TA ?? geometry['thread-profile-angle'] ?? 0,
    defaultRpm: preset.n ?? parseExpressionNumber(expressions.tool_spindleSpeed, 18000),
    defaultFeed: preset.v_f ?? parseExpressionNumber(expressions.tool_feedCutting, 900),
    defaultPlunge: preset.v_f_plunge ?? parseExpressionNumber(expressions.tool_feedPlunge, 220),
    stepdown: parseExpressionNumber(expressions.tool_stepdown, 1),
    stepover: parseStepoverPercent(expressions.tool_stepover, 55),
    coolant: preset['tool-coolant'] === 'flood' || preset['tool-coolant'] === 'mist' ? preset['tool-coolant'] : 'off',
    notes: post.comment || raw?.description || '',
  }, index);
}

export function parseToolLibraryJson(text: string): BearSenderTool[] {
  const parsed = JSON.parse(text);
  const isFusion = Array.isArray(parsed?.data);
  const tools = isFusion ? parsed.data : Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tools) ? parsed.tools : null;
  if (!tools) throw new Error('Expected Fusion data[] or BearSender tools[].');
  return tools.map((tool: any, index: number) => isFusion ? localToolFromFusion(tool, index) : normalizeBearSenderTool(tool, index));
}

export function bearSenderToolToPublishInput(tool: BearSenderTool): { tool: ToolInput; recipe: any; toolNumber: number } {
  return {
    tool: {
      name: tool.name,
      type: tool.type,
      units: tool.units,
      diameter: tool.diameter,
      flutes: tool.flutes,
      vAngle: tool.vAngle,
      manufacturer: '',
      cutterMaterial: 'carbide',
      productUrl: '',
      notes: tool.notes,
      source: 'bearsender',
      isPublic: true,
    },
    recipe: {
      material: 'Unspecified',
      operation: 'Default',
      rpm: tool.defaultRpm,
      feed: tool.defaultFeed,
      plunge: tool.defaultPlunge,
      stepdown: tool.stepdown,
      stepover: tool.stepover,
      coolant: tool.coolant,
      notes: tool.notes,
    },
    toolNumber: tool.toolNumber,
  };
}

export function exportBearSenderPayload(userTools: UserTool[]): BearSenderPayload {
  return {
    version: 1,
    tools: userTools
      .slice()
      .sort((a, b) => a.toolNumber - b.toolNumber || a.tool.name.localeCompare(b.tool.name))
      .map(({ tool, recipe, toolNumber }) => ({
        id: tool.id,
        toolNumber,
        name: tool.name,
        type: tool.type,
        units: tool.units,
        diameter: tool.diameter,
        flutes: tool.flutes,
        vAngle: tool.vAngle,
        defaultRpm: recipe?.rpm ?? 18000,
        defaultFeed: recipe?.feed ?? 900,
        defaultPlunge: recipe?.plunge ?? 220,
        stepdown: recipe?.stepdown ?? 1,
        stepover: recipe?.stepover ?? 55,
        coolant: recipe?.coolant ?? 'off',
        notes: recipe?.notes || tool.notes,
      })),
  };
}

export function fusionToolFromBearSender(tool: BearSenderTool): any {
  const unitName = 'millimeters';
  const unitSuffix = 'mm';
  const diameter = Math.max(tool.diameter || 0, 0.001);
  const lengthBelow = Math.max(diameter * 5, diameter + 1);
  const fluteLength = Math.max(diameter * 3, diameter);
  const overallLength = Math.max(lengthBelow + diameter * 4, fluteLength + diameter);
  const stepoverFraction = Math.max(0, Math.min(1, (tool.stepover || 0) / 100));
  const type = fusionTypeFromLocal(tool.type);

  return {
    BMC: 'unspecified',
    GRADE: 'Mill Generic',
    description: tool.name,
    expressions: {
      tool_description: `'${tool.name.replace(/'/g, "\\'")}'`,
      tool_diameter: `${diameter} ${unitSuffix}`,
      tool_live: 'false',
    },
    geometry: {
      CSP: false,
      DC: diameter,
      HAND: true,
      LB: lengthBelow,
      LCF: fluteLength,
      NOF: Math.max(Math.round(tool.flutes || 0), 0),
      NT: 1,
      OAL: overallLength,
      RE: type === 'ball end mill' ? diameter / 2 : 0,
      SFDM: diameter,
      TA: tool.vAngle || 0,
      TP: 0,
      assemblyGaugeLength: lengthBelow,
      'shoulder-length': fluteLength,
      'thread-profile-angle': 60,
      'tip-diameter': type === 'chamfer mill' ? 0 : diameter,
      'tip-length': 0,
      'tip-offset': 0,
    },
    guid: tool.id || guid(),
    'post-process': {
      'break-control': false,
      comment: tool.notes || '',
      'diameter-offset': 0,
      'length-offset': 0,
      live: false,
      'manual-tool-change': false,
      number: Math.max(0, Math.round(tool.toolNumber || 0)),
      turret: 0,
    },
    'product-id': '',
    'product-link': '',
    'start-values': {
      presets: [{
        description: 'PrintNC Tool Library default',
        expressions: {
          tool_feedCutting: `${tool.defaultFeed} mm/min`,
          tool_feedPlunge: `${tool.defaultPlunge} mm/min`,
          tool_feedRamp: `${tool.defaultPlunge} mm/min`,
          tool_spindleSpeed: `${tool.defaultRpm} rpm`,
          tool_stepdown: `${tool.stepdown || 0} ${unitSuffix}`,
          tool_stepover: `tool_diameter * ${stepoverFraction.toFixed(4)}`,
          use_tool_stepdown: 'true',
          use_tool_stepover: 'true',
        },
        f_n: 0,
        f_z: 0,
        guid: guid(),
        material: { category: 'all', query: '' },
        n: Math.max(Math.round(tool.defaultRpm || 0), 0),
        n_ramp: Math.max(Math.round(tool.defaultRpm || 0), 0),
        name: 'Default',
        'tool-coolant': tool.coolant === 'flood' || tool.coolant === 'mist' ? tool.coolant : 'disabled',
        'use-stepdown': true,
        'use-stepover': true,
        v_c: 0,
        v_f: Math.max(tool.defaultFeed || 0, 0),
        v_f_leadIn: Math.max(tool.defaultFeed || 0, 0),
        v_f_leadOut: Math.max(tool.defaultFeed || 0, 0),
        v_f_plunge: Math.max(tool.defaultPlunge || 0, 0),
        v_f_ramp: Math.max(tool.defaultPlunge || 0, 0),
        v_f_transition: Math.max(tool.defaultFeed || 0, 0),
      }],
    },
    type,
    unit: unitName,
    vendor: '',
  };
}

export function exportFusionPayload(userTools: UserTool[]): any {
  return {
    data: exportBearSenderPayload(userTools).tools.map(fusionToolFromBearSender),
    version: 25,
  };
}
