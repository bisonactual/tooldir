import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, Github, Import, Library, LogOut, Plus, Search, ThumbsUp, Upload, User } from 'lucide-react';
import { bearSenderToolToPublishInput, exportBearSenderPayload, exportFusionPayload, parseToolLibraryJson } from './lib/adapters';
import { COOLANT_MODES, emptyRecipeInput, emptyToolInput, TOOL_TYPES } from './lib/types';
import type { LibraryTool, PublishToolInput, Recipe, RecipeInput, ToolInput, UserProfile, UserTool } from './lib/types';
import './styles.css';

const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || '';
const apiUrl = (path: string) => `${API_ORIGIN}${path}`;
const authUrl = (path: string) => `${API_ORIGIN}${path}`;

const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(apiUrl(path), { credentials: 'include' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
    return res.json();
  },
  async send<T>(path: string, method: string, body?: unknown): Promise<T> {
    const res = await fetch(apiUrl(path), {
      method,
      credentials: 'include',
      headers: body ? { 'content-type': 'application/json' } : undefined,
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
  const [message, setMessage] = useState('');
  const [tool, setTool] = useState<ToolInput>(emptyToolInput());
  const [recipe, setRecipe] = useState<RecipeInput>(emptyRecipeInput());

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
    await refresh();
  }

  async function importFile(file: File) {
    const imported = parseToolLibraryJson(await file.text());
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

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>PrintNC Tool Library</h1>
          <p>Shared cutters and proven recipes for router-class CNC work.</p>
        </div>
        <div className="auth">
          {user ? (
            <>
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <User size={18} />}
              <span>{user.displayName}</span>
              <a className="iconButton" href={authUrl('/auth/logout')} title="Sign out"><LogOut size={18} /></a>
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

      <section className="toolbar">
        <label className="search">
          <Search size={18} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tool, type, manufacturer" />
        </label>
        <label className={`button ${user ? '' : 'disabled'}`}>
          <Import size={18} />
          Import Fusion/BearSender
          <input type="file" accept=".json,.tools,application/json" disabled={!user} onChange={event => {
            const file = event.target.files?.[0];
            if (file) void importFile(file).catch(err => setMessage(err.message));
            event.currentTarget.value = '';
          }} />
        </label>
        <button disabled={!user || !myTools.length} onClick={() => downloadJson('printnc-tools.fusion.json', exportFusionPayload(myTools))}><Download size={18} /> Fusion</button>
        <button disabled={!user || !myTools.length} onClick={() => downloadJson('bearsender-tools.json', exportBearSenderPayload(myTools))}><Download size={18} /> BearSender</button>
      </section>

      <div className="layout">
        <section>
          <div className="sectionTitle"><Library size={20} /><h2>Public Library</h2></div>
          <div className="toolGrid">
            {library.map(entry => (
              <article className="toolCard" key={entry.id}>
                <div className="cardHeader">
                  <div>
                    <h3>{entry.name}</h3>
                    <p>{entry.type} · {entry.diameter}{entry.units} · {entry.flutes}F</p>
                  </div>
                  <button disabled={!user} onClick={() => void addToMine(entry, topRecipeByTool.get(entry.id)?.id).catch(err => setMessage(err.message))}><Plus size={16} /> My list</button>
                </div>
                <div className="recipes">
                  {entry.recipes.length ? entry.recipes.map(item => (
                    <div className="recipe" key={item.id}>
                      <div>
                        <strong>{item.material}</strong>
                        <span>{item.operation} · {item.rpm} rpm · {item.feed} feed · {item.stepdown} DOC · {item.stepover}% WOC</span>
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

        <aside>
          <section className="panel">
            <h2>Publish Tool</h2>
            <div className="formGrid">
              <Field label="Name"><input value={tool.name} onChange={event => setTool({ ...tool, name: event.target.value })} placeholder="6mm 2F end mill" /></Field>
              <Field label="Type"><select value={tool.type} onChange={event => setTool({ ...tool, type: event.target.value as ToolInput['type'] })}>{TOOL_TYPES.map(value => <option key={value}>{value}</option>)}</select></Field>
              <Field label="Units"><select value={tool.units} onChange={event => setTool({ ...tool, units: event.target.value as ToolInput['units'] })}><option>mm</option><option>in</option></select></Field>
              <Field label="Diameter"><NumberInput value={tool.diameter} step={0.001} onChange={value => setTool({ ...tool, diameter: value })} /></Field>
              <Field label="Flutes"><NumberInput value={tool.flutes} onChange={value => setTool({ ...tool, flutes: value })} /></Field>
              <Field label="V angle"><NumberInput value={tool.vAngle} step={0.1} onChange={value => setTool({ ...tool, vAngle: value })} /></Field>
              <Field label="Material"><input value={recipe.material} onChange={event => setRecipe({ ...recipe, material: event.target.value })} /></Field>
              <Field label="Operation"><input value={recipe.operation} onChange={event => setRecipe({ ...recipe, operation: event.target.value })} /></Field>
              <Field label="RPM"><NumberInput value={recipe.rpm} step={100} onChange={value => setRecipe({ ...recipe, rpm: value })} /></Field>
              <Field label="Feed"><NumberInput value={recipe.feed} step={10} onChange={value => setRecipe({ ...recipe, feed: value })} /></Field>
              <Field label="Plunge"><NumberInput value={recipe.plunge} step={10} onChange={value => setRecipe({ ...recipe, plunge: value })} /></Field>
              <Field label="Stepdown"><NumberInput value={recipe.stepdown} step={0.01} onChange={value => setRecipe({ ...recipe, stepdown: value })} /></Field>
              <Field label="Stepover %"><NumberInput value={recipe.stepover} step={1} onChange={value => setRecipe({ ...recipe, stepover: value })} /></Field>
              <Field label="Coolant"><select value={recipe.coolant} onChange={event => setRecipe({ ...recipe, coolant: event.target.value as RecipeInput['coolant'] })}>{COOLANT_MODES.map(value => <option key={value}>{value}</option>)}</select></Field>
            </div>
            <Field label="Notes"><textarea value={tool.notes} onChange={event => setTool({ ...tool, notes: event.target.value })} /></Field>
            <button disabled={!user || !tool.name} onClick={() => void publish({ tool, recipe, addToMyTools: true }).catch(err => setMessage(err.message))}><Upload size={18} /> Publish</button>
          </section>

          <section className="panel">
            <h2>My Tools</h2>
            <div className="myList">
              {myTools.map(item => (
                <div className="myTool" key={item.tool.id}>
                  <span>T{item.toolNumber}</span>
                  <div><strong>{item.tool.name}</strong><small>{item.recipe ? `${item.recipe.material}, ${item.recipe.feed} feed` : 'No recipe selected'}</small></div>
                </div>
              ))}
              {!myTools.length && <p className="empty">{user ? 'No tools selected.' : 'Sign in to keep a personal list.'}</p>}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
