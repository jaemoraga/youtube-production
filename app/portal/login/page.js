// Public landing page for sponsors: what they get, how it works, and sign-in / sign-up.
import { redirect } from 'next/navigation';
import CodeLogin from '@/components/CodeLogin.js';
import { getSession } from '@/lib/session.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'YouTube Content Studio · Hotel Tech Report' };

// Recent product review videos on the HTR channel. Swap these to change the examples.
const EXAMPLES = [
  { id: 'yVmCSArgZ5Q', title: 'Cloudbeds Review: Can One Software Run Your Entire Hotel?', length: '11:19' },
  { id: 'hjE4PaHkbnM', title: 'Event Temple Review: Is It the Best Hotel Sales Software?', length: '8:42' },
  { id: 'VKmyjas_zGs', title: 'Dailypoint: Is this the Best Hotel CRM & Guest Data Platform?', length: '8:36' },
];

const STEPS = [
  { who: 'You', title: 'Send your materials', text: 'Your sponsor dossier, brand assets and a raw product demo, all submitted here.' },
  { who: 'HTR', title: 'We write the script', text: 'Our team turns your dossier and demo into a script.' },
  { who: 'You', title: 'Review the script', text: 'Share your feedback. Once it is final, we lock the script for filming.' },
  { who: 'HTR', title: 'We film', text: 'We shoot the video in studio with a Hotel Tech Report host.' },
  { who: 'HTR', title: 'We edit', text: 'Studio footage, your product screens and your brand come together.' },
  { who: 'You', title: 'Review the edit', text: 'You get to give post-production feedback before anything goes live.' },
  { who: 'HTR', title: 'We go live', text: 'The video is published on the Hotel Tech Report YouTube channel.' },
];

const READY = [
  { title: 'Sponsor dossier', text: 'Copy our Google Doc template, fill it in and paste the link.' },
  { title: 'Brand materials', text: 'Your logo, product screenshots and anything else you want us to use.' },
  { title: 'Product demo', text: 'An unedited screen-share of your software, ideally 20+ minutes with voice-over. Not a marketing video.' },
];

export default async function SponsorLanding() {
  if ((await getSession())?.r === 'client') redirect('/portal');
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
              <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Inside, you&apos;ll send us:</div>
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
        <div className="examples">
          {EXAMPLES.map((v) => (
            <a key={v.id} className="example" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">
              <span className="example-thumb">
                <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" />
                <span className="length">{v.length}</span>
              </span>
              <span className="example-title">{v.title}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
