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

      <section className="hero wrap-wide" id="start">
        <div>
          <div className="eyebrow">YouTube Content Studio</div>
          <h1 className="hero-title">Your product review video, made by Hotel Tech Report</h1>
          <p className="hero-sub">
            We script, film and edit an independent review of your software and publish it on the
            Hotel Tech Report YouTube channel, where hoteliers go to research what to buy.
            It starts with a few materials from you.
          </p>
        </div>
        <div className="card pad signin">
          <CodeLogin as="client" embedded heading="Get started" sub="Sign in or create your account with your work email." />
        </div>
      </section>

      <section className="wrap-wide band">
        <h2 className="section-title">What the finished video looks like</h2>
        <div className="examples">
          {EXAMPLES.map((v) => (
            <a key={v.id} className="example" href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">
              <span className="example-thumb">
                <img src={`https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" />
                <span className="play" aria-hidden="true">▶</span>
                <span className="length">{v.length}</span>
              </span>
              <span className="example-title">{v.title}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="wrap-wide band">
        <h2 className="section-title">How it works</h2>
        <p className="muted" style={{ margin: '-10px 0 18px' }}>Seven steps from your materials to a published video. The highlighted steps are yours.</p>
        <ol className="process">
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
      </section>

      <section className="wrap-wide band">
        <h2 className="section-title">What to have ready for step 1</h2>
        <div className="ready">
          {READY.map((r) => (
            <div key={r.title} className="card pad">
              <div className="ptitle">{r.title}</div>
              <div className="muted small">{r.text}</div>
            </div>
          ))}
        </div>
        <p style={{ marginTop: 22 }}><a className="btn primary" href="#start">Get started</a></p>
      </section>
    </div>
  );
}
