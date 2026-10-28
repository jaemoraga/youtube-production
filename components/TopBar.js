'use client';
// Header for the portal and editor pages: brand, optional label, sign out.
export default function TopBar({ label, home = '/' }) {
  return (
    <header className="top">
      <a className="brand" href={home}><span className="mark"><span /></span>Hotel Tech Report{label ? <span className="muted" style={{ fontWeight: 400 }}>&nbsp;· {label}</span> : null}</a>
      <button className="linkbtn" onClick={async () => {
        await fetch('/api/logout', { method: 'POST', headers: { 'x-htr': '1' } });
        window.location.href = home.startsWith('/editor') ? '/editor/login' : home.startsWith('/client-submission/youtube') ? '/client-submission/youtube/login' : '/login';
      }}>Sign out</button>
    </header>
  );
}
