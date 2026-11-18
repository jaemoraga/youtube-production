// Shared by the public home page, the sponsor sign-in page and the empty sponsor portal.
// Recent product review videos on the HTR channel. Swap these to change the examples.
export const EXAMPLES = [
  { id: 'yVmCSArgZ5Q', title: 'Cloudbeds Review: Can One Software Run Your Entire Hotel?', length: '11:19' },
  { id: 'hjE4PaHkbnM', title: 'Event Temple Review: Is It the Best Hotel Sales Software?', length: '8:42' },
  { id: 'VKmyjas_zGs', title: 'Dailypoint: Is this the Best Hotel CRM & Guest Data Platform?', length: '8:36' },
];

export const STEPS = [
  { who: 'You', title: 'Complete the pre-production checklist', text: 'Your sponsor dossier, brand assets and a raw product demo, all submitted here.' },
  { who: 'HTR', title: 'We write the script', text: 'Our team turns your dossier and demo into a script.' },
  { who: 'You', title: 'Review the script', text: 'Share your feedback. Once it is final, we lock the script for filming.' },
  { who: 'HTR', title: 'We film', text: 'We shoot the video in studio with a Hotel Tech Report host.' },
  { who: 'HTR', title: 'We edit', text: 'Studio footage, your product screens and your brand come together.' },
  { who: 'You', title: 'Review the edit', text: 'You get to give post-production feedback before anything goes live.' },
  { who: 'HTR', title: 'We go live', text: 'The video is published on the Hotel Tech Report YouTube channel.' },
];

export function VideoExamples() {
  return (
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
  );
}
