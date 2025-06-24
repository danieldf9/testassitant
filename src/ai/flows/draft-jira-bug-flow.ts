
'use server';
/**
 * @fileOverview AI flow to draft a Jira bug report from user input.
 *
 * - draftJiraBug - A function that takes bug details, returns a structured bug draft.
 * - DraftJiraBugInput - The input type for the draftJiraBug function.
 * - DraftJiraBugOutput - The return type for the draftJiraBug function.
 */

import {ai} from '@/ai/genkit';
import { DraftJiraBugInputSchema, DraftJiraBugOutputSchema, type DraftJiraBugInput, type DraftJiraBugOutput } from '@/lib/schemas';

export async function draftJiraBug(input: DraftJiraBugInput): Promise<DraftJiraBugOutput> {
  return draftJiraBugFlow(input);
}

const draftJiraBugPrompt = ai.definePrompt({
  name: 'draftJiraBugPrompt',
  input: {schema: DraftJiraBugInputSchema},
  output: {schema: DraftJiraBugOutputSchema},
  prompt: `You are an expert Jira Bug Reporter. Your task is to analyze the provided descriptions of actual and expected behavior, environment hint, and attachment information to create a well-structured Jira bug report draft.

Project Key: {{projectKey}}

User's Description of Actual Behaviour:
{{{actualBehaviour}}}

User's Description of Expected Behaviour:
{{{expectedBehaviour}}}

User's Environment Hint: {{#if environmentHint}}"{{environmentHint}}"{{else}}None provided{{/if}}
{{#if attachmentFilename}}
Attachment: {{attachmentFilename}}
{{/if}}

Instructions:
1.  **Generate a Concise Summary:** Create a brief, descriptive summary (title) for the bug. Max 10-15 words. It should clearly differentiate the actual from the expected result.
2.  **Identify the Environment:**
    *   Examine the "Actual Behaviour" for explicit mentions of an environment (e.g., "in Production", "on QA server", "Staging", "Dev").
    *   If an environment is found, use that.
    *   If no environment is mentioned, use the "User's Environment Hint".
    *   If neither is available, default to "QA".
    *   Set the 'identifiedEnvironment' field in the output to this value (e.g., "QA", "PROD", "Staging", "Development", or the one found).
3.  **Extract Steps to Reproduce:**
    *   Analyze the "Actual Behaviour" description to identify clear, actionable steps that someone could follow to reproduce the bug.
    *   If no clear steps are found, state "Steps to reproduce are unclear from the description." or try to infer logical steps if possible, clearly marking them as inferred (e.g. "Inferred: 1. User navigates to X page...").
4.  **Format the Description (Markdown):**
    *   Construct the 'descriptionMarkdown' field. It MUST be valid Markdown and include the following sections IN THIS ORDER, each starting with a Level 2 Markdown Heading (##):
        *   **## Steps to Reproduce:** List the extracted steps as a numbered list.
        *   **## Actual Result:** Use the "User's Description of Actual Behaviour" to write a clear, factual statement of what is currently happening.
        *   **## Expected Result:** Use the "User's Description of Expected Behaviour" to write a clear statement of what should be happening.
        *   **## Environment:** State the environment identified in step 2 (e.g., "Environment: QA").
        {{#if attachmentFilename}}
        *   **## Attachment(s):** List the provided attachment filename (e.g., "- {{attachmentFilename}}"). If no attachment, omit this section.
        {{/if}}
5.  **Attachment Name:**
    *   If 'attachmentFilename' was provided in the input, set the 'attachmentName' field in the output to this filename. Otherwise, omit 'attachmentName'.

Ensure the output strictly adheres to the 'DraftJiraBugOutputSchema'. The 'descriptionMarkdown' field is crucial and must contain all specified ## sections with their content.
If the input descriptions are very short or unclear, do your best to create a meaningful bug report, explicitly stating any assumptions or missing information within the 'descriptionMarkdown'.
Example for 'descriptionMarkdown':
\`\`\`markdown
## Steps to Reproduce
1. Navigate to https://example.com/dashboard.
2. Attempt to click the "Login with SSO" button.
3. Observe browser console for network activity.

## Actual Result
The login button is unresponsive when clicked. The button visually depresses but no network activity occurs, and the user remains on the dashboard. This started happening after the new SSO integration was deployed yesterday.

## Expected Result
Clicking the "Login with SSO" button should initiate a login attempt, redirect the user to the SSO provider, and then log them into the application.

## Environment
Environment: PROD

## Attachment(s)
- login_issue_screenshot.png
\`\`\`
Provide ONLY the JSON output.
`,
});

const draftJiraBugFlow = ai.defineFlow(
  {
    name: 'draftJiraBugFlow',
    inputSchema: DraftJiraBugInputSchema,
    outputSchema: DraftJiraBugOutputSchema,
  },
  async (input) => {
    const {output} = await draftJiraBugPrompt(input);
    if (!output) {
      console.warn('AI bug drafting returned no output for:', input.actualBehaviour.substring(0,50) + "...");
      // Return a default error structure or throw
      return {
        summary: "Error: AI failed to draft bug report",
        descriptionMarkdown: "## Steps to Reproduce\n1. Unknown\n\n## Actual Result\nCould not process the bug description.\n\n## Expected Result\nCould not process the bug description.\n\n## Environment\nUnknown",
        identifiedEnvironment: input.environmentHint || "Unknown",
      };
    }
    return output;
  }
);
