// Public landing page for sponsors: what they get, how it works, and sign-in / sign-up.
import { redirect } from 'next/navigation';
import CodeLogin from '@/components/CodeLogin.js';
import { getSession } from '@/lib/session.js';
import { STEPS, VideoExamples } from '@/components/VideoExamples.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'YouTube Content Studio · Hotel Tech Report' };


const READY = [
  { title: 'Sponsor dossier', text: 'Copy our Google Doc template, fill it in and paste the link.' },
  { title: 'Brand materials', text: 'Your logo, product screenshots and anything else you want us to use.' },
  { title: 'Product demo', text: 'An unedited screen-share of your software, ideally 20+ minutes with voice-over. Not a marketing video.' },
];

export default async function SponsorLanding() {
  if ((await getSession())?.r === 'client') redirect('/client-submission/youtube');
  return (
    <div className="landing">
      <header className="top wrap-wide" style={{ marginBottom: 0 }}>
        <span className="brand"><span className="mark"><span /></span>Hotel Tech Report</span>
        <a className="linkbtn" href="#start">Sign in</a>
      </header>

      <section className="hero2 wrap-wide" id="start">
        <div className="intro">
          <div className="eyebrow">YouTube Content Studio</div>
          <h1 className="hero-title">Let&apos;s make your Hotel Tech Report review video</h1>
          <p className="hero-sub">
            You&apos;re here because your company is being featured in a product review video on the
            Hotel Tech Report YouTube channel. This portal is where you send us what we need to make it.
          </p>
        </div>
        <div className="steps-col">
          <div className="steps-label">How it works</div>
          <ol className="process compact">
            {STEPS.map((s, i) => (
              <li key={s.title} className={s.who === 'You' ? 'you' : ''}>
                <span className="pnum">{i + 1}</span>
                <div>
                  <div className="ptitle">{s.title} <span className="who">{s.who === 'You' ? 'You' : 'Hotel Tech Report'}</span></div>
                  <div className="muted small">{s.text}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <aside className="signin-col">
          <div className="card pad signin">
            <div className="eyebrow" style={{ marginBottom: 6 }}>Start with step 1</div>
            <CodeLogin as="client" embedded heading="Sign in to your portal" sub="New here? Enter your work email and we'll set up your account." />
            <div className="ready-list">
              <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Your pre-production checklist:</div>
              {READY.map((r) => (
                <div key={r.title} className="ready-item">
                  <span className="tick-sm" aria-hidden="true">✓</span>
                  <div><span style={{ fontWeight: 500 }}>{r.title}.</span> <span className="muted">{r.text}</span></div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="wrap-wide band">
        <h2 className="section-title">What the finished video looks like</h2>
        <p className="muted" style={{ margin: '-10px 0 18px' }}>Recent reviews from the Hotel Tech Report channel. Yours will follow the same format.</p>
        <VideoExamples />
      </section>
    </div>
  );
}
