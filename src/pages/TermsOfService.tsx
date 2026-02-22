import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";

const TermsOfService = () => {
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
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-2">Jet Mobile App</p>
          <p className="text-muted-foreground mb-8">Last updated: January 3, 2025</p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">1. Acceptance of Terms</h2>
            <p className="text-foreground/80 mb-4">
              By downloading, accessing, or using the Jet Mobile App (&quot;Jet&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) available at{" "}
              <a href="https://jet-around.com/" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
                https://jet-around.com/
              </a>, you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use Jet.
            </p>
            <p className="text-foreground/80">
              These Terms constitute a legally binding agreement between you and Jet. Please read them carefully along with our{" "}
              <Link to="/privacy-policy" className="text-primary hover:underline">
                Privacy Policy
              </Link>, which is incorporated by reference.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">2. Description of Service</h2>
            <p className="text-foreground/80 mb-4">
              Jet is a location-based mobile application that helps users discover deals, specials, and promotions at local bars, restaurants, and venues. Our services include:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Interactive map displaying nearby venues with active deals</li>
              <li>Location-based notifications for deals near you</li>
              <li>Ability to save favorite venues and deals</li>
              <li>Social features to connect with friends</li>
              <li>Venue reviews and ratings</li>
              <li>Premium subscription features</li>
            </ul>
            <p className="text-foreground/80 mt-4">
              We reserve the right to modify, suspend, or discontinue any aspect of the service at any time without prior notice.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">3. Eligibility and Account Registration</h2>
            
            <h3 className="text-xl font-semibold mb-3">3.1 Age Requirements</h3>
            <p className="text-foreground/80 mb-4">
              You must be at least 17 years old to use Jet. The app contains references to alcohol and venue specials that may include alcoholic beverages. By using Jet, you confirm that you meet this age requirement.
            </p>

            <h3 className="text-xl font-semibold mb-3">3.2 Account Responsibilities</h3>
            <p className="text-foreground/80 mb-2">When creating an account, you agree to:</p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Keep your login credentials secure and confidential</li>
              <li>Not share your account with others or allow unauthorized access</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
              <li>Accept responsibility for all activities under your account</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">4. User Conduct</h2>
            <p className="text-foreground/80 mb-4">You agree to use Jet responsibly and lawfully. You shall NOT:</p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Use the service for any illegal or unauthorized purpose</li>
              <li>Violate any local, state, national, or international law</li>
              <li>Harass, abuse, threaten, or intimidate other users</li>
              <li>Post false, misleading, or defamatory content</li>
              <li>Impersonate any person or entity</li>
              <li>Attempt to gain unauthorized access to our systems or other user accounts</li>
              <li>Interfere with or disrupt the service or servers</li>
              <li>Transmit viruses, malware, or any harmful code</li>
              <li>Scrape, harvest, or collect user data without consent</li>
              <li>Use automated systems (bots, scrapers) to access the service</li>
              <li>Circumvent any security or access controls</li>
              <li>Use the service to promote competing products or services</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">5. User-Generated Content</h2>
            
            <h3 className="text-xl font-semibold mb-3">5.1 Your Content</h3>
            <p className="text-foreground/80 mb-4">
              You may submit content including reviews, ratings, profile information, and other materials (&quot;User Content&quot;). You retain ownership of your User Content but grant Jet a worldwide, non-exclusive, royalty-free license to use, display, reproduce, and distribute your User Content in connection with the service.
            </p>

            <h3 className="text-xl font-semibold mb-3">5.2 Content Standards</h3>
            <p className="text-foreground/80 mb-2">User Content must not:</p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Be false, misleading, or fraudulent</li>
              <li>Infringe on intellectual property rights</li>
              <li>Contain hate speech, discrimination, or harassment</li>
              <li>Include explicit, obscene, or offensive material</li>
              <li>Promote illegal activities or substances</li>
              <li>Contain personal information of others without consent</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-4">5.3 Content Removal</h3>
            <p className="text-foreground/80">
              We reserve the right to remove any User Content that violates these Terms or is otherwise objectionable, without prior notice.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">6. Location Services</h2>
            <p className="text-foreground/80 mb-4">
              Jet uses location data to provide core functionality. By using location features, you:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Consent to the collection of your precise location data</li>
              <li>Understand that location data is used to show nearby deals and send proximity alerts</li>
              <li>Acknowledge that background location may be used if enabled</li>
              <li>Can control location permissions through your device settings</li>
            </ul>
            <p className="text-foreground/80 mt-4">
              For full details on how we handle location data, please see our{" "}
              <Link to="/privacy-policy" className="text-primary hover:underline">
                Privacy Policy
              </Link>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">7. Subscriptions and Payments</h2>
            
            <h3 className="text-xl font-semibold mb-3">7.1 Premium Features</h3>
            <p className="text-foreground/80 mb-4">
              Jet offers premium subscription plans with enhanced features. Subscription terms, pricing, and features are displayed before purchase.
            </p>

            <h3 className="text-xl font-semibold mb-3">7.2 Billing</h3>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Subscriptions are billed in advance on a recurring basis (monthly or annually)</li>
              <li>Payment is processed through the App Store (iOS) or our payment provider (Stripe)</li>
              <li>Prices are subject to change with notice</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-4">7.3 Cancellation and Refunds</h3>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>You may cancel your subscription at any time</li>
              <li>Cancellation takes effect at the end of the current billing period</li>
              <li>Refunds are handled according to App Store policies or our refund policy</li>
              <li>No refunds are provided for partial billing periods</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">8. Intellectual Property</h2>
            <p className="text-foreground/80 mb-4">
              All content, features, functionality, trademarks, logos, and intellectual property in Jet are owned by us or our licensors and are protected by copyright, trademark, and other intellectual property laws.
            </p>
            <p className="text-foreground/80">
              You may not copy, modify, distribute, sell, or lease any part of our service or software without our written permission.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">9. Third-Party Content and Links</h2>
            <p className="text-foreground/80 mb-4">
              Jet may display content from or link to third-party websites, services, or venues. We are not responsible for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>The accuracy of venue information, deal details, or hours of operation</li>
              <li>The availability or honoring of deals by venues</li>
              <li>Content, privacy practices, or terms of third-party websites</li>
              <li>Any transactions between you and third-party venues</li>
            </ul>
            <p className="text-foreground/80 mt-4">
              Your interactions with venues and third parties are solely between you and them.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">10. Disclaimers</h2>
            <p className="text-foreground/80 mb-4">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DISCLAIM ALL WARRANTIES INCLUDING, BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE</li>
              <li>UNINTERRUPTED, SECURE, OR ERROR-FREE OPERATION</li>
              <li>ACCURACY, RELIABILITY, OR COMPLETENESS OF CONTENT</li>
              <li>THAT DEFECTS WILL BE CORRECTED</li>
              <li>THAT THE SERVICE IS FREE OF VIRUSES OR HARMFUL COMPONENTS</li>
            </ul>
            <p className="text-foreground/80 mt-4">
              Deal information is provided by venues and third parties. We do not guarantee the accuracy, availability, or validity of any deals displayed.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">11. Limitation of Liability</h2>
            <p className="text-foreground/80 mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, JET AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES</li>
              <li>LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES</li>
              <li>DAMAGES RESULTING FROM YOUR USE OR INABILITY TO USE THE SERVICE</li>
              <li>UNAUTHORIZED ACCESS TO OR ALTERATION OF YOUR DATA</li>
              <li>STATEMENTS OR CONDUCT OF ANY THIRD PARTY ON THE SERVICE</li>
            </ul>
            <p className="text-foreground/80 mt-4">
              IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID US IN THE PAST TWELVE (12) MONTHS, OR $100, WHICHEVER IS GREATER.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">12. Indemnification</h2>
            <p className="text-foreground/80">
              You agree to indemnify, defend, and hold harmless Jet and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from your use of the service, violation of these Terms, or infringement of any rights of another party.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">13. Termination</h2>
            
            <h3 className="text-xl font-semibold mb-3">13.1 By You</h3>
            <p className="text-foreground/80 mb-4">
              You may terminate your account at any time through Settings &gt; Delete Account, or by contacting us. Termination does not entitle you to a refund of any subscription fees.
            </p>

            <h3 className="text-xl font-semibold mb-3">13.2 By Us</h3>
            <p className="text-foreground/80 mb-4">
              We may suspend or terminate your account immediately, without prior notice, if you:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li>Violate these Terms</li>
              <li>Engage in fraudulent or illegal activity</li>
              <li>Create risk or legal exposure for us</li>
              <li>Have been inactive for an extended period</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-4">13.3 Effect of Termination</h3>
            <p className="text-foreground/80">
              Upon termination, your right to use the service ceases immediately. We may delete your account data in accordance with our Privacy Policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">14. Dispute Resolution</h2>
            
            <h3 className="text-xl font-semibold mb-3">14.1 Informal Resolution</h3>
            <p className="text-foreground/80 mb-4">
              Before filing a formal dispute, you agree to contact us first to attempt to resolve the issue informally.
            </p>

            <h3 className="text-xl font-semibold mb-3">14.2 Governing Law</h3>
            <p className="text-foreground/80 mb-4">
              These Terms are governed by the laws of the State of California, United States, without regard to conflict of law principles.
            </p>

            <h3 className="text-xl font-semibold mb-3">14.3 Jurisdiction</h3>
            <p className="text-foreground/80">
              Any disputes arising from these Terms shall be resolved in the courts located in Los Angeles County, California.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">15. General Provisions</h2>
            <ul className="list-disc pl-6 space-y-2 text-foreground/80">
              <li><strong>Entire Agreement:</strong> These Terms, together with the Privacy Policy, constitute the entire agreement between you and Jet.</li>
              <li><strong>Severability:</strong> If any provision is found unenforceable, the remaining provisions remain in effect.</li>
              <li><strong>Waiver:</strong> Failure to enforce any right does not waive that right.</li>
              <li><strong>Assignment:</strong> You may not assign these Terms without our consent. We may assign our rights freely.</li>
              <li><strong>Force Majeure:</strong> We are not liable for delays or failures due to circumstances beyond our control.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">16. Changes to Terms</h2>
            <p className="text-foreground/80">
              We reserve the right to modify these Terms at any time. Material changes will be communicated through the app or via email. The &quot;Last updated&quot; date will be revised accordingly. Continued use of Jet after changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4">17. Contact Information</h2>
            <p className="text-foreground/80 mb-4">
              For questions, concerns, or feedback about these Terms, please contact us:
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
          </section>

          <section className="mb-8 p-4 bg-muted/50 rounded-lg">
            <p className="text-foreground/80 text-sm">
              By using Jet, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service and our{" "}
              <Link to="/privacy-policy" className="text-primary hover:underline">
                Privacy Policy
              </Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
