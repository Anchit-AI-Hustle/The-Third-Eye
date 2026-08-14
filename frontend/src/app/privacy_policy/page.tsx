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
        <p className="text-text-muted text-sm font-mono mb-10">Last updated: August 2026</p>

        <div className="space-y-8 text-text-secondary text-sm leading-relaxed">
          <section>
            <h2 className="text-text-primary font-semibold mb-2">Overview</h2>
            <p>
              The Third Eye is a personal AI assistant. Each account&apos;s data belongs to that
              account holder and is used only to provide the service to them. We do not sell
              personal data, and we do not share it with third parties for advertising or any
              other purpose unrelated to running the product.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Data We Collect</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Google account name, email address, and profile photo (via Google Sign-In)</li>
              <li>Messages and queries you send to the assistant, and its replies</li>
              <li>Documents and files you upload to the knowledge base</li>
              <li>Tasks, notes, goals, reminders, and expense records you create</li>
              <li>Voice recordings you initiate, which are transcribed to text</li>
              <li>Google Workspace data you explicitly connect (see below)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Google User Data</h2>
            <p className="mb-3">
              Connecting Google is optional and separate from signing in. Signing in requests only
              your basic profile. Gmail and Calendar access is granted only if you complete the
              &ldquo;Connect Google&rdquo; step in Settings, and can be revoked at any time from
              that screen or from your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                className="text-accent-blue hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Account permissions page
              </a>
              . We request these scopes and use them only as described:
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <span className="font-mono text-xs">gmail.readonly</span> — to read messages you
                ask the assistant to summarise, search, or extract tasks from
              </li>
              <li>
                <span className="font-mono text-xs">gmail.send</span> — to send email on your
                behalf when you ask, and to deliver reminders you have scheduled
              </li>
              <li>
                <span className="font-mono text-xs">calendar.readonly</span> — to read your events
                when you ask about your schedule
              </li>
              <li>
                <span className="font-mono text-xs">calendar.events</span> — to create or update
                events when you ask
              </li>
            </ul>
            <p className="mt-3">
              Message and event content is fetched when a request needs it and is used to answer
              that request. It is not used to train any machine-learning model, is not sold, and is
              not transferred to anyone except the AI providers listed below, and only to the
              extent needed to answer your request.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">
              Limited Use of Google User Data
            </h2>
            <p>
              The Third Eye&apos;s use and transfer of information received from Google APIs
              adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="text-accent-blue hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. We do not use Google user data to develop,
              improve, or train generalised AI or machine-learning models. We do not allow humans
              to read your Google user data except with your explicit consent for a specific
              message, where it is necessary for security purposes such as investigating abuse, or
              where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">
              How We Protect Your Data
            </h2>
            <p className="mb-3">
              Sensitive data — Google OAuth tokens, message and calendar content, uploaded
              documents, and the contents of your conversations — is protected by the following
              controls:
            </p>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <span className="text-text-primary">Encryption in transit.</span> All traffic to
                the application and to every third-party API is served over TLS (HTTPS). The site
                is served with HTTP Strict Transport Security, so browsers refuse to connect over
                plaintext.
              </li>
              <li>
                <span className="text-text-primary">Encryption at rest.</span> Data is stored in a
                managed PostgreSQL database that encrypts data at rest.
              </li>
              <li>
                <span className="text-text-primary">
                  Additional encryption of Google credentials.
                </span>{" "}
                Google refresh tokens are encrypted with AES-256-GCM under a key held only in the
                server environment, before being written to the database. A copy of the database
                alone does not yield usable access to any Google account.
              </li>
              <li>
                <span className="text-text-primary">Access control.</span> Every table carries the
                owning account and has row-level security enabled, so the public API key shipped to
                browsers cannot read another account&apos;s rows. Privileged database credentials
                exist only in server-side code and are never sent to the browser.
              </li>
              <li>
                <span className="text-text-primary">Server-enforced identity.</span> The account a
                request acts for is taken from the verified session or a scoped API credential —
                never from the request body — so a caller cannot read or write another
                account&apos;s data by naming it.
              </li>
              <li>
                <span className="text-text-primary">Credential hygiene.</span> API credentials
                issued for automation are stored only as a SHA-256 hash, are limited to specific
                capabilities, and can be revoked individually.
              </li>
              <li>
                <span className="text-text-primary">Accountability controls.</span> Actions the
                assistant takes on your behalf are recorded in an append-only audit log visible to
                you, and a stop control halts all assistant activity on your account immediately.
              </li>
            </ul>
            <p className="mt-3">
              No system is perfectly secure, and we do not claim otherwise. If we become aware of a
              breach affecting your data, we will notify you at the email address on your account.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Third-Party Services</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>Google — sign-in, and Gmail/Calendar access if you connect it</li>
              <li>
                AI model providers (Anthropic, OpenAI, Google, Groq, and similar) — to generate
                responses and transcribe audio. Only the content needed to answer a given request
                is sent.
              </li>
              <li>Supabase — database and storage</li>
              <li>Vercel — application hosting</li>
              <li>Stripe — subscription payments. Card details are handled by Stripe; we never receive or store them.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Retention and Deletion</h2>
            <p>
              Data is retained while your account exists. You can delete individual items at any
              time from within the app. Deleting your account from Settings removes your records
              across every table that holds them, including your stored Google tokens, and cannot
              be undone. You can withdraw Gmail and Calendar access separately at any time from
              your Google Account permissions page, which immediately stops the stored token from
              granting any access.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Children</h2>
            <p>
              The Third Eye is not directed to children under 13, and we do not knowingly collect
              their personal data.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Changes</h2>
            <p>
              If this policy changes materially, the date at the top of this page will be updated.
              Continued use after a change constitutes acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-text-primary font-semibold mb-2">Contact</h2>
            <p>
              For any privacy-related question, or to request deletion of your data, contact{" "}
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
