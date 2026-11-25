// Public home page. Anyone who hasn't bought a video lands here: what we make, how it works,
// examples, and one email box. A new email creates an account and lands on the order page (pay now
// or request an invoice); an existing sponsor uses the same box to sign in to their portal.
import { redirect } from 'next/navigation';
import CodeLogin from '@/components/CodeLogin.js';
import { STEPS, VideoExamples } from '@/components/VideoExamples.js';
import { getSession } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'YouTube Content Studio · Hotel Tech Report' };

const WHAT = [
  { title: 'A professionally produced review', text: 'Scripted by our editorial team, filmed in studio with a Hotel Tech Report host, and edited with your product footage.' },
  { title: 'Built from your real product', text: 'We work from a live demo of your software, so hoteliers see how it actually works, not a sizzle reel.' },
  { title: 'You review before it goes live', text: 'You give feedback on the script and on the edit. Nothing is published until both are final.' },
];

export default async function Home() {
  const s = await getSession();
  if (s?.r === 'client') redirect('/client-submission/youtube');
  if (s?.r === 'editor') redirect('/editor');
  return (
    <div className="landing">
      <header className="top wrap-wide" style={{ marginBottom: 0 }}>
        <span className="brand"><span className="mark"><span /></span>Hotel Tech Report</span>
        {s?.r === 'admin' ? <a className="linkbtn" href="/admin">Admin</a> : <a className="linkbtn" href="#start">Sign in</a>}
      </header>

      <section className="hero2 wrap-wide" id="start">
        <div className="intro">
          <div className="eyebrow">YouTube Content Studio</div>
          <h1 className="hero-title">Get your product reviewed on the Hotel Tech Report YouTube channel</h1>
          <p className="hero-sub">
            Hoteliers research software on YouTube before they buy. We produce in-depth product review
            videos for hotel technology companies and publish them where those buyers are looking.
          </p>
        </div>
        <div className="steps-col">
          <div className="steps-label">What you get</div>
          <div className="ready-list" style={{ marginTop: 0, paddingTop: 0, borderTop: 0, fontSize: 15 }}>
            {WHAT.map((w) => (
              <div key={w.title} className="ready-item">
                <span className="tick-sm" aria-hidden="true">✓</span>
                <div><span style={{ fontWeight: 600 }}>{w.title}.</span> <span className="muted">{w.text}</span></div>
              </div>
            ))}
          </div>
        </div>

        <aside className="signin-col">
          <div className="card pad signin">
            <CodeLogin as="client" intent="interest" embedded heading="Order a review video"
              sub="Enter your work email to see pricing and book your video. Pay online or request an invoice. Already working with us? Use the same box to sign in." />
          </div>
        </aside>
      </section>

      <section className="wrap-wide band">
        <h2 className="section-title">Recent reviews</h2>
        <VideoExamples />
      </section>

      <section className="wrap-wide band">
        <h2 className="section-title">How it works</h2>
        <ol className="process">
          {STEPS.map((st, i) => (
            <li key={st.title} className={st.who === 'You' ? 'you' : ''}>
              <span className="pnum">{i + 1}</span>
              <div>
                <div className="ptitle">{st.title} <span className="who">{st.who === 'You' ? 'You' : 'Hotel Tech Report'}</span></div>
                <div className="muted small">{st.text}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
