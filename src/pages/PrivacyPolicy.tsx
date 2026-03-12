import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-fluid-lg pb-fluid-2xl">
        <Button
          onClick={() => navigate(-1)}
          variant="ghost"
          className="mb-fluid-lg gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="prose prose-sm sm:prose lg:prose-lg dark:prose-invert max-w-none">
          <h1 className="text-4xl font-extrabold mb-2" style={{ backgroundImage: 'linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary)), hsl(var(--accent)))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Privacy Policy</h1>
          <p className="text-muted-foreground mb-2">Jet Mobile App</p>
          <p className="text-muted-foreground mb-8">Last updated: January 3, 2025</p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
            <p className="text-foreground/80 mb-4">
              Welcome to Jet Mobile App (&quot;Jet&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website at{" "}
              <a href="https://jet-around.com/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                https://jet-around.com/
              </a>. Please read this policy carefully. By using Jet, you consent to the practices described in this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">2. Information We Collect</h2>
            <p className="text-foreground/80 mb-4">
              We collect the following categories of information:
            </p>
            
            <h3 className="text-xl font-semibold mb-3">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-4">
              <li><strong>Account Information:</strong> Email address, display name, profile picture, and optional bio</li>
              <li><strong>Profile Data:</strong> Gender, birthdate, pronouns (optional)</li>
              <li><strong>Social Links:</strong> Instagram, Twitter, TikTok, LinkedIn, Facebook URLs (optional)</li>
              <li><strong>Preferences:</strong> Deal type preferences, notification settings</li>
              <li><strong>User Content:</strong> Venue reviews, ratings, and saved favorites</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">2.2 Automatically Collected Information</h3>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-4">
              <li><strong>Location Data:</strong> Precise GPS location (when permitted) to show nearby deals and venues</li>
              <li><strong>Device Information:</strong> Device type, operating system, unique device identifiers</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, search queries, interaction timestamps</li>
              <li><strong>Push Notification Tokens:</strong> Device tokens for delivering notifications</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">2.3 Data Linked to You</h3>
            <p className="text-foreground/80 mb-2">The following data may be linked to your identity:</p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Contact Info (email)</li>
              <li>Location (precise location)</li>
              <li>User Content (reviews, favorites)</li>
              <li>Identifiers (user ID, device ID)</li>
              <li>Usage Data (app interactions)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li><strong>Core Functionality:</strong> Display nearby deals, venues, and personalized recommendations</li>
              <li><strong>Location-Based Services:</strong> Show deals on the map, send proximity alerts when near venues with active specials</li>
              <li><strong>Push Notifications:</strong> Alert you about new deals, friend requests, and activity near you</li>
              <li><strong>Social Features:</strong> Connect you with friends, display discoverable profiles</li>
              <li><strong>Analytics:</strong> Understand usage patterns to improve the app experience</li>
              <li><strong>Communication:</strong> Send service updates, respond to inquiries</li>
              <li><strong>Safety & Security:</strong> Detect fraud, enforce terms, protect users</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">4. Location Data</h2>
            <p className="text-foreground/80 mb-4">
              Location data is central to the Jet experience. Here is how we handle it:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-4">
              <li><strong>Purpose:</strong> Show deals near you, display your position on the map, send location-based deal alerts</li>
              <li><strong>Collection:</strong> Only when you grant location permission; you control this in your device settings</li>
              <li><strong>Background Location:</strong> If enabled, we may collect location in the background to send proximity alerts for nearby deals</li>
              <li><strong>Precision:</strong> We collect precise location for accurate map display; we obfuscate coordinates when displaying your location to other users</li>
              <li><strong>Retention:</strong> Location history is retained for 90 days, then automatically deleted</li>
              <li><strong>Opt-Out:</strong> You can disable location services at any time in your device settings or app preferences</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">5. Data Sharing and Disclosure</h2>
            <p className="text-foreground/80 mb-4">We do not sell your personal information. We may share data with:</p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li><strong>Service Providers:</strong> Third parties that help us operate the app (hosting, analytics, email delivery)</li>
              <li><strong>Other Users:</strong> Your display name, avatar, and bio may be visible to other users if you enable discoverability</li>
              <li><strong>Legal Requirements:</strong> When required by law, court order, or to protect rights and safety</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">6. Third-Party Services</h2>
            <p className="text-foreground/80 mb-4">Jet uses the following third-party services:</p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li><strong>Mapbox:</strong> Map display and geocoding (<a href="https://www.mapbox.com/legal/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a>)</li>
              <li><strong>Google Places:</strong> Venue information and images (<a href="https://policies.google.com/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a>)</li>
              <li><strong>Supabase:</strong> Authentication and data storage (<a href="https://supabase.com/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a>)</li>
              <li><strong>Stripe:</strong> Payment processing for subscriptions (<a href="https://stripe.com/privacy" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a>)</li>
            </ul>
            <p className="text-foreground/80 mt-4">
              These services have their own privacy policies governing their use of your data.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">7. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li><strong>Account Data:</strong> Retained while your account is active; deleted within 30 days of account deletion request</li>
              <li><strong>Location History:</strong> Automatically deleted after 90 days</li>
              <li><strong>Search History:</strong> Automatically deleted after 30 days</li>
              <li><strong>Analytics Data:</strong> Aggregated and anonymized after 12 months</li>
              <li><strong>Security Logs:</strong> Retained for 90 days for fraud prevention</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">8. Data Security</h2>
            <p className="text-foreground/80 mb-4">
              We implement industry-standard security measures to protect your personal information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Encryption in transit (TLS/SSL) and at rest</li>
              <li>Row-level security policies for database access</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Access controls limiting employee access to personal data</li>
            </ul>
            <p className="text-foreground/80 mt-4">
              However, no method of transmission over the Internet is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">9. Your Rights and Choices</h2>
            
            <h3 className="text-xl font-semibold mb-3">9.1 All Users</h3>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-4">
              <li><strong>Access:</strong> View your personal data in your profile settings</li>
              <li><strong>Correction:</strong> Update your information at any time</li>
              <li><strong>Deletion:</strong> Request account deletion in Settings &gt; Delete Account</li>
              <li><strong>Data Export:</strong> Request a copy of your data via email</li>
              <li><strong>Opt-Out:</strong> Disable notifications, location tracking, or discoverability</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">9.2 California Residents (CCPA)</h3>
            <p className="text-foreground/80 mb-2">If you are a California resident, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-4">
              <li>Know what personal information we collect, use, and disclose</li>
              <li>Request deletion of your personal information</li>
              <li>Opt-out of the sale of personal information (we do not sell your data)</li>
              <li>Non-discrimination for exercising your privacy rights</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">9.3 European Users (GDPR)</h3>
            <p className="text-foreground/80 mb-2">If you are in the European Economic Area, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Access, correct, or delete your personal data</li>
              <li>Object to or restrict processing</li>
              <li>Data portability</li>
              <li>Withdraw consent at any time</li>
              <li>Lodge a complaint with a supervisory authority</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">10. Tracking and Advertising</h2>
            <p className="text-foreground/80 mb-4">
              Jet does not track you across other apps or websites for advertising purposes. We do not use the Apple IDFA (Identifier for Advertisers) or participate in ad networks. Analytics data is used solely to improve the Jet app experience.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">11. Push Notifications</h2>
            <p className="text-foreground/80 mb-4">
              If you enable push notifications, we collect your device token to send you:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Deal alerts when you are near participating venues</li>
              <li>Friend requests and social activity</li>
              <li>Important account and service updates</li>
            </ul>
            <p className="text-foreground/80 mt-4">
              You can disable push notifications at any time in your device settings or the app.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">12. Children&apos;s Privacy</h2>
            <p className="text-foreground/80">
              Jet is intended for users 17 years of age and older due to alcohol-related content. We do not knowingly collect personal information from children under 13 (or 16 in the EU). If we learn we have collected data from a child, we will delete it promptly.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">13. International Data Transfers</h2>
            <p className="text-foreground/80">
              Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place for international transfers in compliance with applicable law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">14. Changes to This Policy</h2>
            <p className="text-foreground/80">
              We may update this privacy policy from time to time. We will notify you of material changes by posting the updated policy in the app and updating the &quot;Last updated&quot; date. Continued use of Jet after changes constitutes acceptance of the revised policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">15. Contact Us</h2>
            <p className="text-foreground/80 mb-4">
              If you have questions about this privacy policy or wish to exercise your privacy rights, please contact us:
            </p>
            <ul className="list-none space-y-2 text-foreground/80">
              <li><strong>Email:</strong>{" "}
                <a href="mailto:creativebreakroominfo@gmail.com" className="text-primary hover:underline">
                  creativebreakroominfo@gmail.com
                </a>
              </li>
              <li><strong>Website:</strong>{" "}
                <a href="https://jet-around.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                  https://jet-around.com
                </a>
              </li>
            </ul>
            <p className="text-foreground/80 mt-4">
              We will respond to your request within 30 days.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
