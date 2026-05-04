import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, FileDown, Github, Library, List, LogOut, Plus, Search, ThumbsUp, Trash2, Upload, UploadCloud, User, X } from 'lucide-react';
import { bearSenderToolToPublishInput, exportBearSenderPayload, exportFusionPayload } from './lib/adapters';
import { parseToolLibraryFile } from './lib/importers';
import { COOLANT_MODES, CUTTER_MATERIAL_LABELS, CUTTER_MATERIALS, FLUTE_COUNTS, generatedToolName, emptyRecipeInput, emptyToolInput, TOOL_COATING_LABELS, TOOL_COATINGS, TOOL_TYPE_LABELS, TOOL_TYPES, WORK_MATERIALS } from './lib/types';
import type { LibraryTool, PublishToolInput, Recipe, RecipeInput, ToolInput, UserProfile, UserTool } from './lib/types';
import './styles.css';

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || '';
const SESSION_STORAGE_KEY = 'printnc-tool-library-session';
const apiUrl = (path: string) => `${API_ORIGIN}${path}`;
const authUrl = (path: string) => `${API_ORIGIN}${path}`;
const sessionToken = () => localStorage.getItem(SESSION_STORAGE_KEY);
const captureSessionFromUrl = () => {
  const url = new URL(window.location.href);
  const session = url.searchParams.get('session');
  if (!session) return;
  localStorage.setItem(SESSION_STORAGE_KEY, session);
  url.searchParams.delete('session');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
};
const authHeaders = (body?: unknown): HeadersInit => {
  const token = sessionToken();
  return {
    ...(body ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
};

const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(apiUrl(path), { credentials: 'include', headers: authHeaders() });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  },
  async send<T>(path: string, method: string, body?: unknown): Promise<T> {
    const res = await fetch(apiUrl(path), {
      method,
      credentials: 'include',
      headers: authHeaders(body),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  },
};

function downloadJson(name: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function NumberInput({ value, onChange, min = 0, step = 1 }: { value: number; onChange: (value: number) => void; min?: number; step?: number }) {
  return <input type="number" min={min} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />;
}

function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [library, setLibrary] = useState<LibraryTool[]>([]);
  const [myTools, setMyTools] = useState<UserTool[]>([]);
  const [query, setQuery] = useState('');
  const [myQuery, setMyQuery] = useState('');
  const [view, setView] = useState<'library' | 'mine'>('library');
  const [message, setMessage] = useState('');
  const [tool, setTool] = useState<ToolInput>(emptyToolInput());
  const [recipe, setRecipe] = useState<RecipeInput>(emptyRecipeInput());
  const [customMaterial, setCustomMaterial] = useState('');

  async function refresh() {
    const [me, lib] = await Promise.all([
      api.get<{ user: UserProfile | null }>('/api/me'),
      api.get<{ tools: LibraryTool[] }>(`/api/tools?q=${encodeURIComponent(query)}`),
    ]);
    setUser(me.user);
    setLibrary(lib.tools);
    if (me.user) setMyTools((await api.get<{ tools: UserTool[] }>('/api/my/tools')).tools);
    else setMyTools([]);
  }

  useEffect(() => {
    void refresh().catch(err => setMessage(err.message));
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void api.get<{ tools: LibraryTool[] }>(`/api/tools?q=${encodeURIComponent(query)}`).then(data => setLibrary(data.tools)).catch(err => setMessage(err.message));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const topRecipeByTool = useMemo(() => new Map(library.map(entry => [entry.id, entry.recipes[0] || null])), [library]);

  async function publish(input: PublishToolInput) {
    await api.send('/api/tools', 'POST', input);
    setMessage('Published tool and recipe.');
    setTool(emptyToolInput());
    setRecipe(emptyRecipeInput());
    setCustomMaterial('');
    await refresh();
  }

  async function importFile(file: File) {
    const imported = await parseToolLibraryFile(file);
    if (!imported.length) return;
    for (const importedTool of imported) {
      const payload = bearSenderToolToPublishInput(importedTool);
      await api.send('/api/tools', 'POST', { ...payload, addToMyTools: true });
    }
    setMessage(`Imported ${imported.length} tool${imported.length === 1 ? '' : 's'}.`);
    await refresh();
  }

  async function addToMine(entry: LibraryTool, recipeId?: string) {
    const next = myTools.reduce((max, item) => Math.max(max, item.toolNumber), 0) + 1;
    await api.send('/api/my/tools', 'POST', { toolId: entry.id, recipeId, toolNumber: next });
    setMessage(`Added ${entry.name} to your list.`);
    await refresh();
  }

  async function toggleVote(recipe: Recipe) {
    await api.send(`/api/recipes/${recipe.id}/vote`, recipe.viewerHasVoted ? 'DELETE' : 'POST');
    await refresh();
  }

  async function deleteTool(entry: LibraryTool) {
    if (!window.confirm(`Delete ${entry.name}?`)) return;
    await api.send(`/api/tools/${entry.id}`, 'DELETE');
    setMessage(`Deleted ${entry.name}.`);
    await refresh();
  }

  async function removeMyTool(item: UserTool) {
    await api.send(`/api/my/tools/${item.tool.id}`, 'DELETE');
    setMessage(`Removed ${item.tool.name} from your tools.`);
    await refresh();
  }

  const filteredMyTools = myTools.filter(item => {
    const q = myQuery.trim().toLowerCase();
    if (!q) return true;
    return [
      item.tool.name,
      item.tool.manufacturer,
      TOOL_TYPE_LABELS[item.tool.type],
      CUTTER_MATERIAL_LABELS[item.tool.cutterMaterial],
      TOOL_COATING_LABELS[item.tool.coating],
      item.recipe?.material || '',
      item.recipe?.operation || '',
    ].some(value => value.toLowerCase().includes(q));
  });

  function logout() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setUser(null);
    setMyTools([]);
    void fetch(authUrl('/auth/logout'), { credentials: 'include', headers: authHeaders() }).catch(() => undefined);
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>PrintNC Tool Library</h1>
          <p>Cutters and Recipes for the PrintNC community</p>
        </div>
        <div className="auth">
          {user ? (
            <>
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <User size={18} />}
              <span>{user.displayName}</span>
              <button className="iconButton" onClick={logout} title="Sign out"><LogOut size={18} /></button>
            </>
          ) : (
            <>
              <a className="button" href={authUrl('/auth/github')}><Github size={18} /> GitHub</a>
              <a className="button secondary" href={authUrl('/auth/google')}>Google</a>
            </>
          )}
        </div>
      </header>

      {message && <button className="notice" onClick={() => setMessage('')}>{message}</button>}

      <nav className="tabs">
        <button className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}><Library size={18} /> Public Library</button>
        <button className={view === 'mine' ? 'active' : ''} onClick={() => setView('mine')} disabled={!user}><List size={18} /> My Tools</button>
      </nav>

      <section className="toolbar">
        {view === 'library' ? (
          <label className="search">
            <Search size={18} />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tool, shape, manufacturer, carbide, HSS, coating" />
          </label>
        ) : (
          <label className="search">
            <Search size={18} />
            <input value={myQuery} onChange={event => setMyQuery(event.target.value)} placeholder="Search my tools" />
          </label>
        )}
        <label className={`button ${user ? '' : 'disabled'}`}>
          <UploadCloud size={18} />
          Import Fusion/BearSender
          <input type="file" accept=".json,.tools,application/json" disabled={!user} onChange={event => {
            const file = event.target.files?.[0];
            if (file) void importFile(file).catch(err => setMessage(err.message));
            event.currentTarget.value = '';
          }} />
        </label>
        <button disabled={!user || !myTools.length} onClick={() => downloadJson('printnc-tools.fusion.json', exportFusionPayload(myTools))}><FileDown size={18} /> Export Fusion</button>
        <button disabled={!user || !myTools.length} onClick={() => downloadJson('bearsender-tools.json', exportBearSenderPayload(myTools))}><Download size={18} /> Export BearSender</button>
      </section>

      <div className="layout">
        {view === 'library' ? (
          <section>
            <div className="sectionTitle"><Library size={20} /><h2>Public Library</h2></div>
            <div className="toolGrid">
              {library.map(entry => (
                <article className="toolCard" key={entry.id}>
                  <div className="cardHeader">
                    <div>
                      <h3>{entry.name}</h3>
                      <p>{entry.manufacturer || 'Unbranded'} · {CUTTER_MATERIAL_LABELS[entry.cutterMaterial]} · {TOOL_COATING_LABELS[entry.coating]} · {TOOL_TYPE_LABELS[entry.type]} · {entry.diameter} mm · {entry.flutes}F</p>
                      {entry.notes && <p className="notes" title={entry.notes}>{entry.notes}</p>}
                    </div>
                    <div className="cardActions">
                      {user?.isAdmin && <button className="iconButton danger" title="Delete tool" onClick={() => void deleteTool(entry).catch(err => setMessage(err.message))}><Trash2 size={16} /></button>}
                      <button disabled={!user} onClick={() => void addToMine(entry, topRecipeByTool.get(entry.id)?.id).catch(err => setMessage(err.message))}><Plus size={16} /> My list</button>
                    </div>
                  </div>
                  <div className="recipes">
                    {entry.recipes.length ? entry.recipes.map(item => (
                      <div className="recipe" key={item.id}>
                        <div>
                          <strong>{item.material}</strong>
                          <span>{item.operation} · {item.rpm} rpm · {item.feed} mm/min · {item.stepdown} mm DOC · {item.stepover}% WOC</span>
                          {item.notes && <span className="notes" title={item.notes}>{item.notes}</span>}
                        </div>
                        <button className={item.viewerHasVoted ? 'voted' : ''} disabled={!user} onClick={() => void toggleVote(item).catch(err => setMessage(err.message))}>
                          <ThumbsUp size={16} /> {item.voteCount}
                        </button>
                      </div>
                    )) : <p className="empty">No recipes yet.</p>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section>
            <div className="sectionTitle"><List size={20} /><h2>My Tools</h2></div>
            <div className="toolGrid">
              {filteredMyTools.map(item => (
                <article className="toolCard" key={item.tool.id}>
                  <div className="cardHeader">
                    <div>
                      <h3>T{item.toolNumber} · {item.tool.name}</h3>
                      <p>{item.tool.manufacturer || 'Unbranded'} · {CUTTER_MATERIAL_LABELS[item.tool.cutterMaterial]} · {TOOL_COATING_LABELS[item.tool.coating]} · {TOOL_TYPE_LABELS[item.tool.type]} · {item.tool.diameter} mm · {item.tool.flutes}F</p>
                      {item.tool.notes && <p className="notes" title={item.tool.notes}>{item.tool.notes}</p>}
                    </div>
                    <button className="iconButton danger" title="Remove from my tools" onClick={() => void removeMyTool(item).catch(err => setMessage(err.message))}><X size={16} /></button>
                  </div>
                  {item.recipe ? (
                    <div className="recipes">
                      <div className="recipe">
                        <div>
                          <strong>{item.recipe.material}</strong>
                          <span>{item.recipe.operation} · {item.recipe.rpm} rpm · {item.recipe.feed} mm/min · {item.recipe.stepdown} mm DOC · {item.recipe.stepover}% WOC</span>
                          {item.recipe.notes && <span className="notes" title={item.recipe.notes}>{item.recipe.notes}</span>}
                        </div>
                      </div>
                    </div>
                  ) : <p className="empty">No recipe selected.</p>}
                </article>
              ))}
              {!filteredMyTools.length && <p className="empty">{myTools.length ? 'No matching tools.' : 'No tools selected.'}</p>}
            </div>
          </section>
        )}

        <aside>
          <section className="panel">
            <h2>Publish Tool</h2>
            <div className="formGrid">
              <Field label="Manufacturer"><input value={tool.manufacturer} onChange={event => setTool({ ...tool, manufacturer: event.target.value })} placeholder="Datron, Amana, Sorotec" /></Field>
              <Field label="Shape"><select value={tool.type} onChange={event => setTool({ ...tool, type: event.target.value as ToolInput['type'] })}>{TOOL_TYPES.map(value => <option key={value} value={value}>{TOOL_TYPE_LABELS[value]}</option>)}</select></Field>
              <Field label="Type"><select value={tool.cutterMaterial} onChange={event => setTool({ ...tool, cutterMaterial: event.target.value as ToolInput['cutterMaterial'] })}>{CUTTER_MATERIALS.map(value => <option key={value} value={value}>{CUTTER_MATERIAL_LABELS[value]}</option>)}</select></Field>
              <Field label="Coating"><select value={tool.coating} onChange={event => setTool({ ...tool, coating: event.target.value as ToolInput['coating'] })}>{TOOL_COATINGS.map(value => <option key={value} value={value}>{TOOL_COATING_LABELS[value]}</option>)}</select></Field>
              <Field label="Diameter mm"><NumberInput value={tool.diameter} step={0.001} onChange={value => setTool({ ...tool, diameter: value, units: 'mm' })} /></Field>
              <Field label="Flutes"><select value={tool.flutes} onChange={event => setTool({ ...tool, flutes: Number(event.target.value) })}>{FLUTE_COUNTS.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              <Field label="V angle"><NumberInput value={tool.vAngle} step={0.1} onChange={value => setTool({ ...tool, vAngle: value })} /></Field>
              <Field label="Work Material"><select value={WORK_MATERIALS.includes(recipe.material as any) ? recipe.material : 'Other'} onChange={event => setRecipe({ ...recipe, material: event.target.value })}>{WORK_MATERIALS.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              {recipe.material === 'Other' && <Field label="Specify Material"><input value={customMaterial} onChange={event => setCustomMaterial(event.target.value)} placeholder="Composite, foam, copper" /></Field>}
              <Field label="Operation"><input value={recipe.operation} onChange={event => setRecipe({ ...recipe, operation: event.target.value })} /></Field>
              <Field label="RPM"><NumberInput value={recipe.rpm} step={100} onChange={value => setRecipe({ ...recipe, rpm: value })} /></Field>
              <Field label="Feed mm/min"><NumberInput value={recipe.feed} step={10} onChange={value => setRecipe({ ...recipe, feed: value })} /></Field>
              <Field label="Plunge mm/min"><NumberInput value={recipe.plunge} step={10} onChange={value => setRecipe({ ...recipe, plunge: value })} /></Field>
              <Field label="Stepdown mm"><NumberInput value={recipe.stepdown} step={0.01} onChange={value => setRecipe({ ...recipe, stepdown: value })} /></Field>
              <Field label="Stepover %"><NumberInput value={recipe.stepover} step={1} onChange={value => setRecipe({ ...recipe, stepover: value })} /></Field>
              <Field label="Coolant"><select value={recipe.coolant} onChange={event => setRecipe({ ...recipe, coolant: event.target.value as RecipeInput['coolant'] })}>{COOLANT_MODES.map(value => <option key={value}>{value}</option>)}</select></Field>
            </div>
            <Field label="Notes"><textarea value={tool.notes} onChange={event => setTool({ ...tool, notes: event.target.value })} /></Field>
            <button disabled={!user || !tool.manufacturer || (recipe.material === 'Other' && !customMaterial.trim())} onClick={() => {
              const namedTool = { ...tool, name: generatedToolName(tool), units: 'mm' as const };
              const namedRecipe = { ...recipe, material: recipe.material === 'Other' ? customMaterial.trim() : recipe.material };
              void publish({ tool: namedTool, recipe: namedRecipe, addToMyTools: true }).catch(err => setMessage(err.message));
            }}><Upload size={18} /> Publish</button>
          </section>

        </aside>
      </div>
    </main>
  );
}

captureSessionFromUrl();
createRoot(document.getElementById('root')!).render(<App />);
