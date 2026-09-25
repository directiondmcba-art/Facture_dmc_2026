import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import type { Dispatch, SetStateAction } from 'react';
import type { Database } from './types';
import { normalizeData, seed } from './data';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
type Phase = 'local' | 'loading' | 'login' | 'bootstrap' | 'ready';
type CloudState = { phase: Phase; message: string; email: string; signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>; initialize: (useLocal: boolean) => Promise<void>; refresh: () => Promise<void> };

export function useCloudSync(db: Database, setDb: Dispatch<SetStateAction<Database>>): CloudState {
  const [phase, setPhase] = useState<Phase>(supabase ? 'loading' : 'local');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const userRef = useRef<User | null>(null);
  const revisionRef = useRef(0);
  const savedRef = useRef('');
  const pendingRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const blockedRef = useRef(false);
  const localRef = useRef(db);
  localRef.current = db;

  async function loadRemote(user: User) {
    if (!supabase) return;
    setPhase('loading'); setMessage(''); userRef.current = user; setEmail(user.email || '');
    const { data, error } = await supabase.from('crm_state').select('revision,data').eq('user_id', user.id).maybeSingle();
    if (error) { setMessage(`Lecture cloud impossible : ${error.message}`); setPhase('login'); return; }
    if (!data) { setPhase('bootstrap'); return; }
    try {
      const normalized = normalizeData(data.data as Database);
      revisionRef.current = data.revision;
      savedRef.current = JSON.stringify(normalized);
      pendingRef.current = null; blockedRef.current = false;
      setDb(normalized); setPhase('ready');
    } catch { setMessage('Les données cloud sont illisibles. Contactez l’administrateur avant toute modification.'); setPhase('login'); }
  }

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => { if (!active) return; if (data.user) void loadRemote(data.user); else { setPhase('login'); if (error && error.name !== 'AuthSessionMissingError') setMessage(error.message); } });
    return () => { active = false; };
  }, []);

  async function flush() {
    if (!supabase || busyRef.current || blockedRef.current || phase !== 'ready' || !userRef.current) return;
    busyRef.current = true;
    try {
      while (pendingRef.current && pendingRef.current !== savedRef.current) {
        const payload = pendingRef.current;
        const { data, error } = await supabase.from('crm_state').update({ data: JSON.parse(payload), revision: revisionRef.current + 1, updated_at: new Date().toISOString() }).eq('user_id', userRef.current.id).eq('revision', revisionRef.current).select('revision').maybeSingle();
        if (error) { setMessage(`Sauvegarde cloud en échec : ${error.message}. Exportez une sauvegarde JSON.`); blockedRef.current = true; break; }
        if (!data) { setMessage('Modifications sur un autre PC détectées. Exportez une sauvegarde JSON, puis rechargez les données cloud.'); blockedRef.current = true; break; }
        revisionRef.current = data.revision; savedRef.current = payload;
        setMessage('Synchronisé avec Supabase');
      }
    } finally { busyRef.current = false; }
  }

  useEffect(() => {
    if (phase !== 'ready') return;
    const serialized = JSON.stringify(db);
    if (serialized === savedRef.current) return;
    pendingRef.current = serialized;
    if (blockedRef.current) return;
    setMessage('Sauvegarde en cours…');
    const timer = window.setTimeout(() => { void flush(); }, 650);
    return () => window.clearTimeout(timer);
  }, [db, phase]);

  async function signIn(loginEmail: string, password: string) {
    if (!supabase) return;
    setMessage('Connexion…');
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
    if (error || !data.user) { setMessage(error?.message || 'Connexion impossible.'); return; }
    await loadRemote(data.user);
  }

  async function signOut() {
    if (!supabase) return;
    if ((blockedRef.current || pendingRef.current && pendingRef.current !== savedRef.current || busyRef.current) && !confirm('Des modifications ne sont pas synchronisées. Exportez une sauvegarde JSON avant de vous déconnecter. Continuer ?')) return;
    await supabase.auth.signOut(); userRef.current = null; savedRef.current = ''; pendingRef.current = null; blockedRef.current = false;
    setDb(structuredClone(seed)); setEmail(''); setMessage(''); setPhase('login');
  }

  async function initialize(useLocal: boolean) {
    if (!supabase || !userRef.current) return;
    const initial = useLocal ? localRef.current : structuredClone(seed);
    const { data, error } = await supabase.from('crm_state').insert({ user_id: userRef.current.id, data: initial }).select('revision').single();
    if (error) { setMessage(`Initialisation impossible : ${error.message}`); return; }
    revisionRef.current = data.revision; savedRef.current = JSON.stringify(initial); pendingRef.current = null; blockedRef.current = false;
    setDb(initial); setMessage('Espace cloud initialisé'); setPhase('ready');
  }

  async function refresh() {
    if (!userRef.current || phase !== 'ready') return;
    if (blockedRef.current || pendingRef.current && pendingRef.current !== savedRef.current || busyRef.current) {
      if (!confirm('Des changements locaux ne sont pas synchronisés. Exportez une sauvegarde JSON avant de les remplacer par les données cloud. Recharger maintenant ?')) return;
    }
    await loadRemote(userRef.current);
  }

  return { phase, message, email, signIn, signOut, initialize, refresh };
}

export function CloudGate({ cloud, hasLocalData }: { cloud: CloudState; hasLocalData: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  if (cloud.phase === 'local' || cloud.phase === 'ready') return null;
  return <div className="cloud-gate"><div className="cloud-card"><div className="eyebrow">DMC · ESPACE PRIVÉ</div><h1>{cloud.phase === 'loading' ? 'Chargement…' : cloud.phase === 'bootstrap' ? 'Premier démarrage' : 'Connexion'}</h1>
    {cloud.phase === 'login' && <form onSubmit={e => { e.preventDefault(); void cloud.signIn(email, password); }}><label>Adresse e-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username"/></label><label>Mot de passe<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"/></label><button className="button primary" type="submit">Se connecter</button></form>}
    {cloud.phase === 'bootstrap' && <><p>Aucune donnée cloud pour {cloud.email}. Choisissez les données de départ pour ce compte.</p>{hasLocalData && <button className="button primary" onClick={() => void cloud.initialize(true)}>Importer les données de cet appareil</button>}<button className="button outline" onClick={() => void cloud.initialize(false)}>Commencer avec un espace vide</button></>}
    {cloud.message && <p className="cloud-message">{cloud.message}</p>}
  </div></div>;
}
