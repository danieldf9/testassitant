
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
  prompt: `You are an expert Jira Bug Reporter. Your task is to analyze the provided free-form bug description and other context to create a well-structured Jira bug report draft.

Project Key: {{projectKey}}

User's Bug Description:
{{{rawDescription}}}

User's Environment Hint: {{#if environmentHint}}"{{environmentHint}}"{{else}}None provided{{/if}}
{{#if attachmentFilename}}
Attachment: {{attachmentFilename}}
{{/if}}

Instructions:
1.  **Analyze the Description:** Read the user's bug description carefully. It contains the core information. You must intelligently parse it to extract the steps to reproduce, the actual result, and the expected result.
2.  **Generate a Concise Summary:** Create a brief, descriptive summary (title) for the bug. Max 10-15 words. It should clearly summarize the core problem.
3.  **Identify the Environment:**
    *   Examine the "User's Bug Description" for explicit mentions of an environment (e.g., "in Production", "on QA server", "Staging", "Dev").
    *   If an environment is found, use that.
    *   If no environment is mentioned, use the "User's Environment Hint".
    *   If neither is available, default to "QA".
    *   Set the 'identifiedEnvironment' field in the output to this value (e.g., "QA", "PROD", "Staging", "Development", or the one found).
4.  **Extract and Format Content for 'descriptionMarkdown':**
    *   Construct the 'descriptionMarkdown' field. It MUST be valid Markdown and include the following sections IN THIS ORDER, each starting with a Level 2 Markdown Heading (##):
        *   **## Environment:** State the environment identified in step 3 (e.g., "Environment: QA").
        *   **## Issue Description:** Provide a brief summary of the user's raw description, capturing the essence of the problem.
        *   **## Steps to Reproduce:** Based on your analysis of the description, list clear, numbered steps that someone could follow to reproduce the bug. If the user didn't provide explicit steps, infer logical steps from their description and list them. If no steps can be determined, state "Steps to reproduce were not clear from the description."
        *   **## Expected Result:** From the description, write a clear statement of what the user expected to happen.
        *   **## Actual Result:** From the description, write a clear, factual statement of what is currently happening.
        {{#if attachmentFilename}}
        *   **## Attachment(s):** List the provided attachment filename (e.g., "- {{attachmentFilename}}"). If no attachment, omit this section.
        {{/if}}
5.  **Attachment Name:**
    *   If 'attachmentFilename' was provided in the input, set the 'attachmentName' field in the output to this filename. Otherwise, omit 'attachmentName'.

Ensure the output strictly adheres to the 'DraftJiraBugOutputSchema'. The 'descriptionMarkdown' field is crucial and must contain all specified ## sections with their content.
Example for 'descriptionMarkdown':
\`\`\`markdown
## Environment
Environment: PROD

## Issue Description
When a user with a large report (over 50 rows) tries to export it to PDF, the download fails with a server error.

## Steps to Reproduce
1. Navigate to the user dashboard after logging in.
2. Click on the 'Export to PDF' button on the main report widget for a report containing more than 50 rows.
3. Observe the downloaded file.

## Expected Result
Clicking the 'Export to PDF' button should download a valid, viewable PDF document containing the report data.

## Actual Result
The downloaded file is a 0kb corrupted PDF that cannot be opened. The browser console shows a 500 internal server error for the download endpoint.

## Attachment(s)
- console_error_log.txt
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
      console.warn('AI bug drafting returned no output for:', input.rawDescription.substring(0,50) + "...");
      // Return a default error structure or throw
      return {
        summary: "Error: AI failed to draft bug report",
        descriptionMarkdown: "## Environment\nUnknown\n\n## Issue Description\nCould not process the bug description.\n\n## Steps to Reproduce\n1. Unknown\n\n## Expected Result\nCould not process the bug description.\n\n## Actual Result\nCould not process the bug description.",
        identifiedEnvironment: input.environmentHint || "Unknown",
      };
    }
    return output;
  }
);
