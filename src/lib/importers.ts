import { unzipSync, strFromU8 } from 'fflate';
import { parseToolLibraryJson } from './adapters';
import type { BearSenderTool } from './types';

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export async function parseToolLibraryFile(file: File): Promise<BearSenderTool[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isZip(bytes)) return parseToolLibraryJson(new TextDecoder().decode(bytes));

  const entries = unzipSync(bytes);
  const toolsEntry = entries['tools.json'] || Object.entries(entries).find(([name]) => name.endsWith('/tools.json'))?.[1];
  if (!toolsEntry) throw new Error('Fusion .tools archive did not contain tools.json.');
  return parseToolLibraryJson(strFromU8(toolsEntry));
}
