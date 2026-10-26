import { Metadata } from "next";
import { ReactNode } from "react";
import { cn } from "components/lib/utils";
import { CONTACT_EMAIL } from "utils/generalUtils";

export const metadata: Metadata = {
  title: "Privacy Policy | ZE Graph",
  description: "Privacy Policy for ZEGraph - Counter-Strike Zombie Escape statistics across CS2, CS:GO and CS:S.",
  alternates: {
    canonical: '/privacy'
  },
};

const LEGAL_BASES = [
  ["Steam login authentication", "Legitimate interest / Contract"],
  ["Analytics (PostHog)", "Legitimate interest"],
  ["Displaying your stats", "Contract / Legitimate interest"],
  ["Advertising", "Legitimate interest"],
];

function Section({ title, className = "space-y-4", children }: { title: string, className?: string, children: ReactNode }) {
  return (
    <section className={className}>
      <h2 className="text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Subsection({ title, children }: { title: string, children: ReactNode }) {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}

function P({ className, children }: { className?: string, children: ReactNode }) {
  return <p className={cn("text-foreground leading-relaxed", className)}>{children}</p>;
}

function List({ items, className }: { items: ReactNode[], className?: string }) {
  return (
    <ul className={cn("list-disc list-inside text-foreground space-y-1", className)}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}

/** List items of the form "<strong>term</strong> — description". */
function terms(entries: [string, ReactNode][]) {
  return entries.map(([term, description]) => <><strong>{term}</strong> — {description}</>);
}

function PolicyLink({ href }: { href: string }) {
  return <a href={href} className="text-primary hover:underline">{href}</a>;
}

export default async function PrivacyPage() {
  return (
    <div className="min-h-screen py-12 px-4">
      <div className="container mx-auto max-w-4xl">
        <article className="prose prose-invert max-w-none space-y-8">
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Privacy Policy for ZEGraph</h1>
          <p className="text-sm text-muted-foreground">
            Last updated: 18 February 2026
            <br />
            Effective date: 18 February 2026
          </p>
        </div>

        <Section title="1. Introduction">
          <P>
            ZEGraph ("we", "us", or "our") operates the website zegraph.xyz (the "Service"). This Privacy Policy describes how we collect, use, and share information about you when you use our Service. By accessing or using the Service, you agree to this Privacy Policy.
          </P>
          <P>
            This policy applies to users worldwide, including residents of California and the European Union/European Economic Area.
          </P>
        </Section>

        <Section title="2. About Us">
          <P>
            ZEGraph is a statistics and community tracking website for Counter-Strike 2 Zombie Escape servers. We are operated by an individual based in Malaysia.
          </P>
          <P className="font-medium">Contact: {CONTACT_EMAIL}</P>
        </Section>

        <Section title="3. Who May Use This Service">
          <P>
            The Service is intended for users aged 13 and older. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected information from a child under 13, please contact us at {CONTACT_EMAIL} and we will promptly delete it.
          </P>
        </Section>

        <Section title="4. Information We Collect" className="space-y-6">
          <div className="space-y-4">
            <Subsection title="4.1 Account Information (via Steam Login)">
              <P>We use Steam OpenID for authentication. When you log in, we receive from Steam:</P>
              <List className="mt-2" items={[
                "Steam username (display name)",
                "Steam ID (unique identifier)",
                "Country/region as reported by your Steam profile",
                "Steam profile picture URL",
              ]} />
              <P className="mt-2">We do not receive your Steam password.</P>
            </Subsection>

            <Subsection title="4.2 Analytics Data (via PostHog)">
              <P>
                We use PostHog, a product analytics platform, to understand how users interact with our Service. PostHog may collect:
              </P>
              <List className="mt-2" items={[
                "Cursor/mouse position and movement",
                "Click events and interactions",
                "Pages visited and session duration",
                "Browser type, device type, and operating system",
                "IP address (used to derive approximate location, including state/country)",
                "Referring URL",
              ]} />
              <P className="mt-2">
                PostHog stores data on their servers. You can learn more at{" "}
                <PolicyLink href="https://posthog.com/privacy" />.
              </P>
            </Subsection>

            <Subsection title="4.3 Automatically Collected Data">
              <P>When you visit the Service, our servers automatically log:</P>
              <List className="mt-2" items={[
                "IP address",
                "Browser and device information",
                "Pages and features accessed",
                "Date and time of access",
              ]} />
            </Subsection>

            <Subsection title="4.4 Cookies and Local Storage">
              <P>We use:</P>
              <List className="mt-2" items={terms([
                ["Session cookies", "to maintain your login session"],
                ["Local storage", "for user preferences (e.g., theme)"],
                ["Analytics cookies", "placed by PostHog for usage tracking"],
              ])} />
              <P className="mt-2">We do not use Facebook Pixel or other social media tracking pixels.</P>
            </Subsection>
          </div>
        </Section>

        <Section title="5. How We Use Your Information">
          <P>We use collected information to:</P>
          <List items={[
            "Authenticate you via Steam login and maintain your session",
            "Display your statistics, rankings, and profile on the Service",
            "Understand how the Service is used and improve it",
            "Display advertisements via ad networks (see Section 6)",
            "Operate and maintain the Service",
          ]} />
          <P className="mt-4">We do NOT:</P>
          <List items={[
            "Send newsletters, promotional emails, or any email communications",
            "Use your data for targeted or behavioural advertising profiling",
            "Sell your personal data to third parties",
          ]} />
        </Section>

        <Section title="6. Advertising">
          <P>
            We display advertisements on the Service. Ad networks may place their own cookies or tracking technologies to serve and measure ads. These ad networks operate under their own privacy policies. The data we collect is not used to profile you for advertising purposes; however, ad networks may independently collect data subject to their own policies.
          </P>
        </Section>

        <Section title="7. Sharing of Information">
          <P>We do not sell, trade, or rent your personal data. We may share information with:</P>
          <List items={terms([
            ["PostHog", "analytics (see Section 4.2)"],
            ["Steam (Valve Corporation)", "authentication provider"],
            ["Advertising partners", "for ad display (see Section 6)"],
            ["Legal authorities", "if required by law or to protect our rights"],
          ])} />
        </Section>

        <Section title="8. Data Retention">
          <P>
            We retain your account information for as long as your account is active or as needed to provide the Service. Analytics data is retained per PostHog's retention policies. You may request deletion of your data at any time (see Section 11).
          </P>
        </Section>

        <Section title="9. Security">
          <P>
            We implement reasonable technical and organisational measures to protect your information. However, no internet transmission is completely secure, and we cannot guarantee absolute security.
          </P>
        </Section>

        <Section title="10. Third-Party Services">
          <P>
            Our Service may link to external sites. We are not responsible for the privacy practices of those sites.
          </P>
          <P>Third-party services we use:</P>
          <List items={terms([
            ["Valve Steam", <>authentication (<PolicyLink href="https://store.steampowered.com/privacy_agreement/" />)</>],
            ["PostHog", <>analytics (<PolicyLink href="https://posthog.com/privacy" />)</>],
          ])} />
        </Section>

        <Section title="11. Your Rights" className="space-y-6">
          <div className="space-y-4">
            <Subsection title="11.1 Rights for All Users">
              <P>You may contact us at {CONTACT_EMAIL} to:</P>
              <List className="mt-2" items={[
                "Access the personal data we hold about you",
                "Request correction of inaccurate data",
                "Request deletion of your data",
                "Request restriction of processing",
              ]} />
            </Subsection>

            <Subsection title="11.2 California Residents — CalOPPA & CCPA">
              <P>
                Under the California Online Privacy Protection Act (CalOPPA), we conspicuously post this Privacy Policy and will notify you of material changes.
              </P>
              <P className="mt-2">
                Under the California Consumer Privacy Act (CCPA), California residents have the right to:
              </P>
              <List className="mt-2" items={[
                "Know what personal information is collected, used, shared, or sold",
                "Delete personal information we hold (subject to exceptions)",
                <>Opt out of the sale of personal information — <strong>We do not sell personal information</strong></>,
                "Non-discrimination for exercising your rights",
              ]} />
              <P className="mt-4">
                To exercise these rights, contact us at {CONTACT_EMAIL}. We will respond within 45 days.
              </P>
              <P className="mt-4">
                <strong>Categories of personal information collected (CCPA):</strong>
              </P>
              <List className="mt-2" items={[
                "Identifiers (Steam ID, IP address)",
                "Internet/network activity (clicks, cursor, pages visited)",
                "Geolocation data (country, state derived from IP/Steam profile)",
                "Inferences (usage patterns via PostHog)",
              ]} />
              <P className="mt-4">We do not sell personal information as defined by the CCPA.</P>
            </Subsection>

            <Subsection title="11.3 EEA/UK Residents — GDPR">
              <P>
                If you are in the European Economic Area or the United Kingdom, you have the following rights under the GDPR:
              </P>
              <List className="mt-2" items={terms([
                ["Access", "request a copy of your personal data"],
                ["Rectification", "correct inaccurate data"],
                ['Erasure ("right to be forgotten")', "request deletion of your data"],
                ["Restriction", "limit how we process your data"],
                ["Portability", "receive your data in a portable format"],
                ["Objection", "object to processing based on legitimate interests"],
                ["Withdraw consent", "where processing is based on consent"],
              ])} />
              <P className="mt-4">
                <strong>Legal bases for processing:</strong>
              </P>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm border-collapse border border-muted">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="border border-muted p-2 text-left">Processing Activity</th>
                      <th className="border border-muted p-2 text-left">Legal Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {LEGAL_BASES.map(([activity, basis]) => (
                      <tr key={activity}>
                        <td className="border border-muted p-2">{activity}</td>
                        <td className="border border-muted p-2">{basis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <P className="mt-4">
                As our organisation is based in Malaysia, we process your data under legitimate interest grounds for service provision. You may lodge a complaint with your local data protection authority.
              </P>
              <P className="mt-2">To exercise GDPR rights, contact: {CONTACT_EMAIL}</P>
            </Subsection>
          </div>
        </Section>

        <Section title="12. Do Not Track">
          <P>
            We respect Do Not Track (DNT) browser signals. When DNT is enabled, we will not use PostHog analytics tracking for your session. Note that ad networks may have their own DNT handling.
          </P>
        </Section>

        <Section title="13. Changes to This Policy">
          <P>
            We may update this Privacy Policy from time to time. We will update the "Last updated" date at the top. Your continued use of the Service after changes constitutes acceptance of the revised policy. For significant changes, we will post a notice on the Service.
          </P>
        </Section>

        <Section title="14. Contact Us">
          <P>For any privacy-related questions, requests, or concerns:</P>
          <div className="mt-4 space-y-1 text-foreground">
            <p>Email: {CONTACT_EMAIL}</p>
            <p>Website: https://zegraph.xyz</p>
          </div>
        </Section>
        </article>
      </div>
    </div>
  );
}
