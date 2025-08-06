
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, ExternalLink, KeyRound, Users, ListChecks } from "lucide-react";
import Link from "next/link";

export default function SetupPage() {
  return (
    <div className="container mx-auto max-w-3xl p-4 md:p-8">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Setup Test Assistant</CardTitle>
          <CardDescription className="text-lg text-muted-foreground">
            Follow these steps to connect Test Assistant to your Jira instance and start generating test cases.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-3 flex items-center">
              <KeyRound className="mr-2 h-6 w-6 text-primary" />
              1. Obtain a Jira API Token
            </h2>
            <p className="mb-2 text-foreground/90">
              Test Assistant requires an API token to securely connect to your Jira account. This token acts like a password for applications.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-4 text-foreground/80">
              <li>Log in to your Atlassian account that has access to your Jira instance.</li>
              <li>
                Navigate to API token management: Go to{' '}
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:text-primary/80 font-medium"
                >
                  Atlassian Account Settings &rarr; Security &rarr; API tokens <ExternalLink className="inline-block h-3 w-3 ml-1" />
                </a>.
              </li>
              <li>Click <span className="font-semibold">&quot;Create API token&quot;</span>.</li>
              <li>Give your token a descriptive label (e.g., "Test Assistant Token").</li>
              <li>Copy the generated token immediately. <strong className="text-destructive">You won&apos;t be able to see it again.</strong> Store it securely.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 flex items-center">
              <Users className="mr-2 h-6 w-6 text-primary" />
              2. Gather Your Jira Details
            </h2>
            <p className="mb-2 text-foreground/90">You&apos;ll need two more pieces of information:</p>
            <ul className="list-disc list-inside space-y-1 pl-4 text-foreground/80">
              <li>
                <span className="font-semibold">Jira URL:</span> This is the web address of your Jira instance (e.g., <code className="bg-muted px-1 py-0.5 rounded text-sm">https://your-org.atlassian.net</code> or <code className="bg-muted px-1 py-0.5 rounded text-sm">https://jira.yourcompany.com</code>).
              </li>
              <li>
                <span className="font-semibold">Jira Email Address:</span> The email address you use to log in to Jira.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 flex items-center">
              <ListChecks className="mr-2 h-6 w-6 text-primary" />
              3. Connect Test Assistant
            </h2>
            <p className="mb-2 text-foreground/90">
              Once you have your API token, Jira URL, and email:
            </p>
            <ul className="list-disc list-inside space-y-1 pl-4 text-foreground/80">
              <li>
                Go to the <Link href="/" className="text-primary underline hover:text-primary/80 font-medium">Test Assistant home page</Link>.
              </li>
              <li>You will be prompted to enter your Jira URL, email address, and the API token you generated.</li>
              <li>Fill in the details and click &quot;Connect&quot;.</li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Your credentials will be stored locally in your browser&apos;s localStorage for convenience. To clear them, use the "Disconnect Jira" button on the main page.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-3 flex items-center">
              <CheckCircle className="mr-2 h-6 w-6 text-primary" />
              4. You&apos;re Ready!
            </h2>
            <p className="text-foreground/90">
              After successful connection, you can select a project, view its issues, and start generating test cases with the power of AI.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              <strong>Important:</strong> Ensure the account associated with the API token has the necessary permissions in Jira to read project details and issues, and (if you plan to use the "Attach to Jira" feature fully) to create attachments or sub-tasks. Your Jira instance at <code className="bg-muted px-1 py-0.5 rounded text-sm">{`https://asudev.jira.com/`}</code> must be accessible from the environment where this application is hosted.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
