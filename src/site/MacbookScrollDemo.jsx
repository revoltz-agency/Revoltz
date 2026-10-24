import { useEffect, useRef, useState } from 'react';
import './macbook-scroll-demo.css';
import { ArrowUpRight, BarChart3, CheckCircle2, CircleHelp, Clock3, Command, LayoutDashboard, Search, Sparkles, Workflow } from 'lucide-react';

/**
 * Aceternity-inspired MacBook scroll reveal, adapted to REVOLTZ's existing
 * React + Vite + plain CSS stack. No Tailwind, TypeScript, or Motion runtime
 * required. The dashboard shown is illustrative, not a live product screen.
 */
export default function MacbookScrollDemo() {
  const sectionRef = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setProgress(1);
      return;
    }

    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = section.getBoundingClientRect();
        // Map the section's entry through the viewport to a gradual reveal.
        // Avoid dividing by sectionHeight - viewportHeight: short sections
        // would otherwise jump straight to 100% on the first scroll event.
        const start = window.innerHeight * 0.9;
        const distance = Math.max(window.innerHeight * 0.7, rect.height * 0.65);
        const next = Math.min(1, Math.max(0, (start - rect.top) / distance));
        setProgress(next);
      });
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const tilt = 22 - progress * 22;
  const lift = 42 - progress * 42;
  const scale = 0.88 + progress * 0.12;

  return (
    <section className="rv-section rv-macbook-section" id="product-preview" ref={sectionRef}>
      <div className="rv-shell">
        <div className="rv-macbook-intro">
          <span className="rv-eyebrow"><Sparkles size={13} /> A closer look at connected work</span>
          <h2 className="rv-h2">Less busywork.<br /><span>A clearer view.</span></h2>
          <p className="rv-lead">A concept preview of how useful tools can bring enquiries, workflows and next steps into one calmer workspace.</p>
        </div>

        <div className="rv-macbook-stage">
          <div
            className="rv-macbook-device"
            style={{ transform: `perspective(1400px) rotateX(${tilt}deg) translateY(${lift}px) scale(${scale})` }}
          >
            <div className="rv-macbook-screen-shell">
              <div className="rv-macbook-camera" />
              <div className="rv-macbook-screen">
                <aside className="rv-mac-sidebar">
                  <div className="rv-mac-brand"><span><Command size={14} /></span><b>REVOLTZ <i>OS</i></b></div>
                  <div className="rv-mac-workspace-label">WORKSPACE</div>
                  <div className="rv-mac-nav-item is-active"><LayoutDashboard size={14} /> Overview</div>
                  <div className="rv-mac-nav-item"><Search size={14} /> Enquiries <small>08</small></div>
                  <div className="rv-mac-nav-item"><Workflow size={14} /> Workflows</div>
                  <div className="rv-mac-nav-item"><BarChart3 size={14} /> Insights</div>
                  <div className="rv-mac-sidebar-bottom"><span className="rv-mac-avatar">R</span><span><b>REVOLTZ team</b><small>Workspace preview</small></span></div>
                </aside>

                <div className="rv-mac-main">
                  <div className="rv-mac-topbar"><span>Workspace / Overview</span><span className="rv-mac-live"><i /> DEMO VIEW</span></div>
                  <div className="rv-mac-welcome"><div><small>MONDAY, YOUR WAY</small><h3>Good work starts with clarity.</h3><p>Here’s a simple view of what needs attention.</p></div><span className="rv-mac-date">This week <ArrowUpRight size={12} /></span></div>
                  <div className="rv-mac-metrics">
                    <div><span>Open enquiries</span><b>24</b><small className="is-positive">↗ 12% <i>illustrative</i></small></div>
                    <div><span>Follow-ups due</span><b>08</b><small>Across 3 workflows</small></div>
                    <div><span>Time saved</span><b>6.5h</b><small>Example estimate only</small></div>
                  </div>
                  <div className="rv-mac-lower">
                    <div className="rv-mac-panel rv-mac-activity"><div className="rv-mac-panel-head"><b>Recent activity</b><span>Sample data</span></div>
                      <div className="rv-mac-activity-row"><span className="rv-mac-activity-icon"><CheckCircle2 size={13} /></span><span><b>New enquiry organized</b><small>Website contact form</small></span><time>2m</time></div>
                      <div className="rv-mac-activity-row"><span className="rv-mac-activity-icon is-violet"><Workflow size={13} /></span><span><b>Follow-up workflow reviewed</b><small>Human approval required</small></span><time>18m</time></div>
                      <div className="rv-mac-activity-row"><span className="rv-mac-activity-icon is-cyan"><Clock3 size={13} /></span><span><b>Reminder ready for review</b><small>No message sent automatically</small></span><time>1h</time></div>
                    </div>
                    <div className="rv-mac-panel rv-mac-next"><div className="rv-mac-panel-head"><b>Next best steps</b><CircleHelp size={13} /></div>
                      <div className="rv-mac-next-card"><span>01</span><p><b>Review new leads</b><small>Keep ownership clear.</small></p><ArrowUpRight size={13} /></div>
                      <div className="rv-mac-next-card"><span>02</span><p><b>Improve one hand-off</b><small>Start small, measure value.</small></p><ArrowUpRight size={13} /></div>
                    </div>
                  </div>
                  <div className="rv-mac-screen-footer"><span><i /> All systems shown are illustrative</span><span>REVOLTZ / PRODUCT CONCEPT</span></div>
                </div>
              </div>
            </div>
            <div className="rv-macbook-base"><span className="rv-macbook-notch" /></div>
          </div>
          <div className="rv-macbook-floor" aria-hidden="true" />
        </div>
        <p className="rv-macbook-caption"><span><i /> CONCEPT UI</span> This is a visual demo with sample data—not a live dashboard or a claim of product functionality.</p>
      </div>
    </section>
  );
}
