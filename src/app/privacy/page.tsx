import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui/display';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Privacy Policy' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] py-4 last:border-0">
      <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-ink-300">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader title="Privacy Policy" subtitle="What AgencyOS stores, where it comes from, and how to delete it" icon="shield" />
        <CardBody>
          <p className="text-[13px] leading-relaxed text-ink-300">
            AgencyOS is a self-hosted prospecting workspace for your own agency. This policy describes the V1 implementation as shipped in this
            repository. It is a starting point for your own compliance review — have a qualified professional adapt it to your jurisdiction and your
            actual data flows before you rely on it commercially.
          </p>

          <Section title="1. Data we store">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="text-ink-100">Business listing data</span> retrieved from the official Google Places API (New): place ID, business
                name, address, phone number, website URL, rating, review count and the Google Maps link.
              </li>
              <li>
                <span className="text-ink-100">Your workflow data</span>: lead status, notes, follow-up dates, assigned service, estimated deal value,
                campaign membership, tags and generated outreach drafts.
              </li>
              <li>
                <span className="text-ink-100">Website audit results</span>: heuristics derived from a single fetch of a business&apos;s public homepage
                (viewport tag, forms, contact links, social links, publish-date evidence), plus any public email address published on that page.
              </li>
              <li>
                <span className="text-ink-100">Your agency profile</span>: agency name, sender name, sender email, WhatsApp number and pitch defaults.
              </li>
            </ul>
          </Section>

          <Section title="2. Data we deliberately do NOT store">
            <ul className="list-disc space-y-1 pl-5">
              <li>No user accounts, no passwords, no authentication secrets in the database.</li>
              <li>No API keys — Google and AI credentials live only in server environment variables and are never written to the datastore or sent to the browser.</li>
              <li>No scraped Google Maps pages, no review text, no personal photos.</li>
              <li>No message delivery logs from WhatsApp or email providers, because AgencyOS never sends messages.</li>
              <li>No tracking pixels, no analytics cookies, no third-party scripts on the app UI.</li>
            </ul>
          </Section>

          <Section title="3. Google Places data handling">
            <p>
              Place data is fetched through Google&apos;s official API with an explicit field mask limited to the fields the app displays. Snapshots are
              timestamped, flagged as stale after your configured freshness window (default 30 days), and can be purged — the purge keeps only{' '}
              <code className="font-mono text-ink-200">place_id</code>, which Google permits you to store indefinitely. Google attribution is shown
              wherever Places data is displayed. Review Google&apos;s current Places API terms and caching policies before changing these defaults.
            </p>
          </Section>

          <Section title="4. Personal data of business contacts">
            <p>
              Listings may include the name or contact details of an individual (for example a sole trader). Treat that as personal data under GDPR, the
              UK GDPR, India&apos;s DPDP Act or your local equivalent: keep it only as long as you need it, keep it accurate, secure it, and delete it on
              request. Use the DO NOT CONTACT status and the suppression list in Settings, and honour opt-outs immediately and permanently.
            </p>
          </Section>

          <Section title="5. Outreach and consent">
            <p>
              AgencyOS generates drafts only. Sending is always a manual action performed by you from your own email client or WhatsApp. You are
              responsible for having a lawful basis to contact each business, for complying with anti-spam rules (CAN-SPAM, PECR, GDPR, DPDP), with
              WhatsApp&apos;s business and opt-in policies, and for including identification and an unsubscribe/opt-out route in your messages. The
              generated WhatsApp draft always ends with an opt-out line for this reason.
            </p>
          </Section>

          <Section title="6. Website analysis">
            <p>
              The analyzer performs a single HTTP GET of a business&apos;s public homepage using an identifying user agent. It reads and honours{' '}
              <code className="font-mono text-ink-200">robots.txt</code>; if crawling is disallowed, or the fetch fails or times out, nothing is
              analysed and the report says so. Requests to private, loopback or link-local addresses are blocked. It is a lightweight heuristic check —
              not a security scan, not a penetration test and not a Lighthouse audit — and it never fabricates findings. Set{' '}
              <code className="font-mono text-ink-200">WEBSITE_ANALYSIS_ENABLED=false</code> to disable it entirely.
            </p>
          </Section>

          <Section title="7. AI processing">
            <p>
              If you configure an AI provider, only the verified facts shown on the lead page are sent to it (business name, category, city, rating,
              review count, website presence, audit findings, your agency profile). Prompts forbid inventing facts. If no provider is configured, the
              app uses built-in templates and labels the output accordingly. Review your AI provider&apos;s data-processing terms before enabling it.
            </p>
          </Section>

          <Section title="8. Storage and security">
            <p>
              V1 stores everything in a single JSON file on the server (<code className="font-mono text-ink-200">data/agencyos.json</code>), which is
              git-ignored. There is no multi-tenant isolation and no authentication in V1 — deploy it on a trusted network or put your own identity
              provider in front of it. Restrict your Google API key by service and origin/IP in Google Cloud Console.
            </p>
          </Section>

          <Section title="9. Export and deletion">
            <p>
              You can export all leads and campaigns to CSV at any time (Settings → Export &amp; erase), purge stale Google snapshots, delete individual
              leads, delete all demo records, or delete all leads. Deleting a lead removes its notes, drafts and audit from the datastore file.
            </p>
          </Section>

          <Section title="10. Contact">
            <p>
              Questions about this deployment should go to whoever operates it (that is you). Replace this section with your real contact details, legal
              entity and, where required, your data-protection officer or representative.
            </p>
          </Section>
        </CardBody>
      </Card>

      <p className="text-center text-[11px] text-ink-500">
        See also the <Link href="/terms" className="link">Terms of Use</Link>.
      </p>
    </div>
  );
}
