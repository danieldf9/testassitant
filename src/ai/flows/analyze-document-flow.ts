
'use server';
/**
 * @fileOverview Analyzes a requirement document (PDF) and drafts a hierarchical structure of Jira tickets.
 *
 * - analyzeDocument - A function that takes a PDF document and project context, returns drafted Jira tickets.
 * - AnalyzeDocumentInput - The input type for the analyzeDocument function.
 * - AnalyzeDocumentOutput - The return type for the analyzeDocument function.
 */

import {ai} from '@/ai/genkit';
import { AnalyzeDocumentInputSchema, AnalyzeDocumentOutputSchema, type AnalyzeDocumentInput, type AnalyzeDocumentOutput } from '@/lib/schemas';

export async function analyzeDocument(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentOutput> {
  return analyzeDocumentFlow(input);
}

const analyzeDocumentPrompt = ai.definePrompt({
  name: 'analyzeDocumentPrompt',
  input: {schema: AnalyzeDocumentInputSchema},
  output: {schema: AnalyzeDocumentOutputSchema},
  prompt: `You are an expert Jira project planner. Your task is to analyze the provided requirements document (PDF) for the project "{{projectName}}" (key: {{projectKey}}) and break it down into a structured hierarchy of Jira tickets: Epics, Stories, Tasks, Sub-tasks, and Bugs. The goal is to produce tickets that are ready for development with minimal further clarification.

Document Content:
{{media url=documentDataUri}}

Project Context:
- Project Name: {{projectName}}
- Project Key: {{projectKey}}
{{#if userPersona}}
- Target User Persona: {{{userPersona}}}
{{/if}}
{{#if outputFormatPreference}}
- User Output Preference: {{{outputFormatPreference}}}
{{/if}}

Instructions:
1.  **Identify Major Features/Themes as Epics:** These are large bodies of work. Each epic should have a clear summary and a comprehensive description. For Epics, do NOT use the 'acceptanceCriteria' field; instead, include any high-level goals or success conditions within the main 'description' field.
2.  **Break Down Epics into User Stories or Tasks:**
    *   **Stories:** For user-centric features. The 'description' field **must** clearly state who wants what and why (e.g., "As a [user role], I want [feature] so that [benefit]") and include any other narrative details. The 'description' field **must be detailed enough** for a developer to understand the feature's scope and purpose. **Crucially, for every Story, generate a detailed list of Acceptance Criteria and place it ONLY in the 'acceptanceCriteria' field.**
    *   **Tasks:** For specific pieces of work that are not necessarily user-facing. The 'description' field **must be technically detailed**. If applicable, include **detailed Acceptance Criteria ONLY in the 'acceptanceCriteria' field** for tasks as well.
    *   **Bugs:** If the document describes existing issues, create Bug tickets. The 'description' should include steps to reproduce, actual result, and expected result. Do NOT use the 'acceptanceCriteria' field for Bugs.
3.  **Decompose Stories/Tasks into Sub-tasks:** These are smaller, actionable steps required to complete a story or task. The 'description' field for sub-tasks should be concise and clearly state the work item. For Sub-tasks, do NOT use the 'acceptanceCriteria' field.
4.  **Structure:** Provide the output as a JSON array. Each element can be an epic. Epics can have a 'children' array containing stories or tasks. Stories/tasks can also have a 'children' array for their sub-tasks.
5.  **Ticket Details (Ensure comprehensiveness for development):**
    *   \`type\`: Must be one of "Epic", "Story", "Task", "Sub-task", "Bug".
    *   \`summary\`: A concise and descriptive summary (e.g., "User Registration: Implement email/password signup").
    *   \`description\`: A **comprehensive and self-contained description** detailed enough for a developer to begin work. This field should contain the main narrative, goals, and details but **SHOULD NOT include the acceptance criteria unless the type is Epic, Sub-task, or Bug**.
    *   \`acceptanceCriteria\`: This field should ONLY be used for "Story" and "Task" issue types. For all other types ("Epic", "Sub-task", "Bug"), this field MUST be omitted from the JSON output.
    *   \`suggestedId\`: (Optional) For Epics and top-level Stories/Tasks, you can suggest a Jira-like ID using the project key (e.g., "{{projectKey}}-1", "{{projectKey}}-2"). Do not add this for sub-tasks.
6.  **Completeness & Detail:** Be thorough. Capture all distinct pieces of work. Prioritize detail and clarity in descriptions. If the document is vague, make reasonable assumptions and clearly state "Assumption: ..." within the ticket description.
7.  **Clarity & Actionability:** Ensure summaries and descriptions are clear and actionable.
8.  **Format:** Ensure the output strictly adheres to the JSON schema provided for 'AnalyzeDocumentOutputSchema'.

Example of a desired structure for a Story:
{
  "type": "Story",
  "summary": "User Profile: View and Edit Profile Information",
  "description": "As a registered user, I want to be able to view my profile information and edit certain fields so that I can keep my personal details up to date.",
  "acceptanceCriteria": "1. User can navigate to their profile page.\\n2. Profile page displays user details.\\n3. User can save changes.",
  "children": [
    { "type": "Sub-task", "summary": "FE: Design profile page UI", "description": "Create wireframes and mockups for the user profile page." }
  ]
}

Analyze the document and generate the Jira ticket structure based on ALL the above instructions.
`,
});

const analyzeDocumentFlow = ai.defineFlow(
  {
    name: 'analyzeDocumentFlow',
    inputSchema: AnalyzeDocumentInputSchema,
    outputSchema: AnalyzeDocumentOutputSchema,
  },
  async (input) => {
    const {output} = await analyzeDocumentPrompt(input);
    if (!output) {
      console.warn('AI analysis returned no output for document:', input.documentDataUri.substring(0,50) + "...");
      return [];
    }
    return output;
  }
);
