import { Metadata } from "next";
import ResponsiveAppBar from "components/ui/ResponsiveAppBar";
import Footer from "components/ui/Footer";
import getServerUser from "../getServerUser";
import { CONTACT_EMAIL } from "utils/generalUtils";

export const metadata: Metadata = {
  title: "Privacy Policy | ZE Graph",
  description: "Privacy Policy for ZEGraph - Counter-Strike Zombie Escape statistics across CS2, CS:GO and CS:S.",
  alternates: {
    canonical: '/privacy'
  },
};

export default async function PrivacyPage() {
  const user = getServerUser();

  return (
    <>
      <ResponsiveAppBar userPromise={user} server={null} setDisplayCommunity={null} />
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

          {/* Section 1 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">1. Introduction</h2>
            <p className="text-foreground leading-relaxed">
              ZEGraph ("we", "us", or "our") operates the website zegraph.xyz (the "Service"). This Privacy Policy describes how we collect, use, and share information about you when you use our Service. By accessing or using the Service, you agree to this Privacy Policy.
            </p>
            <p className="text-foreground leading-relaxed">
              This policy applies to users worldwide, including residents of California and the European Union/European Economic Area.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">2. About Us</h2>
            <p className="text-foreground leading-relaxed">
              ZEGraph is a statistics and community tracking website for Counter-Strike 2 Zombie Escape servers. We are operated by an individual based in Malaysia.
            </p>
            <p className="text-foreground leading-relaxed font-medium">
              Contact: {CONTACT_EMAIL}
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">3. Who May Use This Service</h2>
            <p className="text-foreground leading-relaxed">
              The Service is intended for users aged 13 and older. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected information from a child under 13, please contact us at {CONTACT_EMAIL} and we will promptly delete it.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold">4. Information We Collect</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">4.1 Account Information (via Steam Login)</h3>
                <p className="text-foreground leading-relaxed">
                  We use Steam OpenID for authentication. When you log in, we receive from Steam:
                </p>
                <ul className="list-disc list-inside mt-2 text-foreground space-y-1">
                  <li>Steam username (display name)</li>
                  <li>Steam ID (unique identifier)</li>
                  <li>Country/region as reported by your Steam profile</li>
                  <li>Steam profile picture URL</li>
                </ul>
                <p className="text-foreground leading-relaxed mt-2">
                  We do not receive your Steam password.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">4.2 Analytics Data (via PostHog)</h3>
                <p className="text-foreground leading-relaxed">
                  We use PostHog, a product analytics platform, to understand how users interact with our Service. PostHog may collect:
                </p>
                <ul className="list-disc list-inside mt-2 text-foreground space-y-1">
                  <li>Cursor/mouse position and movement</li>
                  <li>Click events and interactions</li>
                  <li>Pages visited and session duration</li>
                  <li>Browser type, device type, and operating system</li>
                  <li>IP address (used to derive approximate location, including state/country)</li>
                  <li>Referring URL</li>
                </ul>
                <p className="text-foreground leading-relaxed mt-2">
                  PostHog stores data on their servers. You can learn more at{" "}
                  <a href="https://posthog.com/privacy" className="text-primary hover:underline">
                    https://posthog.com/privacy
                  </a>
                  .
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">4.3 Automatically Collected Data</h3>
                <p className="text-foreground leading-relaxed">
                  When you visit the Service, our servers automatically log:
                </p>
                <ul className="list-disc list-inside mt-2 text-foreground space-y-1">
                  <li>IP address</li>
                  <li>Browser and device information</li>
                  <li>Pages and features accessed</li>
                  <li>Date and time of access</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">4.4 Cookies and Local Storage</h3>
                <p className="text-foreground leading-relaxed">
                  We use:
                </p>
                <ul className="list-disc list-inside mt-2 text-foreground space-y-1">
                  <li><strong>Session cookies</strong> — to maintain your login session</li>
                  <li><strong>Local storage</strong> — for user preferences (e.g., theme)</li>
                  <li><strong>Analytics cookies</strong> — placed by PostHog for usage tracking</li>
                </ul>
                <p className="text-foreground leading-relaxed mt-2">
                  We do not use Facebook Pixel or other social media tracking pixels.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">5. How We Use Your Information</h2>
            <p className="text-foreground leading-relaxed">
              We use collected information to:
            </p>
            <ul className="list-disc list-inside text-foreground space-y-1">
              <li>Authenticate you via Steam login and maintain your session</li>
              <li>Display your statistics, rankings, and profile on the Service</li>
              <li>Understand how the Service is used and improve it</li>
              <li>Display advertisements via ad networks (see Section 6)</li>
              <li>Operate and maintain the Service</li>
            </ul>
            <p className="text-foreground leading-relaxed mt-4">
              We do NOT:
            </p>
            <ul className="list-disc list-inside text-foreground space-y-1">
              <li>Send newsletters, promotional emails, or any email communications</li>
              <li>Use your data for targeted or behavioural advertising profiling</li>
              <li>Sell your personal data to third parties</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">6. Advertising</h2>
            <p className="text-foreground leading-relaxed">
              We display advertisements on the Service. Ad networks may place their own cookies or tracking technologies to serve and measure ads. These ad networks operate under their own privacy policies. The data we collect is not used to profile you for advertising purposes; however, ad networks may independently collect data subject to their own policies.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">7. Sharing of Information</h2>
            <p className="text-foreground leading-relaxed">
              We do not sell, trade, or rent your personal data. We may share information with:
            </p>
            <ul className="list-disc list-inside text-foreground space-y-1">
              <li><strong>PostHog</strong> — analytics (see Section 4.2)</li>
              <li><strong>Steam (Valve Corporation)</strong> — authentication provider</li>
              <li><strong>Advertising partners</strong> — for ad display (see Section 6)</li>
              <li><strong>Legal authorities</strong> — if required by law or to protect our rights</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">8. Data Retention</h2>
            <p className="text-foreground leading-relaxed">
              We retain your account information for as long as your account is active or as needed to provide the Service. Analytics data is retained per PostHog's retention policies. You may request deletion of your data at any time (see Section 11).
            </p>
          </section>

          {/* Section 9 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">9. Security</h2>
            <p className="text-foreground leading-relaxed">
              We implement reasonable technical and organisational measures to protect your information. However, no internet transmission is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          {/* Section 10 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">10. Third-Party Services</h2>
            <p className="text-foreground leading-relaxed">
              Our Service may link to external sites. We are not responsible for the privacy practices of those sites.
            </p>
            <p className="text-foreground leading-relaxed">
              Third-party services we use:
            </p>
            <ul className="list-disc list-inside text-foreground space-y-1">
              <li>
                <strong>Valve Steam</strong> — authentication (
                <a href="https://store.steampowered.com/privacy_agreement/" className="text-primary hover:underline">
                  https://store.steampowered.com/privacy_agreement/
                </a>
                )
              </li>
              <li>
                <strong>PostHog</strong> — analytics (
                <a href="https://posthog.com/privacy" className="text-primary hover:underline">
                  https://posthog.com/privacy
                </a>
                )
              </li>
            </ul>
          </section>

          {/* Section 11 */}
          <section className="space-y-6">
            <h2 className="text-2xl font-semibold">11. Your Rights</h2>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">11.1 Rights for All Users</h3>
                <p className="text-foreground leading-relaxed">
                  You may contact us at {CONTACT_EMAIL} to:
                </p>
                <ul className="list-disc list-inside mt-2 text-foreground space-y-1">
                  <li>Access the personal data we hold about you</li>
                  <li>Request correction of inaccurate data</li>
                  <li>Request deletion of your data</li>
                  <li>Request restriction of processing</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">11.2 California Residents — CalOPPA & CCPA</h3>
                <p className="text-foreground leading-relaxed">
                  Under the California Online Privacy Protection Act (CalOPPA), we conspicuously post this Privacy Policy and will notify you of material changes.
                </p>
                <p className="text-foreground leading-relaxed mt-2">
                  Under the California Consumer Privacy Act (CCPA), California residents have the right to:
                </p>
                <ul className="list-disc list-inside mt-2 text-foreground space-y-1">
                  <li>Know what personal information is collected, used, shared, or sold</li>
                  <li>Delete personal information we hold (subject to exceptions)</li>
                  <li>Opt out of the sale of personal information — <strong>We do not sell personal information</strong></li>
                  <li>Non-discrimination for exercising your rights</li>
                </ul>
                <p className="text-foreground leading-relaxed mt-4">
                  To exercise these rights, contact us at {CONTACT_EMAIL}. We will respond within 45 days.
                </p>
                <p className="text-foreground leading-relaxed mt-4">
                  <strong>Categories of personal information collected (CCPA):</strong>
                </p>
                <ul className="list-disc list-inside mt-2 text-foreground space-y-1">
                  <li>Identifiers (Steam ID, IP address)</li>
                  <li>Internet/network activity (clicks, cursor, pages visited)</li>
                  <li>Geolocation data (country, state derived from IP/Steam profile)</li>
                  <li>Inferences (usage patterns via PostHog)</li>
                </ul>
                <p className="text-foreground leading-relaxed mt-4">
                  We do not sell personal information as defined by the CCPA.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-2">11.3 EEA/UK Residents — GDPR</h3>
                <p className="text-foreground leading-relaxed">
                  If you are in the European Economic Area or the United Kingdom, you have the following rights under the GDPR:
                </p>
                <ul className="list-disc list-inside mt-2 text-foreground space-y-1">
                  <li><strong>Access</strong> — request a copy of your personal data</li>
                  <li><strong>Rectification</strong> — correct inaccurate data</li>
                  <li><strong>Erasure ("right to be forgotten")</strong> — request deletion of your data</li>
                  <li><strong>Restriction</strong> — limit how we process your data</li>
                  <li><strong>Portability</strong> — receive your data in a portable format</li>
                  <li><strong>Objection</strong> — object to processing based on legitimate interests</li>
                  <li><strong>Withdraw consent</strong> — where processing is based on consent</li>
                </ul>
                <p className="text-foreground leading-relaxed mt-4">
                  <strong>Legal bases for processing:</strong>
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm border-collapse border border-muted">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border border-muted p-2 text-left">Processing Activity</th>
                        <th className="border border-muted p-2 text-left">Legal Basis</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-muted p-2">Steam login authentication</td>
                        <td className="border border-muted p-2">Legitimate interest / Contract</td>
                      </tr>
                      <tr>
                        <td className="border border-muted p-2">Analytics (PostHog)</td>
                        <td className="border border-muted p-2">Legitimate interest</td>
                      </tr>
                      <tr>
                        <td className="border border-muted p-2">Displaying your stats</td>
                        <td className="border border-muted p-2">Contract / Legitimate interest</td>
                      </tr>
                      <tr>
                        <td className="border border-muted p-2">Advertising</td>
                        <td className="border border-muted p-2">Legitimate interest</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-foreground leading-relaxed mt-4">
                  As our organisation is based in Malaysia, we process your data under legitimate interest grounds for service provision. You may lodge a complaint with your local data protection authority.
                </p>
                <p className="text-foreground leading-relaxed mt-2">
                  To exercise GDPR rights, contact: {CONTACT_EMAIL}
                </p>
              </div>
            </div>
          </section>

          {/* Section 12 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">12. Do Not Track</h2>
            <p className="text-foreground leading-relaxed">
              We respect Do Not Track (DNT) browser signals. When DNT is enabled, we will not use PostHog analytics tracking for your session. Note that ad networks may have their own DNT handling.
            </p>
          </section>

          {/* Section 13 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">13. Changes to This Policy</h2>
            <p className="text-foreground leading-relaxed">
              We may update this Privacy Policy from time to time. We will update the "Last updated" date at the top. Your continued use of the Service after changes constitutes acceptance of the revised policy. For significant changes, we will post a notice on the Service.
            </p>
          </section>

          {/* Section 14 */}
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">14. Contact Us</h2>
            <p className="text-foreground leading-relaxed">
              For any privacy-related questions, requests, or concerns:
            </p>
            <div className="mt-4 space-y-1 text-foreground">
              <p>Email: {CONTACT_EMAIL}</p>
              <p>Website: https://zegraph.xyz</p>
            </div>
          </section>
          </article>
        </div>
      </div>
      <Footer />
    </>
  );
}
