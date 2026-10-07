import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Check, CheckCircle2, Cpu, Globe2, Mail, Menu, Radar, Search,
  Sparkles, Target, Workflow, Wrench, X, Zap,
} from 'lucide-react';
import { goToSection, navigate } from '../lib/router.js';
import { CONTACT_EMAIL, CONTACT_SUBJECT } from './siteConfig.js';
import ProductPreview from './ProductPreview.jsx';

const NAV_LINKS = [
  { id: 'services', label: 'Services' },
  { id: 'agencyos', label: 'AgencyOS' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'contact', label: 'Contact' },
];

const CAPABILITIES = ['AI Automation', 'Internal Tools', 'Lead Generation', 'Business Websites', 'Workflow Automation'];

const PRODUCT_FACTS = [
  { icon: Search, title: 'Find prospects', copy: 'Search local businesses by industry and location, with OpenStreetMap or Google Places.' },
  { icon: Target, title: 'Qualify opportunities', copy: 'Explainable scores built from observable listing and website signals — never guesswork.' },
  { icon: Sparkles, title: 'Enrich business information', copy: 'Pull publicly listed contact, address and profile details, with the evidence attached.' },
  { icon: Workflow, title: 'Manage your pipeline', copy: 'Statuses, notes, tags and suggested follow-ups in one calm workspace.' },
];

const SERVICES = [
  {
    icon: Cpu,
    title: 'AI Automation',
    copy: 'Automate the repetitive work that quietly eats your week — intake, routing, follow-ups, reporting and handoffs.',
    outcome: 'Fewer manual hours',
  },
  {
    icon: Globe2,
    title: 'Business Websites',
    copy: 'Fast, focused sites that load quickly, make the offer obvious and turn visitors into booked work.',
    outcome: 'More qualified enquiries',
  },
  {
    icon: Radar,
    title: 'Lead Generation',
    copy: 'Find the right businesses, qualify them against real signals and keep the pipeline moving.',
    outcome: 'A pipeline you can forecast',
  },
  {
    icon: Wrench,
    title: 'Custom AI Tools',
    copy: 'Internal tools and AI assistants designed around how your team actually works — not a generic template.',
    outcome: 'Tools your team adopts',
  },
];

const STEPS = [
  { number: '01', title: 'Find the bottleneck', copy: 'We map where time, money and momentum leak out of the business, then pick the smallest change with the biggest return.' },
  { number: '02', title: 'Build the system', copy: 'We design and build the automation, tool or workflow around the stack you already run — in weeks, not quarters.' },
  { number: '03', title: 'Automate the workflow', copy: 'We wire it into your operations, measure the result and keep refining until it runs without supervision.' },
];

const WHY_ITEMS = [
  { title: 'Built around your business', copy: 'Every system starts from your workflows, not a preset package.' },
  { title: 'Automation without unnecessary complexity', copy: 'If a simpler solution works, we ship the simpler solution.' },
  { title: 'Tools that actually get used', copy: 'Adoption is the design goal, not an afterthought.' },
  { title: 'Focused on measurable outcomes', copy: 'Hours saved, leads handled, revenue moved — agreed up front.' },
];

/* ---------------------------------------------------------------- helpers */

const mailtoHref = (subject) => `mailto:${CONTACT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;

function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return undefined;
    }
    if (typeof IntersectionObserver !== 'function') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={`rv-reveal ${visible ? 'is-visible' : ''} ${className}`.trim()} style={{ '--rv-delay': `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

const sectionLink = (event, id, onDone) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  if (onDone) onDone();
  goToSection(id);
};

/* ------------------------------------------------------------------- nav */

function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={`rv-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="rv-nav-inner">
        <a className="rv-brand" href="/" aria-label="REVOLTZ AI — home" onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          navigate('/');
        }}>
          <span className="rv-brand-mark" aria-hidden="true"><Zap size={16} strokeWidth={2.2} /></span>
          <span className="rv-brand-text">REVOLTZ<span>AI</span></span>
        </a>

        <nav className="rv-nav-links" aria-label="Primary">
          {NAV_LINKS.map(({ id, label }) => (
            <a className="rv-nav-link" key={id} href={`/#${id}`} onClick={(event) => sectionLink(event, id)}>{label}</a>
          ))}
        </nav>

        <div className="rv-nav-actions">
          <a className="rv-btn rv-btn-primary rv-btn-sm" href="/#contact" onClick={(event) => sectionLink(event, 'contact')}>
            Build With Us
          </a>
          <button
            type="button"
            className="rv-nav-toggle"
            aria-expanded={open}
            aria-controls="rv-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="rv-mobile-panel" id="rv-mobile-nav">
          <div className="rv-mobile-links">
            {NAV_LINKS.map(({ id, label }) => (
              <a
                className="rv-mobile-link"
                key={id}
                href={`/#${id}`}
                onClick={(event) => sectionLink(event, id, () => setOpen(false))}
              >
                {label}<ArrowUpRight size={16} />
              </a>
            ))}
            <div className="rv-mobile-cta">
              <a className="rv-btn rv-btn-primary" href="/#contact" onClick={(event) => sectionLink(event, 'contact', () => setOpen(false))}>
                Build With Us <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

function HeroBackdrop() {
  return (
    <div className="rv-hero-bg" aria-hidden="true">
      <span className="rv-hero-grid" />
      <span className="rv-hero-glow rv-glow-a" />
      <span className="rv-hero-glow rv-glow-b" />
      <span className="rv-hero-glow rv-glow-c" />
      <span className="rv-hero-fade" />
    </div>
  );
}

function SystemRail() {
  const nodes = [8, 336, 664, 992];
  const labels = ['Inputs', 'AI layer', 'Workflows', 'Outcomes'];
  return (
    <div className="rv-rail" aria-hidden="true">
      <svg viewBox="0 0 1000 40" role="presentation" focusable="false">
        <line className="rv-rail-line" x1="8" y1="20" x2="992" y2="20" />
        <line className="rv-rail-flow" x1="8" y1="20" x2="992" y2="20" />
        {nodes.map((x) => (
          <g key={x}>
            <circle className="rv-rail-node" cx={x} cy="20" r="5.5" />
            <circle className="rv-rail-node-core" cx={x} cy="20" r="2" />
          </g>
        ))}
      </svg>
      <div className="rv-rail-labels">
        {labels.map((label) => <span key={label}>{label}</span>)}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="rv-hero" id="top">
      <HeroBackdrop />
      <div className="rv-shell rv-hero-inner">
        <Reveal>
          <span className="rv-hero-badge"><i />AI automation agency</span>
        </Reveal>
        <Reveal delay={80}>
          <h1>
            AI systems that turn businesses into{' '}
            <span className="rv-accent-word">machines</span><span className="rv-dot">.</span>
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="rv-hero-sub">
            We build practical AI automation, internal tools and growth systems that save businesses time and create measurable results.
          </p>
        </Reveal>
        <Reveal delay={230}>
          <div className="rv-hero-actions">
            <a className="rv-btn rv-btn-primary" href="/#contact" onClick={(event) => sectionLink(event, 'contact')}>
              Build With Us <ArrowRight size={17} />
            </a>
            <button type="button" className="rv-btn rv-btn-ghost" onClick={() => navigate('/agencyos')}>
              Explore AgencyOS <ArrowRight size={17} />
            </button>
          </div>
        </Reveal>
        <Reveal delay={320}>
          <SystemRail />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- sections */

function CapabilityStrip() {
  return (
    <section className="rv-strip" aria-label="What we build">
      <div className="rv-strip-inner">
        {CAPABILITIES.map((item) => <span className="rv-strip-item" key={item}>{item}</span>)}
      </div>
    </section>
  );
}

function AgencyOsSection() {
  return (
    <section className="rv-section rv-product" id="agencyos">
      <div className="rv-shell">
        <div className="rv-product-head">
          <Reveal className="rv-head">
            <span className="rv-eyebrow">AgencyOS · our product</span>
            <h2 className="rv-h2">Meet AgencyOS.</h2>
            <p className="rv-lead">
              Find prospects, qualify opportunities, enrich business information and manage your sales pipeline from one workspace.
            </p>
            <div className="rv-product-actions">
              <button type="button" className="rv-btn rv-btn-primary" onClick={() => navigate('/agencyos')}>
                Explore AgencyOS <ArrowRight size={17} />
              </button>
            </div>
          </Reveal>
          <Reveal delay={110}>
            <div className="rv-product-facts">
              {PRODUCT_FACTS.map(({ icon: Icon, title, copy }) => (
                <div className="rv-product-fact" key={title}>
                  <Icon size={16} strokeWidth={1.9} />
                  <div><strong>{title}</strong><span>{copy}</span></div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={60}>
          <ProductPreview />
        </Reveal>
      </div>
    </section>
  );
}

function ServicesSection() {
  return (
    <section className="rv-section" id="services">
      <div className="rv-shell">
        <Reveal className="rv-head">
          <span className="rv-eyebrow">Services</span>
          <h2 className="rv-h2">Systems, not slide decks.</h2>
          <p className="rv-lead">
            Four ways we remove the manual work between your team and the result you want.
          </p>
        </Reveal>
        <Reveal delay={80}>
          <div className="rv-services">
            <div className="rv-services-grid">
              {SERVICES.map(({ icon: Icon, title, copy, outcome }) => (
                <article className="rv-service" key={title}>
                  <span className="rv-service-icon"><Icon size={19} strokeWidth={1.8} /></span>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  <span className="rv-service-outcome">{outcome}</span>
                </article>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section className="rv-section" id="how-it-works">
      <div className="rv-shell">
        <Reveal className="rv-head">
          <span className="rv-eyebrow">How it works</span>
          <h2 className="rv-h2">Three steps, start to finish.</h2>
        </Reveal>
        <div className="rv-steps">
          {STEPS.map((step, index) => (
            <Reveal className="rv-step" key={step.number} delay={index * 90}>
              <div className="rv-step-num">{step.number}</div>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhySection() {
  return (
    <section className="rv-section" id="why">
      <div className="rv-shell rv-why">
        <div className="rv-why-col">
          <Reveal className="rv-head">
            <span className="rv-eyebrow">Why REVOLTZ</span>
            <h2 className="rv-h2">Built to be used, not demoed.</h2>
            <p className="rv-lead">
              We are a small team of builders. You work directly with the people writing the code and wiring the automation.
            </p>
          </Reveal>
          <Reveal delay={110}>
            <div className="rv-why-aside">
              <span className="rv-eyebrow">What we don’t do</span>
              <p>
                No bloated software rollouts. No automation for automation’s sake. No results you cannot measure —
                every system we ship has a number attached to it.
              </p>
              <div className="rv-why-stats">
                <div className="rv-why-stat"><strong>Weeks</strong><span>From first conversation to a system in production.</span></div>
                <div className="rv-why-stat"><strong>One</strong><span>Workspace for prospecting, pipeline and follow-ups.</span></div>
                <div className="rv-why-stat"><strong>Zero</strong><span>Black boxes. Every score shows its evidence.</span></div>
              </div>
            </div>
          </Reveal>
        </div>
        <Reveal delay={60}>
          <ul className="rv-why-list">
            {WHY_ITEMS.map(({ title, copy }) => (
              <li className="rv-why-item" key={title}>
                <CheckCircle2 size={18} strokeWidth={1.9} />
                <div><strong>{title}</strong><span>{copy}</span></div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="rv-section rv-cta" id="contact">
      <div className="rv-cta-bg" aria-hidden="true">
        <span className="rv-cta-grid" />
        <span className="rv-cta-glow" />
      </div>
      <div className="rv-shell rv-cta-inner">
        <Reveal>
          <span className="rv-eyebrow">Start here</span>
          <h2>Your business doesn’t need more software. It needs better systems.</h2>
          <p>Tell us where the work piles up. We’ll show you what to automate first.</p>
        </Reveal>
        <Reveal delay={90}>
          <div className="rv-cta-actions">
            <a className="rv-btn rv-btn-primary" href={mailtoHref(CONTACT_SUBJECT)}>
              Build With Us <ArrowRight size={17} />
            </a>
          </div>
          <div className="rv-cta-contact">
            <Mail size={15} />
            <span>Prefer email?</span>
            <a href={mailtoHref()}>{CONTACT_EMAIL}</a>
            <span aria-hidden="true">·</span>
            <span>We reply within one business day.</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="rv-footer">
      <div className="rv-footer-inner">
        <div className="rv-footer-brand">
          <span className="rv-brand">
            <span className="rv-brand-mark" aria-hidden="true"><Zap size={16} strokeWidth={2.2} /></span>
            <span className="rv-brand-text">REVOLTZ<span>AI</span></span>
          </span>
          <p>
            AI systems that turn businesses into machines. We build practical automation, internal tools and growth systems
            for teams that would rather ship than schedule.
          </p>
        </div>

        <div className="rv-footer-col">
          <h4>Navigate</h4>
          <ul>
            {NAV_LINKS.map(({ id, label }) => (
              <li key={id}>
                <a href={`/#${id}`} onClick={(event) => sectionLink(event, id)}>{label}</a>
              </li>
            ))}
          </ul>
        </div>

        <div className="rv-footer-col">
          <h4>Product</h4>
          <ul>
            <li><button type="button" onClick={() => navigate('/agencyos')}>Explore AgencyOS</button></li>
            <li><button type="button" onClick={() => navigate('/agencyos')}>Prospecting</button></li>
            <li><button type="button" onClick={() => navigate('/agencyos')}>CRM &amp; follow-ups</button></li>
            <li><button type="button" onClick={() => navigate('/agencyos')}>Enrichment</button></li>
          </ul>
        </div>

        <div className="rv-footer-col">
          <h4>Contact</h4>
          <ul>
            <li><a href={mailtoHref()}>{CONTACT_EMAIL}</a></li>
            <li><a href="/#contact" onClick={(event) => sectionLink(event, 'contact')}>Build With Us</a></li>
            <li><button type="button" onClick={() => navigate('/agencyos')}>Launch AgencyOS</button></li>
          </ul>
        </div>
      </div>

      <div className="rv-footer-bottom">
        <span>© {new Date().getFullYear()} REVOLTZ AI. All rights reserved.</span>
        <nav aria-label="Footer">
          <button type="button" onClick={() => navigate('/agencyos')}>Explore AgencyOS</button>
          <a href="/#top" onClick={(event) => sectionLink(event, 'top')}>Back to top</a>
        </nav>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ page */

export default function RevoltzSite() {
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }, 70);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="rv-root">
      <a className="rv-skip" href="#main">Skip to content</a>
      <SiteNav />
      <main id="main">
        <Hero />
        <CapabilityStrip />
        <AgencyOsSection />
        <ServicesSection />
        <HowItWorksSection />
        <WhySection />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  );
}
