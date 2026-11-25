'use client';
// The editor's production steps on the editor page (footage, V1, V2, complete).
import { useState } from 'react';
import { StaffProduction } from './Production.js';
import { api, useToast } from './ui.js';

export default function EditorProduction({ initial }) {
  const [p, setP] = useState(initial);
  const [toast, say] = useToast();
  const act = async (action, ok) => {
    try { const d = await api(`/api/projects/${p.id}`, { method: 'POST', body: action }); setP(d.project); if (ok) say(ok); return true; }
    catch (e) { say(e.message); return false; }
  };
  return <div id="production"><StaffProduction p={p} act={act} role="editor" />{toast}</div>;
}
