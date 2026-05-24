import Link from "next/link";

export const metadata = { title: "Privacy Policy — The Third Eye" };

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background-base py-16 px-8">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="text-text-muted text-sm font-mono hover:text-text-secondary transition-colors"
        >
          ← The Third Eye
        </Link>

        <h1 className="font-display text-2xl font-semibold text-text-primary mt-8 mb-2">
          Privacy Policy
        </h1>
        <p className="text-text-muted text-sm font-mono mb-10">Last updated: May 2025</p>

        <div className="space-y-8 text-text-secondary text-sm leading-relaxed">
          <section>
            <h2 className="text-text-primary font-semibold mb-2">Overview</h2>
            <p>
              The Third Eye is a personal AI operating system. This application is self-hosted and
              intended for use by the account owner only. No data is sold or shared with third
              parties.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Data We Collect</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Google account name, email, and profile photo (via Google Sign-In)</li>
              <li>Messages and queries you send to the assistant</li>
              <li>Documents and files you upload to the knowledge base</li>
              <li>Tasks and notes you create</li>
            </ul>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">How We Use Your Data</h2>
            <p>
              All data is stored in your self-hosted backend and is used solely to provide the
              the service to you. Your data is never shared with third parties except as
              required to fulfill requests (e.g., forwarding a query to an AI model provider).
            </p>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Third-Party Services</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Google OAuth — for authentication only</li>
              <li>Anthropic / OpenAI — for AI model inference</li>
              <li>Vercel — for frontend hosting</li>
            </ul>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Data Retention</h2>
            <p>
              Data is retained as long as your account exists. You can delete your data at any
              time by removing it through the application or contacting the administrator.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Contact</h2>
            <p>
              For any privacy-related questions, contact{" "}
              <a
                href="mailto:anchit.tandon@gmail.com"
                className="text-accent-blue hover:underline"
              >
                anchit.tandon@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
