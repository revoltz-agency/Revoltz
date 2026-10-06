import Link from 'next/link';
import { Card, CardBody, CardHeader } from '@/components/ui/display';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Terms of Use' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-white/[0.06] py-4 last:border-0">
      <h2 className="text-sm font-semibold text-ink-100">{title}</h2>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-ink-300">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader title="Terms of Use" subtitle="Acceptable use, outreach compliance and disclaimers" icon="note" />
        <CardBody>
          <p className="text-[13px] leading-relaxed text-ink-300">
            These terms govern this deployment of AgencyOS (the &quot;Software&quot;). By running or using it you agree to operate within them. This is a
            template for a self-hosted internal tool — adapt it with your own legal adviser before offering the Software to clients.
          </p>

          <Section title="1. What the Software does">
            <p>
              It helps you research publicly listed local businesses via the official Google Places API (New), score them against a transparent,
              deterministic model, inspect their public websites with lightweight heuristics, and draft personalised outreach that you send yourself.
            </p>
          </Section>

          <Section title="2. What the Software never does">
            <ul className="list-disc space-y-1 pl-5">
              <li>It does not send email, WhatsApp messages, SMS or calls — there is no sending infrastructure and no scheduler.</li>
              <li>It does not scrape Google Maps or any Google property. Only official Places API endpoints are called.</li>
              <li>It does not use unofficial WhatsApp automation APIs, and does not bypass WhatsApp opt-in requirements.</li>
              <li>It does not bulk-message lists, does not rotate numbers, and does not hide the sender identity.</li>
              <li>It does not fabricate audit results, ratings, review counts or business facts: unknown data is reported as unknown.</li>
              <li>It does not store passwords or credentials in its datastore.</li>
            </ul>
          </Section>

          <Section title="3. Your responsibilities">
            <ul className="list-disc space-y-1 pl-5">
              <li>Obtain and respect a lawful basis for each outreach message under GDPR / UK GDPR / DPDP / CAN-SPAM / PECR / TCPA or your local rules.</li>
              <li>Comply with WhatsApp Business terms, including opt-in requirements, and with your email provider&apos;s acceptable-use policy.</li>
              <li>Identify yourself honestly in every message, provide a working opt-out route, and honour opt-outs immediately and permanently (use DO NOT CONTACT).</li>
              <li>Verify facts before repeating them to a prospect — automated heuristics can miss context, and only you know what you are selling.</li>
              <li>Comply with the Google Maps Platform Terms of Service, including the Places caching, attribution and no-scraping requirements.</li>
              <li>Keep your API keys secret, restricted and server-side; you are responsible for usage billed to them.</li>
            </ul>
          </Section>

          <Section title="4. Opportunity Scores and website audits">
            <p>
              Scores are a prioritisation aid computed from retrieved fields, not a guarantee of commercial opportunity, revenue or conversion. Website
              audits inspect one HTML document at one point in time and are explicitly not Lighthouse/Core Web Vitals audits, not accessibility
              certifications and not security assessments. Never present them to a prospect as an official audit without doing your own verification.
            </p>
          </Section>

          <Section title="5. AI-generated copy">
            <p>
              When an AI provider is configured, drafts are model output and are labelled as such. Review every message before sending: you are
              responsible for its accuracy and legality. When no provider is configured, the Software uses deterministic templates and says so — it never
              implies an AI provider was used.
            </p>
          </Section>

          <Section title="6. Demo Mode">
            <p>
              Demo Mode ships a dataset of invented businesses with reserved <code className="font-mono text-ink-200">.example</code> domains and
              non-routable phone numbers. Demo records are labelled throughout the UI, and their website audits are simulated from the demo record —
              never present demo data as real research, and do not contact numbers found in it.
            </p>
          </Section>

          <Section title="7. No warranty &amp; limitation of liability">
            <p>
              The Software is provided &quot;as is&quot; without warranty of any kind, to the maximum extent permitted by law. The operator is not liable
              for lost profits, data loss, API costs, account suspensions, or claims arising from your outreach activity, which is your own
              responsibility.
            </p>
          </Section>

          <Section title="8. Changes">
            <p>
              Google&apos;s APIs, pricing and policies change, as do anti-spam and platform rules. You are responsible for keeping your deployment and
              your outreach practices current with them.
            </p>
          </Section>
        </CardBody>
      </Card>

      <p className="text-center text-[11px] text-ink-500">
        See also the <Link href="/privacy" className="link">Privacy Policy</Link>.
      </p>
    </div>
  );
}
