import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { Footer } from "@/components/Footer";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div
      className="bg-background flex-1 overflow-y-auto"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 py-8 pb-16">
        <Button
          onClick={() => navigate(-1)}
          variant="ghost"
          className="mb-fluid-lg gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="prose prose-sm sm:prose lg:prose-lg dark:prose-invert max-w-none">
          <h1
            className="text-4xl font-extrabold mb-2"
            style={{
              backgroundImage:
                "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary)), hsl(var(--accent)))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Privacy Policy
          </h1>
          <p className="text-muted-foreground mb-2">Jet Mobile App</p>
          <p className="text-muted-foreground mb-8">
            Last updated: August 16, 2026
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
            <p className="text-foreground/80 mb-4">
              Welcome to Jet Mobile App (&quot;Jet&quot;, &quot;we&quot;,
              &quot;our&quot;, or &quot;us&quot;). This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when
              you use our mobile application and website at{" "}
              <a
                href="https://jet-around.com/"
                className="text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://jet-around.com/
              </a>
              . Please read this policy carefully. By using Jet, you consent to
              the practices described in this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              2. Information We Collect
            </h2>
            <p className="text-foreground/80 mb-4">
              We collect the following categories of information:
            </p>

            <h3 className="text-xl font-semibold mb-3">
              2.1 Information You Provide
            </h3>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-4">
              <li>
                <strong>Account Information:</strong> Email address, display
                name, profile picture, and optional bio. If you sign in with
                Google, we receive your email address, name, and profile image
                from Google.
              </li>
              <li>
                <strong>Profile Data:</strong> Birthdate (used for age
                verification), gender, pronouns (optional)
              </li>
              <li>
                <strong>Social Links:</strong> Instagram, Twitter, TikTok,
                LinkedIn, Facebook URLs (optional)
              </li>
              <li>
                <strong>Preferences:</strong> Taste categories (food, drinks,
                nightlife, events), notification settings, location settings,
                and profile visibility settings
              </li>
              <li>
                <strong>User Content:</strong> Saved favorites, direct messages
                and images you send to other users, and connection (crew)
                requests
              </li>
              <li>
                <strong>Search Activity:</strong> Venue and deal searches you
                run in the app
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">
              2.2 Automatically Collected Information
            </h3>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-4">
              <li>
                <strong>Location Data:</strong> Precise GPS location (only when
                you grant permission) to show nearby deals and venues and to
                power the live activity map
              </li>
              <li>
                <strong>Approximate Location:</strong> If you decline precise
                location, we may derive an approximate city-level location from
                your network/IP address so the map can open somewhere useful
              </li>
              <li>
                <strong>Device and Browser Information:</strong> Device and
                browser type, operating system, and app/session identifiers
              </li>
              <li>
                <strong>Usage Data:</strong> Screens viewed, features used,
                deals and venues tapped, search queries, and interaction
                timestamps
              </li>
              <li>
                <strong>Push Subscriptions and Tokens:</strong> Web push
                subscription endpoints and native device tokens used to deliver
                notifications, plus delivery receipts (sent, delivered, opened)
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">
              2.3 Data Linked to You
            </h3>
            <p className="text-foreground/80 mb-2">
              The following data may be linked to your identity:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Contact Info (email)</li>
              <li>Location (precise and approximate location)</li>
              <li>
                User Content (favorites, messages, images, profile content)
              </li>
              <li>Identifiers (user ID, device/push identifiers)</li>
              <li>Usage Data (app interactions, search history)</li>
              <li>
                Purchases (subscription status; card details are handled by
                Stripe and never reach our servers)
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              3. How We Use Your Information
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>Core Functionality:</strong> Display nearby deals,
                venues, and personalized recommendations
              </li>
              <li>
                <strong>Location-Based Services:</strong> Show deals on the map,
                and send proximity alerts when you enter an area around a venue
                with an active special (geofencing), if you enable them
              </li>
              <li>
                <strong>Aggregated Activity Maps:</strong> Combine location
                points from many users into the heatmap and flow-path layers
                that show where activity is concentrated
              </li>
              <li>
                <strong>Push Notifications:</strong> Alert you about updates to
                your favorite venues and deals, connection requests, new
                messages, and account or service notices
              </li>
              <li>
                <strong>Social and Messaging:</strong> Let you find discoverable
                users, send and receive connection requests, and exchange direct
                messages and images
              </li>
              <li>
                <strong>Subscriptions:</strong> Provision paid tiers and confirm
                entitlement through our payment processor
              </li>
              <li>
                <strong>Analytics:</strong> Understand usage patterns to improve
                the app experience (first-party only; no advertising networks)
              </li>
              <li>
                <strong>Communication:</strong> Send service updates, respond to
                inquiries
              </li>
              <li>
                <strong>Safety & Security:</strong> Detect fraud, enforce terms,
                protect users
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">4. Location Data</h2>
            <p className="text-foreground/80 mb-4">
              Location data is central to the Jet experience. Here is how we
              handle it:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-4">
              <li>
                <strong>Purpose:</strong> Show deals near you, display your
                position on the map, send location-based deal alerts
              </li>
              <li>
                <strong>Collection:</strong> Only when you grant location
                permission; you control this in your device settings
              </li>
              <li>
                <strong>Background Location:</strong> If enabled, we may collect
                location in the background to send proximity alerts for nearby
                deals
              </li>
              <li>
                <strong>Precision:</strong> We collect precise location for
                accurate map display. Points are smoothed and rate-limited
                before storage, and coordinates are obfuscated (reduced in
                precision) after 7 days
              </li>
              <li>
                <strong>Aggregation Safeguard:</strong> Heatmap cells and
                flow-path segments shown to other users are only rendered when
                enough distinct users contribute to them (a minimum of three),
                so individual movement is not exposed. Your own recent activity
                remains visible to you.
              </li>
              <li>
                <strong>Retention:</strong> Precise location history is retained
                for up to 30 days to power live features. After 30 days, points
                are moved to a historical archive used for trend analysis and
                are no longer used for live display.
              </li>
              <li>
                <strong>Opt-Out:</strong> You can disable location sharing at
                any time in your device settings or in the app&apos;s location
                settings. Turning it off stops new collection; existing points
                age out on the schedule above.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              5. Data Sharing and Disclosure
            </h2>
            <p className="text-foreground/80 mb-4">
              We do not sell your personal information. We may share data with:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>Service Providers:</strong> Third parties that help us
                operate the app (hosting, analytics, email delivery)
              </li>
              <li>
                <strong>Other Users:</strong> Your display name, avatar, and bio
                may be visible to other users if you enable discoverability, and
                are visible to users you have connected with regardless of that
                setting. Messages and images you send are visible to their
                recipients.
              </li>
              <li>
                <strong>Aggregated Data:</strong> De-identified, aggregated
                activity data (such as heatmap density) that does not identify
                you individually
              </li>
              <li>
                <strong>Legal Requirements:</strong> When required by law, court
                order, or to protect rights and safety
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection with a
                merger, acquisition, or sale of assets
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">6. Third-Party Services</h2>
            <p className="text-foreground/80 mb-4">
              Jet uses the following third-party services:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>Mapbox:</strong> Map display and geocoding (
                <a
                  href="https://www.mapbox.com/legal/privacy"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                )
              </li>
              <li>
                <strong>Google Places:</strong> Venue information and images (
                <a
                  href="https://policies.google.com/privacy"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                )
              </li>
              <li>
                <strong>Supabase:</strong> Authentication and data storage (
                <a
                  href="https://supabase.com/privacy"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                )
              </li>
              <li>
                <strong>Stripe:</strong> Payment processing for subscriptions (
                <a
                  href="https://stripe.com/privacy"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                )
              </li>
              <li>
                <strong>Firebase Cloud Messaging (Google):</strong> Delivery of
                native push notifications (
                <a
                  href="https://policies.google.com/privacy"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                )
              </li>
              <li>
                <strong>Browser Push Services:</strong> Web push notifications
                are relayed by your browser vendor&apos;s push service (for
                example Google, Apple, or Mozilla)
              </li>
              <li>
                <strong>Resend:</strong> Transactional and verification email
                delivery (
                <a
                  href="https://resend.com/legal/privacy-policy"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                )
              </li>
              <li>
                <strong>Google Sign-In:</strong> Optional authentication
                provider (
                <a
                  href="https://policies.google.com/privacy"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                )
              </li>
            </ul>
            <p className="text-foreground/80 mt-4">
              These services have their own privacy policies governing their use
              of your data.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">7. Data Retention</h2>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                <strong>Account Data:</strong> Retained while your account is
                active; deleted within 30 days of an account deletion request
              </li>
              <li>
                <strong>Precise Location History:</strong> Retained up to 30
                days for live features, with coordinates obfuscated after 7 days
              </li>
              <li>
                <strong>Archived Location Data:</strong> After 30 days, location
                points are moved to a historical archive used for aggregate
                trend analysis
              </li>
              <li>
                <strong>Messages and Images:</strong> Retained until deleted by
                a participant or until the account is deleted
              </li>
              <li>
                <strong>Notification Records:</strong> Delivery and read
                receipts retained to power your in-app Alerts inbox and to
                prevent duplicate sends
              </li>
              <li>
                <strong>Search History:</strong> Retained for your account until
                you clear it or delete your account
              </li>
              <li>
                <strong>Analytics and Security Logs:</strong> Retained for a
                limited period to improve the service, enforce rate limits, and
                investigate abuse
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">8. Data Security</h2>
            <p className="text-foreground/80 mb-4">
              We implement industry-standard security measures to protect your
              personal information:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Encryption in transit (TLS/SSL) and at rest</li>
              <li>Row-level security policies for database access</li>
              <li>Automated security scanning of our code and dependencies</li>
              <li>Rate limiting and audit logging on sensitive endpoints</li>
              <li>Access controls limiting employee access to personal data</li>
            </ul>
            <p className="text-foreground/80 mt-4">
              However, no method of transmission over the Internet is 100%
              secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              9. Your Rights and Choices
            </h2>

            <h3 className="text-xl font-semibold mb-3">9.1 All Users</h3>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-4">
              <li>
                <strong>Access:</strong> View your personal data in your profile
                settings
              </li>
              <li>
                <strong>Correction:</strong> Update your information at any time
              </li>
              <li>
                <strong>Deletion:</strong> Request account deletion in Settings
                &gt; Delete Account
              </li>
              <li>
                <strong>Data Export:</strong> Request a copy of your data via
                email
              </li>
              <li>
                <strong>Opt-Out:</strong> Disable notifications, location
                tracking, or discoverability
              </li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">
              9.2 California Residents (CCPA)
            </h3>
            <p className="text-foreground/80 mb-2">
              If you are a California resident, you have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80 mb-4">
              <li>
                Know what personal information we collect, use, and disclose
              </li>
              <li>Request deletion of your personal information</li>
              <li>
                Opt-out of the sale of personal information (we do not sell your
                data)
              </li>
              <li>Non-discrimination for exercising your privacy rights</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">
              9.3 European Users (GDPR)
            </h3>
            <p className="text-foreground/80 mb-2">
              If you are in the European Economic Area, you have the right to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Access, correct, or delete your personal data</li>
              <li>Object to or restrict processing</li>
              <li>Data portability</li>
              <li>Withdraw consent at any time</li>
              <li>Lodge a complaint with a supervisory authority</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              10. Tracking and Advertising
            </h2>
            <p className="text-foreground/80 mb-4">
              Jet does not track you across other apps or websites for
              advertising purposes. We do not use the Apple IDFA (Identifier for
              Advertisers) or participate in ad networks. Analytics data is used
              solely to improve the Jet app experience.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">11. Push Notifications</h2>
            <p className="text-foreground/80 mb-4">
              If you enable push notifications, we collect your device token to
              send you:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Deal alerts when you are near participating venues</li>
              <li>Friend requests and social activity</li>
              <li>Important account and service updates</li>
            </ul>
            <p className="text-foreground/80 mt-4">
              You can disable push notifications at any time in your device
              settings or the app.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              11a. Messaging and Social Features
            </h2>
            <p className="text-foreground/80 mb-4">
              Direct messages and images you send are stored so they can be
              delivered and displayed in your conversation history. They are
              visible to you and the recipient, and to our staff only where
              necessary to investigate abuse, comply with law, or operate the
              service.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>
                Messages are not end-to-end encrypted. Do not share sensitive
                information such as payment details or government identifiers.
              </li>
              <li>
                Your profile is shown in discovery only when discoverability is
                enabled; users you have connected with can always see your
                profile.
              </li>
              <li>
                Deleting your account removes your profile from discovery and
                deletes your messages from your account.
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              11b. Cookies and Local Storage
            </h2>
            <p className="text-foreground/80">
              We use cookies and browser storage (localStorage, sessionStorage,
              and a service worker cache) to keep you signed in, remember your
              preferences and dismissed prompts, cache map assets for
              performance, and support offline behavior. We do not use
              advertising or cross-site tracking cookies. You can clear this
              data through your browser settings, though doing so will sign you
              out and reset your preferences.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              11c. Connected Applications
            </h2>
            <p className="text-foreground/80">
              If you authorize a third-party application to connect to your JET
              account, that application receives only the access you approve at
              the time of authorization. You can revoke access at any time from
              your account settings or by contacting us. We are not responsible
              for how an authorized third-party application uses data you permit
              it to access.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              12. Children&apos;s Privacy
            </h2>
            <p className="text-foreground/80">
              Jet is intended for users 18 years of age and older. The app
              surfaces venues and specials that may involve alcohol; alcohol may
              only be purchased and consumed by persons of legal drinking age in
              their jurisdiction. We do not knowingly collect personal
              information from anyone under 18. If we learn we have collected
              data from anyone under 18, we will delete it promptly.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              13. International Data Transfers
            </h2>
            <p className="text-foreground/80">
              Your information may be transferred to and processed in countries
              other than your own. We ensure appropriate safeguards are in place
              for international transfers in compliance with applicable law.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">
              14. Changes to This Policy
            </h2>
            <p className="text-foreground/80">
              We may update this privacy policy from time to time. We will
              notify you of material changes by posting the updated policy in
              the app and updating the &quot;Last updated&quot; date. Continued
              use of Jet after changes constitutes acceptance of the revised
              policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">15. Contact Us</h2>
            <p className="text-foreground/80 mb-4">
              If you have questions about this privacy policy or wish to
              exercise your privacy rights, please contact us:
            </p>
            <ul className="list-none space-y-2 text-foreground/80">
              <li>
                <strong>Email:</strong>{" "}
                <a
                  href="mailto:creativebreakroominfo@gmail.com"
                  className="text-primary hover:underline"
                >
                  creativebreakroominfo@gmail.com
                </a>
              </li>
              <li>
                <strong>Website:</strong>{" "}
                <a
                  href="https://jet-around.com"
                  className="text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
