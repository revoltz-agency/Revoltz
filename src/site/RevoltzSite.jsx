import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2, ChevronDown, Clock3, Cpu, Globe2, Mail, Menu, Radar, ShieldCheck, Sparkles, Target, Workflow, Wrench, X, Zap } from 'lucide-react';
import { goToSection, navigate, withBase } from '../lib/router.js';
import { CONTACT_EMAIL, CONTACT_SUBJECT } from './siteConfig.js';

const NAV_LINKS = [
  { id: 'services', label: 'Services' },
  { id: 'process', label: 'Process' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'contact', label: 'Contact' },
];

const SERVICES = [
  { icon: Workflow, title: 'Workflow Automation', copy: 'Identify repetitive admin, follow-ups and reporting that may be easier to manage with a simple workflow.', outcome: 'Less repetitive admin' },
  { icon: Globe2, title: 'Business Websites', copy: 'Present your services clearly with a fast, focused website that makes the next step easy to understand.', outcome: 'A clearer path to enquire' },
  { icon: Radar, title: 'Lead & Follow-up Systems', copy: 'Organize prospects and follow-ups so enquiries are easier to track and prioritize.', outcome: 'More organized follow-ups' },
  { icon: Cpu, title: 'Custom AI Systems', copy: 'Connect AI to the workflows you already use instead of forcing your business into a generic tool.', outcome: 'Less manual work' },
];

const PAINS = [
  ['Manual work', 'Your team spends hours copying data, replying to the same questions and updating spreadsheets.'],
  ['Leads go cold', 'Enquiries arrive while nobody is available, follow-ups get forgotten and good prospects disappear.'],
  ['Growth gets messy', 'More customers create more admin unless the systems behind the business scale with them.'],
];

const PROCESS = [
  ['01', 'Audit', 'We find the highest-value bottleneck and map the workflow before recommending software.'],
  ['02', 'Build', 'We design the smallest practical system around your existing tools, data and team.'],
  ['03', 'Launch', 'We put it into production, explain how it works and measure the outcome.'],
];

const TRUST_POINTS = [
  { icon: ShieldCheck, title: 'No fabricated results', copy: 'We show real client outcomes when we have them. No fake logos, testimonials or vanity numbers.' },
  { icon: Target, title: 'Outcome-first', copy: 'Every project starts with a business metric: hours saved, leads handled, response time or enquiries.' },
  { icon: Wrench, title: 'Practical by design', copy: 'If a simple workflow solves the problem, we do not sell you a complicated AI stack.' },
];

const FAQS = [
  ['What does an AI audit include?', 'We review where your team spends repetitive time, where leads leak and which workflows are easiest to improve. You leave with a prioritized automation opportunity, not a generic AI presentation.'],
  ['Do I need a large business or technical team?', 'No. REVOLTZ is designed around the business you already have. We can start with one workflow and expand only when the result justifies it.'],
  ['How much does a project cost?', 'Pricing depends on the workflow, integrations and scope. The first audit is free so we can define the work before discussing a project price.'],
  ['Do you replace our existing software?', 'Usually not. We prefer connecting and improving the tools you already rely on before introducing another platform.'],
];

const mailtoHref = (subject) => `mailto:${CONTACT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;

function Reveal({ children, className = '' }) {
  return <div className={`rv-reveal ${className}`}>{children}</div>;
}

function SiteNav() {
  const [open, setOpen] = useState(false);
  const go = (event, id) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    setOpen(false);
    goToSection(id);
  };
  return (
    <header className="rv-nav">
      <div className="rv-nav-inner">
        <a className="rv-brand" href={withBase('/')} onClick={(e) => { e.preventDefault(); navigate('/'); }}>
          <span className="rv-brand-mark"><Zap size={15} /></span><span className="rv-brand-text">REVOLTZ<span>AI</span></span>
        </a>
        <nav className="rv-nav-links" aria-label="Primary">
          {NAV_LINKS.map(({ id, label }) => <a key={id} href={`/#${id}`} onClick={(e) => go(e, id)}>{label}</a>)}
        </nav>
        <div className="rv-nav-actions">
          <a className="rv-btn rv-btn-primary rv-btn-sm" href="/#contact" onClick={(e) => go(e, 'contact')}>Get Free Audit <ArrowRight size={15} /></a>
          <button className="rv-nav-toggle" type="button" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </div>
      {open && <div className="rv-mobile-panel"><div className="rv-mobile-links">
        {NAV_LINKS.map(({ id, label }) => <a key={id} href={`/#${id}`} onClick={(e) => go(e, id)}>{label}<ArrowUpRight size={16} /></a>)}
        <a className="rv-btn rv-btn-primary" href="/#contact" onClick={(e) => go(e, 'contact')}>Claim Free AI Audit <ArrowRight size={16} /></a>
      </div></div>}
    </header>
  );
}

function Hero() {
  return (
    <section className="rv-hero" id="top">
      <div className="rv-hero-bg" aria-hidden="true"><span className="rv-hero-grid" /><span className="rv-glow rv-glow-a" /><span className="rv-glow rv-glow-b" /></div>
      <div className="rv-shell rv-hero-inner">
        <Reveal><div className="rv-trust-chip"><span /> AI automation for growing businesses</div></Reveal>
        <Reveal><h1>Make everyday business work <span>simpler.</span></h1></Reveal>
        <Reveal><p className="rv-hero-sub">We help businesses improve their websites, organize leads and explore practical automation—starting with the problem that matters most.</p></Reveal>
        <Reveal><div className="rv-hero-actions">
          <a className="rv-btn rv-btn-primary" href="/#contact" onClick={(e) => { e.preventDefault(); goToSection('contact'); }}>Claim Your Free AI Audit <ArrowRight size={17} /></a>
        </div></Reveal>
        <Reveal><div className="rv-risk-line"><CheckCircle2 size={15} /> Free first audit <i /> No commitment <i /> Practical recommendations only</div></Reveal>
        <Reveal><div className="rv-proof-strip">
          <div><strong>AI + automation</strong><span>Built around your workflows</span></div>
          <div><strong>Practical by design</strong><span>Start with one clear business problem</span></div>
          <div><strong>India &amp; remote</strong><span>Built for modern small teams</span></div>
        </div></Reveal>
      </div>
    </section>
  );
}

function PainSection() {
  return <section className="rv-section rv-pain"><div className="rv-shell">
    <Reveal className="rv-head"><span className="rv-eyebrow">The problem</span><h2 className="rv-h2">Your business is growing. Your manual work is growing faster.</h2><p className="rv-lead">AI should remove operational friction, not create another dashboard your team has to manage.</p></Reveal>
    <div className="rv-pain-grid">{PAINS.map(([title, copy]) => <Reveal className="rv-pain-card" key={title}><span className="rv-card-index">0{PAINS.findIndex((p) => p[0] === title) + 1}</span><h3>{title}</h3><p>{copy}</p></Reveal>)}</div>
  </div></section>;
}

function ServicesSection() {
  return <section className="rv-section" id="services"><div className="rv-shell">
    <Reveal className="rv-head"><span className="rv-eyebrow">What we build</span><h2 className="rv-h2">Useful solutions for real business needs.</h2><p className="rv-lead">You do not need more AI tools. You need fewer repetitive steps between your team and the result.</p></Reveal>
    <div className="rv-services-grid">{SERVICES.map(({ icon: Icon, title, copy, outcome }) => <Reveal className="rv-service" key={title}>
      <span className="rv-service-icon"><Icon size={19} /></span><h3>{title}</h3><p>{copy}</p><span className="rv-service-outcome"><CheckCircle2 size={14} /> {outcome}</span>
    </Reveal>)}</div>
  </div></section>;
}

function ProcessSection() {
  return <section className="rv-section" id="process"><div className="rv-shell">
    <Reveal className="rv-head"><span className="rv-eyebrow">How it works</span><h2 className="rv-h2">From bottleneck to working system.</h2><p className="rv-lead">Start small. Prove the value. Then scale what works.</p></Reveal>
    <div className="rv-process">{PROCESS.map(([num, title, copy]) => <Reveal className="rv-process-step" key={num}><span>{num}</span><h3>{title}</h3><p>{copy}</p></Reveal>)}</div>
  </div></section>;
}

function TrustSection() {
  return <section className="rv-section rv-trust"><div className="rv-shell">
    <Reveal className="rv-head"><span className="rv-eyebrow">Trust, without the theatre</span><h2 className="rv-h2">Clear about what we know — and what we do not.</h2><p className="rv-lead">REVOLTZ is early by design. We will never invent case studies or client results to make the website look bigger than the business.</p></Reveal>
    <div className="rv-trust-grid">{TRUST_POINTS.map(({ icon: Icon, title, copy }) => <Reveal className="rv-trust-card" key={title}><Icon size={19} /><h3>{title}</h3><p>{copy}</p></Reveal>)}</div>
  </div></section>;
}

function ReviewsSection() {
  return <section className="rv-section rv-reviews" id="reviews"><div className="rv-shell">
    <Reveal className="rv-head"><span className="rv-eyebrow">Reviews &amp; feedback</span><h2 className="rv-h2">Trust is earned, not manufactured.</h2><p className="rv-lead">We’re building REVOLTZ through real conversations and real work. As clients share feedback and approve it for publication, their words will appear here.</p></Reveal>
    <Reveal className="rv-review-empty">
      <div className="rv-review-mark" aria-hidden="true">“</div>
      <div><span className="rv-review-label"><span className="rv-review-dot" /> REAL FEEDBACK ONLY</span><h3>Have we worked together?</h3><p>Your honest feedback helps us improve and helps future clients make an informed decision. We’ll only publish a review with your permission.</p><a className="rv-btn rv-btn-primary" href={mailtoHref('REVOLTZ feedback')} >Share your feedback <ArrowRight size={16} /></a></div>
    </Reveal>
  </div></section>;
}

function FAQSection() {
  const [open, setOpen] = useState(0);
  return <section className="rv-section" id="faq"><div className="rv-shell rv-faq-layout">
    <Reveal><span className="rv-eyebrow">Before you book</span><h2 className="rv-h2">Questions, answered.</h2><p className="rv-lead">No pressure, no jargon. Just enough context to decide whether a conversation is useful.</p></Reveal>
    <div className="rv-faq-list">{FAQS.map(([q, a], index) => <Reveal className="rv-faq" key={q}>
      <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? -1 : index)}><span>{q}</span><ChevronDown size={17} /></button>
      {open === index && <p>{a}</p>}
    </Reveal>)}</div>
  </div></section>;
}

function IntakeForm() {
  const [form, setForm] = useState({ name: '', business: '', email: '', goal: '' });
  const submit = (event) => {
    event.preventDefault();
    const body = [
      'Free AI Audit Request',
      '',
      `Name: ${form.name}`,
      `Business: ${form.business}`,
      `Email: ${form.email}`,
      '',
      'What I want to improve:',
      form.goal,
    ].join('\n');
    window.location.href = `${mailtoHref('Free AI Audit Request')}&body=${encodeURIComponent(body)}`;
  };
  return <form className="rv-intake" onSubmit={submit}>
    <div className="rv-form-grid">
      <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></label>
      <label>Business<input required value={form.business} onChange={(e) => setForm({ ...form, business: e.target.value })} placeholder="Company / business name" /></label>
    </div>
    <label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" /></label>
    <label>What would you like to improve?<textarea required rows="4" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="e.g. automate lead follow-ups, improve our website, reduce admin..." /></label>
    <button className="rv-btn rv-btn-primary rv-submit" type="submit">Claim My Free AI Audit <ArrowRight size={17} /></button>
    <p className="rv-form-note"><ShieldCheck size={14} /> No spam. No obligation. We will reply with the next practical step.</p>
  </form>;
}

function FinalCta() {
  return <section className="rv-section rv-cta" id="contact"><div className="rv-cta-bg" aria-hidden="true"><span /><b /></div><div className="rv-shell rv-cta-grid">
    <Reveal><span className="rv-eyebrow">Start with one workflow</span><h2>Find one practical way to improve your business.</h2><p>Tell us what you would like to improve. We will review your request and suggest a practical next step—at no cost for the initial audit.</p></Reveal>
    <Reveal className="rv-booking-wrap"><IntakeForm /><div className="rv-booking-side"><div><Clock3 size={18} /><strong>Simple first step</strong><span>10–15 minutes to understand the problem.</span></div><div><Sparkles size={18} /><strong>Useful even if we do not work together</strong><span>You leave with a clearer automation opportunity.</span></div><div><Mail size={18} /><strong>Prefer email?</strong><a href={mailtoHref()}>{CONTACT_EMAIL}</a></div></div></Reveal>
  </div></section>;
}

function SiteFooter() {
  return <footer className="rv-footer"><div className="rv-footer-inner">
    <div><span className="rv-brand"><span className="rv-brand-mark"><Zap size={15} /></span><span className="rv-brand-text">REVOLTZ<span>AI</span></span></span><p>Practical digital solutions, useful AI tools and workflow improvements for growing businesses.</p></div>
    <div><h4>Explore</h4><a href="/#services" onClick={(e) => { e.preventDefault(); goToSection('services'); }}>Services</a><a href="/#process" onClick={(e) => { e.preventDefault(); goToSection('process'); }}>Process</a></div>
    <div><h4>Contact</h4><a href="/#contact" onClick={(e) => { e.preventDefault(); goToSection('contact'); }}>Free AI Audit</a><a href={mailtoHref()}>{CONTACT_EMAIL}</a></div>
  </div><div className="rv-footer-bottom"><span>© {new Date().getFullYear()} REVOLTZ AI. Built with clarity over hype.</span><span>No fabricated client results.</span></div></footer>;
}

export default function RevoltzSite() {
  useEffect(() => {
    const nodes = document.querySelectorAll('.rv-root .rv-reveal');
    if (!('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
  return <div className="rv-root"><a className="rv-skip" href="#main">Skip to content</a><SiteNav /><main id="main"><Hero /><PainSection /><ServicesSection /><ProcessSection /><TrustSection /><ReviewsSection /><FAQSection /><FinalCta /></main><SiteFooter /></div>;
}
