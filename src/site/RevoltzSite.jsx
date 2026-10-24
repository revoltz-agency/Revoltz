import React, { useEffect, useState } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import 'lenis/dist/lenis.css';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Cpu,
  FileText,
  Globe2,
  Mail,
  Menu,
  MessageSquareText,
  MoveRight,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { AUDIT_API_BASE_URL, CONTACT_EMAIL, CONTACT_SUBJECT } from './siteConfig.js';
import DemosSection from './SiteDemos.jsx';
import { Reveal } from './SitePrimitives.jsx';


const SITE_ROOT = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');
let siteLenis = null;

/**
 * Lightweight, progressive-enhancement planet scene for the public marketing site.
 * Canvas 2D keeps this dependency-free and avoids blocking the page on large GLTF assets.
 */
function PlanetBackdrop() {
  const canvasRef = React.useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastTime = 0;
    let elapsed = 0;
    let scrollProgress = 0;
    const stars = Array.from({ length: 170 }, (_, index) => ({
      x: ((index * 73.17) % 997) / 997,
      y: ((index * 137.31) % 991) / 991,
      radius: 0.35 + ((index * 17) % 13) / 10,
      phase: (index * 2.399) % (Math.PI * 2),
    }));
    const pings = Array.from({ length: 22 }, (_, index) => ({
      angle: (index * 2.399) % (Math.PI * 2),
      latitude: -0.76 + ((index * 37) % 151) / 100,
      phase: (index * 0.37) % 1,
    }));

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const updateScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollProgress = Math.min(1, Math.max(0, window.scrollY / max));
    };

    const draw = (time) => {
      if (!ctx) return;
      const dt = Math.min(0.05, lastTime ? (time - lastTime) / 1000 : 0.016);
      lastTime = time;
      if (!reducedMotion) elapsed += dt;
      ctx.clearRect(0, 0, width, height);

      // Sparse stars and soft, slowly breathing nebulae.
      const nebula = ctx.createRadialGradient(width * 0.55, height * 0.28, 0, width * 0.55, height * 0.28, Math.max(width, height) * 0.72);
      nebula.addColorStop(0, 'rgba(53, 77, 170, 0.11)');
      nebula.addColorStop(0.48, 'rgba(46, 47, 126, 0.045)');
      nebula.addColorStop(1, 'rgba(7, 10, 18, 0)');
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, width, height);
      stars.forEach((star) => {
        const twinkle = reducedMotion ? 0.72 : 0.42 + (Math.sin(elapsed * 0.8 + star.phase) + 1) * 0.28;
        ctx.beginPath();
        ctx.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(195, 211, 255,' + (twinkle * 0.58) + ')';
        ctx.fill();
      });

      // Scroll choreography: oversized low globe in the hero, drifting across the page as it recedes.
      const narrow = width < 720;
      const startX = width * (narrow ? 0.52 : 0.73);
      const endX = width * (narrow ? 0.5 : 0.52);
      const swing = Math.sin(scrollProgress * Math.PI * 2.15) * width * (narrow ? 0.06 : 0.18);
      const cx = startX + (endX - startX) * scrollProgress + swing;
      const startRadius = Math.min(width * (narrow ? 0.68 : 0.46), height * 0.58);
      const radius = startRadius * (1 - scrollProgress * 0.43);
      const cy = height * (narrow ? 0.91 : 0.83) - scrollProgress * height * 0.28;
      const rotation = elapsed * 0.035 + scrollProgress * Math.PI * 1.25;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);

      // Atmospheric halo.
      const halo = ctx.createRadialGradient(0, 0, radius * 0.72, 0, 0, radius * 1.42);
      halo.addColorStop(0, 'rgba(77, 112, 255, 0.17)');
      halo.addColorStop(0.58, 'rgba(75, 111, 255, 0.09)');
      halo.addColorStop(1, 'rgba(75, 111, 255, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.42, 0, Math.PI * 2);
      ctx.fill();

      // Fine orbital paths and a satellite marker add depth around the planet.
      ctx.save();
      ctx.rotate(-0.28 + Math.sin(elapsed * 0.12) * 0.035);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.28, radius * 0.34, -0.12, Math.PI * 0.08, Math.PI * 1.04);
      ctx.strokeStyle = 'rgba(140, 169, 255, 0.22)';
      ctx.lineWidth = Math.max(0.7, radius * 0.002);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.28, radius * 0.34, -0.12, Math.PI * 1.08, Math.PI * 1.92);
      ctx.strokeStyle = 'rgba(140, 169, 255, 0.09)';
      ctx.stroke();
      const orbitAngle = elapsed * 0.18 + 0.75;
      const satelliteX = Math.cos(orbitAngle) * radius * 1.28;
      const satelliteY = Math.sin(orbitAngle) * radius * 0.34;
      const satelliteGlow = ctx.createRadialGradient(satelliteX, satelliteY, 0, satelliteX, satelliteY, radius * 0.09);
      satelliteGlow.addColorStop(0, 'rgba(255, 220, 157, 0.8)');
      satelliteGlow.addColorStop(1, 'rgba(255, 220, 157, 0)');
      ctx.fillStyle = satelliteGlow;
      ctx.beginPath();
      ctx.arc(satelliteX, satelliteY, radius * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(satelliteX, satelliteY, Math.max(1.6, radius * 0.009), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 226, 176, 0.95)';
      ctx.fill();
      ctx.restore();

      // Sphere with a shaded terminator and subtle mint/blue rim.
      const sphere = ctx.createRadialGradient(-radius * 0.38, -radius * 0.42, radius * 0.05, radius * 0.08, radius * 0.12, radius * 1.16);
      sphere.addColorStop(0, 'rgba(57, 91, 173, 0.83)');
      sphere.addColorStop(0.48, 'rgba(22, 42, 91, 0.86)');
      sphere.addColorStop(0.78, 'rgba(8, 18, 43, 0.94)');
      sphere.addColorStop(1, 'rgba(4, 8, 22, 0.98)');
      ctx.fillStyle = sphere;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.995, 0, Math.PI * 2);
      ctx.clip();

      // Longitudes and latitudes give the globe depth without a heavy 3D runtime.
      ctx.lineWidth = Math.max(0.7, radius * 0.0025);
      ctx.strokeStyle = 'rgba(127, 163, 255, 0.17)';
      for (let i = -3; i <= 3; i += 1) {
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.abs(Math.cos(i * 0.34)) * radius, radius, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = -2; i <= 2; i += 1) {
        const lat = i * 0.31;
        const y = Math.sin(lat) * radius;
        const rx = Math.cos(lat) * radius;
        ctx.beginPath();
        ctx.ellipse(0, y, rx, Math.max(2, radius * 0.12 * Math.cos(lat)), 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Abstract land-like ribbons, intentionally illustrative rather than a geographic map.
      ctx.fillStyle = 'rgba(104, 158, 179, 0.19)';
      const landShapes = [
        [-0.36, -0.34, 0.23, 0.11], [-0.12, -0.22, 0.16, 0.22],
        [0.18, -0.36, 0.22, 0.13], [0.34, -0.05, 0.13, 0.23],
        [-0.42, 0.12, 0.18, 0.12], [-0.04, 0.28, 0.27, 0.1],
      ];
      landShapes.forEach(([x, y, rx, ry]) => {
        ctx.beginPath();
        ctx.ellipse(x * radius, y * radius, rx * radius, ry * radius, x * 2, 0, Math.PI * 2);
        ctx.fill();
      });

      // Golden radar pings pulse across the surface.
      pings.forEach((ping) => {
        const x = Math.cos(ping.angle + rotation * 0.22) * Math.cos(ping.latitude) * radius * 0.82;
        const y = Math.sin(ping.latitude) * radius * 0.78;
        const pulse = reducedMotion ? 0.5 : (elapsed * 0.32 + ping.phase) % 1;
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + pulse * radius * 0.06, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 210, 122,' + ((1 - pulse) * 0.5) + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.2, radius * 0.006), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 220, 157, 0.82)';
        ctx.fill();
      });
      ctx.restore();

      // Rim highlight.
      ctx.lineWidth = Math.max(1, radius * 0.009);
      ctx.strokeStyle = 'rgba(126, 177, 255, 0.36)';
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.99, -Math.PI * 0.82, Math.PI * 0.58);
      ctx.stroke();
      ctx.restore();

      if (!reducedMotion) raf = window.requestAnimationFrame(draw);
    };

    resize();
    updateScroll();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', updateScroll, { passive: true });
    if (reducedMotion) draw(0);
    else raf = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', updateScroll);
    };
  }, []);

  return <canvas ref={canvasRef} className="rv-planet-canvas" aria-hidden="true" />;
}


function scrollToSection(id) {
  if (typeof window === 'undefined' || !id) return;
  const target = document.getElementById(id);
  if (!target) return;

  window.history.replaceState({}, '', `#${id}`);
  if (siteLenis) {
    siteLenis.scrollTo(target, { offset: 0, immediate: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches });
    return;
  }
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.requestAnimationFrame(() => target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' }));
}

const NAV_LINKS = [
  { id: 'solutions', label: 'Solutions' },
  { id: 'demos', label: 'Demos' },
  { id: 'process', label: 'Our approach' },
  { id: 'reviews', label: 'Reviews' },
];

const SERVICES = [
  {
    number: '01',
    icon: Globe2,
    title: 'Websites & Digital Experiences',
    problem: 'People cannot take the next step if your website is hard to use or hard to understand.',
    answer: 'We design and build clear, responsive experiences that make your services and next steps easier to find.',
  },
  {
    number: '02',
    icon: Cpu,
    title: 'AI Tools & Business Solutions',
    problem: 'Generic tools often add another screen without fitting the way your team actually works.',
    answer: 'We explore practical AI for focused tasks, with clear limits and a person in control of important decisions.',
  },
  {
    number: '03',
    icon: Workflow,
    title: 'Workflow Automation',
    problem: 'Repeated copying, hand-offs and reminders can pull attention away from the work that needs it.',
    answer: 'We map the process first, then connect the steps that are safe and useful to automate.',
  },
  {
    number: '04',
    icon: MessageSquareText,
    title: 'Lead Generation & Follow-up Systems',
    problem: 'Enquiries are easy to lose when they arrive in different places and nobody can see what happens next.',
    answer: 'We help organize lead capture, ownership and follow-up so conversations are easier to keep track of.',
  },
];

const PROCESS = [
  {
    number: '01',
    title: 'Discover',
    icon: MessageSquareText,
    copy: 'Start with the people, tools and pinch points behind the problem.',
  },
  {
    number: '02',
    title: 'Plan',
    icon: FileText,
    copy: 'Agree on a focused scope, a useful first step and how we will review it.',
  },
  {
    number: '03',
    title: 'Build',
    icon: Wrench,
    copy: 'Create the experience or workflow around the way your business works.',
  },
  {
    number: '04',
    title: 'Improve',
    icon: RefreshCw,
    copy: 'Learn from real use, make thoughtful changes and keep what helps.',
  },
];

const FAQS = [
  [
    'What happens in the free AI business audit?',
    'We talk through your website, enquiries and repetitive work, then share practical areas worth exploring. It is an initial review, not a technical guarantee or a commitment to buy.',
  ],
  [
    'Is the AI auditor on this page a live AI tool?',
    'No. The auditor is an interactive demonstration that uses fixed sample suggestions in your browser. It does not connect to an AI service or assess a real business.',
  ],
  [
    'Will we need to replace the tools we already use?',
    'Not necessarily. We start by understanding your current setup and look for the simplest fit. If a new tool is not useful, we will say so.',
  ],
];

function mailtoHref(subject, body = '') {
  const query = new URLSearchParams();
  if (subject) query.set('subject', subject);
  if (body) query.set('body', body);
  const queryString = query.toString();
  return `mailto:${CONTACT_EMAIL}${queryString ? `?${queryString}` : ''}`;
}

function handleSectionClick(event, id, onNavigate) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  onNavigate?.();
  scrollToSection(id);
}

function SiteNav() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="rv-nav">
      <div className="rv-nav-inner">
        <a
          className="rv-brand"
          href={SITE_ROOT}
          aria-label="REVOLTZ AI home"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            close();
            scrollToSection('top');
          }}
        >
          <span className="rv-brand-mark" aria-hidden="true"><Zap size={16} fill="currentColor" /></span>
          <span className="rv-brand-lockup">
            <span className="rv-brand-text">REVOLTZ<span>AI</span></span>
            <span className="rv-brand-tagline">Build Smarter. Grow Faster.</span>
          </span>
        </a>

        <nav className="rv-nav-links" aria-label="Primary navigation">
          {NAV_LINKS.map(({ id, label }) => (
            <a key={id} href={`#${id}`} onClick={(event) => handleSectionClick(event, id)}>{label}</a>
          ))}
        </nav>

        <div className="rv-nav-actions">
          <a
            className="rv-button rv-button-primary rv-nav-cta"
            href="#contact"
            onClick={(event) => handleSectionClick(event, 'contact')}
          >
            Get a Free AI Audit <ArrowUpRight size={15} />
          </a>
          <button
            className="rv-nav-toggle"
            type="button"
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={open}
            aria-controls="rv-mobile-panel"
            onClick={() => setOpen((isOpen) => !isOpen)}
          >
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      <div className="rv-mobile-panel" id="rv-mobile-panel" hidden={!open}>
        <nav className="rv-mobile-links" aria-label="Mobile navigation">
          {NAV_LINKS.map(({ id, label }) => (
            <a key={id} href={`#${id}`} onClick={(event) => handleSectionClick(event, id, close)}>
              {label}<ArrowUpRight size={16} />
            </a>
          ))}
          <a className="rv-button rv-button-primary" href="#contact" onClick={(event) => handleSectionClick(event, 'contact', close)}>
            Get a Free AI Audit <ArrowRight size={16} />
          </a>
        </nav>
      </div>
    </header>
  );
}

function SystemMap() {
  const inputs = [
    { icon: Globe2, label: 'Website enquiry', note: 'A clear place to start' },
    { icon: Mail, label: 'Messages & email', note: 'Different doors in' },
    { icon: Users, label: 'Team hand-off', note: 'People stay in control' },
  ];
  const outputs = [
    { icon: CheckCircle2, label: 'One clear queue' },
    { icon: Sparkles, label: 'Useful AI, reviewed' },
    { icon: CalendarCheck, label: 'A follow-up path' },
  ];

  return (
    <div className="rv-system-visual" role="img" aria-label="Illustration: website enquiries, messages and team hand-offs connect through a thoughtful workflow to an organized queue, human-reviewed AI and a follow-up path.">
      <div className="rv-visual-topline" aria-hidden="true">
        <span><i /> SYSTEM MAP / EXAMPLE 01</span>
        <span className="rv-visual-caption">A clearer way through</span>
      </div>
      <div className="rv-flow-stage" aria-hidden="true">
        <svg className="rv-flow-lines" viewBox="0 0 600 400" preserveAspectRatio="none">
          <defs>
            <linearGradient id="rv-line-left" x1="0" x2="1">
              <stop offset="0" stopColor="#5d75a8" stopOpacity=".1" />
              <stop offset="1" stopColor="#7e8dff" stopOpacity=".85" />
            </linearGradient>
            <linearGradient id="rv-line-right" x1="0" x2="1">
              <stop offset="0" stopColor="#8c80ff" stopOpacity=".9" />
              <stop offset="1" stopColor="#53c8ef" stopOpacity=".16" />
            </linearGradient>
          </defs>
          <path className="rv-flow-path rv-flow-path-a" d="M155 74 C196 74 190 180 225 180" />
          <path className="rv-flow-path rv-flow-path-b" d="M155 200 C186 200 194 200 225 200" />
          <path className="rv-flow-path rv-flow-path-c" d="M155 326 C196 326 190 220 225 220" />
          <path className="rv-flow-path rv-flow-path-a" d="M376 180 C406 180 404 74 445 74" />
          <path className="rv-flow-path rv-flow-path-b" d="M376 200 C410 200 410 200 445 200" />
          <path className="rv-flow-path rv-flow-path-c" d="M376 220 C406 220 404 326 445 326" />
          <circle className="rv-flow-pulse rv-pulse-one" r="3" />
          <circle className="rv-flow-pulse rv-pulse-two" r="3" />
          <circle className="rv-flow-pulse rv-pulse-three" r="3" />
        </svg>

        <div className="rv-flow-column rv-flow-inputs">
          {inputs.map(({ icon: Icon, label, note }) => (
            <div className="rv-flow-node rv-flow-input" key={label}>
              <span className="rv-flow-icon"><Icon size={15} /></span>
              <span className="rv-flow-copy"><strong>{label}</strong><small>{note}</small></span>
            </div>
          ))}
        </div>

        <div className="rv-flow-hub">
          <span className="rv-hub-symbol"><Workflow size={22} /></span>
          <span className="rv-hub-overline">THE CONNECTIVE LAYER</span>
          <strong>Better systems<br />start with the flow.</strong>
          <span className="rv-hub-foot">Tools that fit your work</span>
        </div>

        <div className="rv-flow-column rv-flow-outputs">
          {outputs.map(({ icon: Icon, label }) => (
            <div className="rv-flow-node rv-flow-output" key={label}>
              <span className="rv-flow-icon"><Icon size={15} /></span>
              <span className="rv-flow-copy"><strong>{label}</strong><small>Built around your team</small></span>
            </div>
          ))}
        </div>
      </div>
      <div className="rv-visual-footline" aria-hidden="true">
        <span><span className="rv-signal-dot" /> WEB / AI / AUTOMATION</span>
        <span>Illustrative, not a live system</span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="rv-hero" id="top">
      <div className="rv-hero-atmosphere" aria-hidden="true"><span className="rv-hero-grid" /><span className="rv-hero-glow rv-hero-glow-blue" /><span className="rv-hero-glow rv-hero-glow-violet" /><span className="rv-cubes-grid"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></span></div>
      <div className="rv-shell rv-hero-layout">
        <div className="rv-hero-copy">
          <Reveal>
            <p className="rv-eyebrow rv-hero-eyebrow"><span className="rv-eyebrow-spark">✳</span> Build Smarter. Grow Faster.</p>
          </Reveal>
          <Reveal>
            <h1>Turn business bottlenecks into <span>your next advantage.</span></h1>
          </Reveal>
          <Reveal>
            <p className="rv-hero-sub">We build digital experiences, practical AI solutions, and smarter workflows that help businesses spend less time on repetitive work and more time growing.</p>
          </Reveal>
          <Reveal>
            <div className="rv-hero-actions">
              <a className="rv-button rv-button-primary" href="#contact" onClick={(event) => handleSectionClick(event, 'contact')}>
                Get a Free AI Audit <ArrowRight size={17} />
              </a>
              <a className="rv-button rv-button-secondary" href="#solutions" onClick={(event) => handleSectionClick(event, 'solutions')}>
                Explore Our Solutions <MoveRight size={17} />
              </a>
            </div>
          </Reveal>
          <Reveal>
            <div className="rv-hero-promise">
              <span><Check size={14} /> Free initial business audit</span>
              <span className="rv-promise-separator" aria-hidden="true" />
              <span>Clear advice, no commitment</span>
            </div>
          </Reveal>
        </div>

        <Reveal className="rv-hero-art-wrap"><SystemMap /></Reveal>

        <div className="rv-hero-footerline" aria-label="Services at a glance">
          <span>WEBSITE DESIGN</span><i /><span>PRACTICAL AI</span><i /><span>WORKFLOW DESIGN</span><i /><span>LEAD SYSTEMS</span>
        </div>
      </div>
    </section>
  );
}

function ServiceSystemVisual() {
  return (
    <aside className="rv-service-visual">
      <div className="rv-service-visual-top"><span>SYSTEM PRINCIPLES / 04</span><span><span className="rv-signal-dot" /> PURPOSE-BUILT</span></div>
      <div className="rv-service-visual-content">
        <span className="rv-service-visual-kicker">NOT MORE SOFTWARE.</span>
        <h3>A better fit<br />for the work.</h3>
        <p>Start with what your team already uses. Connect only what solves the problem.</p>
        <div className="rv-system-stack">
          <div className="rv-stack-row"><span className="rv-stack-icon"><Globe2 size={15} /></span><span><strong>Existing tools</strong><small>Keep what works</small></span><Check size={14} /></div>
          <div className="rv-stack-connector"><i /></div>
          <div className="rv-stack-row rv-stack-highlight"><span className="rv-stack-icon"><Sparkles size={15} /></span><span><strong>A focused improvement</strong><small>Website · workflow · AI</small></span><ArrowRight size={14} /></div>
          <div className="rv-stack-connector"><i /></div>
          <div className="rv-stack-row"><span className="rv-stack-icon"><Users size={15} /></span><span><strong>People in control</strong><small>Review the important parts</small></span><ShieldCheck size={14} /></div>
        </div>
      </div>
      <span className="rv-service-visual-note">The right amount of technology is the amount that helps.</span>
    </aside>
  );
}

function ServicesSection() {
  return (
    <section className="rv-section rv-services" id="solutions">
      <div className="rv-shell">
        <Reveal className="rv-section-heading rv-services-heading">
          <span className="rv-eyebrow">Where we can help</span>
          <h2 className="rv-h2">Solve the friction.<br /><span>Skip the theatre.</span></h2>
          <p className="rv-lead">Each engagement starts with a real business problem—not a preselected product or a pitch for AI you do not need.</p>
        </Reveal>
        <div className="rv-services-layout">
          <div className="rv-service-list">
            {SERVICES.map(({ number, icon: Icon, title, problem, answer }) => (
              <Reveal className="rv-service-row" key={title}>
                <span className="rv-service-number">{number}</span>
                <span className="rv-service-icon"><Icon size={19} /></span>
                <div className="rv-service-row-copy">
                  <h3>{title}</h3>
                  <p><strong>The problem</strong>{problem}</p>
                  <p><strong>Our approach</strong>{answer}</p>
                </div>
                <MoveRight className="rv-service-arrow" size={17} aria-hidden="true" />
              </Reveal>
            ))}
          </div>
          <Reveal className="rv-service-visual-wrap"><ServiceSystemVisual /></Reveal>
        </div>
        <p className="rv-audience-note"><span>BUILT AROUND REAL OPERATIONS</span> Clinics <i /> Restaurants <i /> Local businesses <i /> Startups <i /> Service providers</p>
      </div>
    </section>
  );
}

function ProcessSection() {
  return (
    <section className="rv-section rv-process-section" id="process">
      <div className="rv-shell">
        <Reveal className="rv-section-heading">
          <span className="rv-eyebrow">A clear path, together</span>
          <h2 className="rv-h2">Good work is a process,<br />not a big reveal.</h2>
          <p className="rv-lead">Small, visible steps keep the work grounded in what your business actually needs.</p>
        </Reveal>
        <div className="rv-process-track">
          <div className="rv-process-rule" aria-hidden="true" />
          {PROCESS.map(({ number, title, icon: Icon, copy }) => (
            <Reveal className="rv-process-step" key={title}>
              <span className="rv-process-node"><Icon size={17} /></span>
              <span className="rv-process-number">{number} / 04</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReviewsSection() {
  const commitments = [
    { number: '01', title: 'Clear communication', text: 'We explain what we recommend, what it costs and what is still uncertain.' },
    { number: '02', title: 'Practical scope', text: 'We look for the smallest useful solution before adding more tools or complexity.' },
    { number: '03', title: 'Honest work', text: 'No invented results, hidden automation or claims that a demo is a client outcome.' },
  ];

  return (
    <section className="rv-section rv-reviews" id="reviews">
      <div className="rv-shell">
        <Reveal className="rv-section-heading">
          <span className="rv-eyebrow">Reviews & credibility</span>
          <h2 className="rv-h2">Trust is earned.<br /><span>Not designed into a quote.</span></h2>
          <p className="rv-lead">REVOLTZ is at an early stage, so there are no client reviews published here yet. When a client approves their words for sharing, this is where their feedback will live.</p>
        </Reveal>
        <div className="rv-credibility-layout">
          <Reveal className="rv-review-placeholder">
            <div className="rv-review-placeholder-top"><span>CLIENT VOICES</span><span className="rv-review-empty-mark"><span /></span></div>
            <div className="rv-review-placeholder-main">
              <span className="rv-review-quotes" aria-hidden="true">“ ”</span>
              <h3>Room for real feedback.</h3>
              <p>No placeholder testimonials. No borrowed logos. Just an open space for genuine client experiences, shared with permission.</p>
              <a href={mailtoHref('REVOLTZ AI — feedback')}><Mail size={14} /> Share feedback privately <ArrowUpRight size={14} /></a>
            </div>
            <div className="rv-review-placeholder-foot"><span>ONLY WITH PERMISSION</span><span>REVOLTZ AI / 2026</span></div>
          </Reveal>
          <div className="rv-commitments">
            <Reveal><span className="rv-commitments-kicker">WHAT YOU CAN EXPECT FROM US</span></Reveal>
            {commitments.map(({ number, title, text }) => (
              <Reveal className="rv-commitment" key={number}>
                <span>{number}</span><div><h3>{title}</h3><p>{text}</p></div><CheckCircle2 size={16} />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  return (
    <section className="rv-section rv-faq-section" id="faq">
      <div className="rv-shell rv-faq-layout">
        <Reveal className="rv-faq-intro">
          <span className="rv-eyebrow">Before we start</span>
          <h2 className="rv-h2">Good questions<br />deserve straight answers.</h2>
          <p className="rv-lead">A little context before you decide if a conversation is worthwhile.</p>
        </Reveal>
        <div className="rv-faq-list">
          {FAQS.map(([question, answer], index) => (
            <Reveal className="rv-faq" key={question}>
              <details>
                <summary><span><i>0{index + 1}</i>{question}</span><ChevronDown size={17} /></summary>
                <p>{answer}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactForm() {
  const [form, setForm] = useState({ name: '', business: '', email: '', service: '', problem: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setResult(null);
  };

  const submitEnquiry = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      const response = await fetch(AUDIT_API_BASE_URL + '/api/audit/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          name: form.name.trim(),
          business: form.business.trim(),
          email: form.email.trim(),
          service: form.service || 'Not sure — start with an AI audit',
          message: form.problem.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.received !== true) {
        // Keep the visitor-facing message simple, but preserve the safe status
        // and server-provided reason for troubleshooting in the browser console.
        console.warn('[REVOLTZ audit form] Submission rejected:', response.status, data.error || 'No server error details.');
        if (response.status === 429) {
          throw new Error('We have received several requests from this connection. Please try again later or email us directly.');
        }
        throw new Error('The enquiry form is temporarily unavailable. Please email revoltz.agency@gmail.com instead.');
      }
      setResult({ kind: 'success', message: 'Thanks — your request has been received and added to our private review inbox. We will follow up by email.' });
      setForm({ name: '', business: '', email: '', service: '', problem: '' });
    } catch (error) {
      console.warn('[REVOLTZ audit form] Request failed before acceptance:', error?.name || 'Error', error?.message || 'No details.');
      const knownMessage = [
        'We have received several requests from this connection. Please try again later or email us directly.',
        'The enquiry form is temporarily unavailable. Please email revoltz.agency@gmail.com instead.',
      ].includes(error?.message);
      const message = error?.name === 'TimeoutError'
        ? 'The request took too long and may not have reached us. Please try once more, or email revoltz.agency@gmail.com.'
        : knownMessage
          ? error.message
          : 'We could not confirm your request was received. Please try again, or email revoltz.agency@gmail.com.';
      setResult({ kind: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="rv-contact-form" onSubmit={submitEnquiry}>
      <div className="rv-contact-form-heading"><span>FREE INITIAL AI BUSINESS AUDIT</span><span><i /> NO OBLIGATION</span></div>
      <div className="rv-form-grid">
        <label htmlFor="rv-name">Name<input id="rv-name" name="name" autoComplete="name" required maxLength={120} value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Your name" /></label>
        <label htmlFor="rv-business">Business name<input id="rv-business" name="organization" autoComplete="organization" required maxLength={160} value={form.business} onChange={(event) => update('business', event.target.value)} placeholder="Your business" /></label>
        <label htmlFor="rv-email">Email<input id="rv-email" name="email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="you@business.com" /></label>
        <label htmlFor="rv-service">Service of interest
          <select id="rv-service" name="service" value={form.service} onChange={(event) => update('service', event.target.value)}>
            <option value="">Select a starting point</option>
            <option>Website design & development</option>
            <option>Practical AI tools & business solutions</option>
            <option>Workflow automation</option>
            <option>Lead generation & follow-up systems</option>
            <option>Not sure — start with an AI audit</option>
          </select>
        </label>
        <label className="rv-message-field" htmlFor="rv-problem">What problem would you like to solve?
          <textarea id="rv-problem" name="problem" required rows="4" maxLength={3000} value={form.problem} onChange={(event) => update('problem', event.target.value)} placeholder="A little context helps us make the first conversation useful." />
        </label>
      </div>
      <div className="rv-contact-submit-row">
        <button className="rv-button rv-button-primary rv-contact-submit" type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Get a Free AI Audit'} <ArrowRight size={16} /></button>
        <span><ShieldCheck size={14} /> Your enquiry goes to our private AgencyOS review inbox.</span>
      </div>
      {result && (
        <div className={'rv-form-status rv-form-status-' + result.kind} role="status" aria-live="polite">
          <strong>{result.kind === 'success' ? 'Request received' : 'Not submitted yet'}</strong>
          <p>{result.message}</p>
          {result.kind === 'error' && <a href={mailtoHref(CONTACT_SUBJECT)}>Email us directly <ArrowUpRight size={14} /></a>}
        </div>
      )}
      <p className="rv-form-disclaimer">We use these details to review your enquiry and reply. No automated email or WhatsApp message is sent by this form.</p>
    </form>
  );
}

function ContactSection() {
  return (
    <section className="rv-section rv-contact" id="contact">
      <div className="rv-contact-atmosphere" aria-hidden="true"><span /><i /></div>
      <div className="rv-shell rv-contact-layout">
        <Reveal className="rv-contact-copy">
          <span className="rv-eyebrow">A useful first conversation</span>
          <h2 className="rv-h2">What is slowing<br />your business down?</h2>
          <p className="rv-lead">Tell us a little about it. We will look for a practical next step—starting with a free initial AI business audit.</p>
          <div className="rv-contact-points">
            <div><span><Clock3 size={16} /></span><p><strong>Start with the problem</strong><small>No technical brief needed. Just tell us what feels harder than it should.</small></p></div>
            <div><span><Sparkles size={16} /></span><p><strong>Useful, even if we do not work together</strong><small>Get an honest view of what may be worth improving first.</small></p></div>
          </div>
          <a className="rv-direct-email" href={mailtoHref(CONTACT_SUBJECT)}><Mail size={15} /><span>Prefer email?</span><strong>{CONTACT_EMAIL}</strong><ArrowUpRight size={14} /></a>
        </Reveal>
        <Reveal className="rv-contact-form-wrap"><ContactForm /></Reveal>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="rv-footer">
      <div className="rv-shell">
        <div className="rv-footer-main">
          <div className="rv-footer-brand">
            <a className="rv-brand" href={SITE_ROOT} aria-label="REVOLTZ AI home" onClick={(event) => handleSectionClick(event, 'top')}>
              <span className="rv-brand-mark" aria-hidden="true"><Zap size={15} fill="currentColor" /></span>
              <span className="rv-brand-lockup"><span className="rv-brand-text">REVOLTZ<span>AI</span></span><span className="rv-brand-tagline">Build Smarter. Grow Faster.</span></span>
            </a>
            <p>Websites, practical AI and workflows built around real business needs.</p>
          </div>
          <div className="rv-footer-links"><strong>Explore</strong><a href="#solutions" onClick={(event) => handleSectionClick(event, 'solutions')}>Solutions</a><a href="#demos" onClick={(event) => handleSectionClick(event, 'demos')}>Interactive demos</a><a href="#process" onClick={(event) => handleSectionClick(event, 'process')}>Our approach</a></div>
          <div className="rv-footer-links"><strong>Start here</strong><a href="#contact" onClick={(event) => handleSectionClick(event, 'contact')}>Get a Free AI Audit</a><a href={mailtoHref(CONTACT_SUBJECT)}>{CONTACT_EMAIL}</a><span>Remote · Built for growing businesses</span></div>
        </div>
        <div className="rv-footer-bottom"><span>© {new Date().getFullYear()} REVOLTZ AI</span><span>Clear thinking. Useful technology. Honest work.</span><a href="#top" onClick={(event) => handleSectionClick(event, 'top')}>Back to top ↑</a></div>
      </div>
    </footer>
  );
}

export default function RevoltzSite() {
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animationContext = gsap.context(() => {
      if (!reducedMotion) {
        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
        intro.fromTo('.rv-hero-art-wrap', { autoAlpha: 0, y: 24, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.05 }, 0.18);
        intro.fromTo('.rv-hero-footerline', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.65 }, 0.62);
      }
    });

    if (!reducedMotion) {
      siteLenis = new Lenis({
        autoRaf: true,
        anchors: true,
        smoothWheel: true,
        lerp: 0.09,
        wheelMultiplier: 0.9,
      });
    }

    if (window.location.hash) {
      const sectionId = window.location.hash.slice(1);
      window.requestAnimationFrame(() => {
        const target = document.getElementById(sectionId);
        if (target && siteLenis) siteLenis.scrollTo(target, { immediate: true });
        else target?.scrollIntoView({ block: 'start' });
      });
    }

    return () => {
      animationContext.revert();
      siteLenis?.destroy();
      siteLenis = null;
    };
  }, []);

  return (
    <div className="rv-root">
      <a className="rv-skip" href="#main">Skip to content</a>
      <SiteNav />
      <main id="main">
        <Hero />
        <DemosSection />
        <ServicesSection />
        <ProcessSection />
        <ReviewsSection />
        <FAQSection />
        <ContactSection />
      </main>
      <SiteFooter />
    </div>
  );
}
