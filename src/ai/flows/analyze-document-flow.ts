
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
1.  **Identify Major Features/Themes as Epics:** These are large bodies of work. Each epic should have a clear summary and a comprehensive description (in the 'description' field) explaining its overall goal, benefits, and scope. The 'acceptanceCriteria' field for Epics can be a high-level summary of what success looks like or be omitted.
2.  **Break Down Epics into User Stories or Tasks:**
    *   **Stories:** For user-centric features. The 'description' field **must** clearly state who wants what and why (e.g., "As a [user role], I want [feature] so that [benefit]") and include any other narrative details. The 'description' field **must be detailed enough** for a developer to understand the feature's scope and purpose without needing to refer back to the main document extensively. **Crucially, for every Story, generate a detailed list of Acceptance Criteria and place it ONLY in the 'acceptanceCriteria' field.** These criteria should be specific, measurable, achievable, relevant, and testable. Format acceptance criteria clearly, for example, as a numbered or bulleted list. Example of 'acceptanceCriteria' content:
        "1. User can X.
        2. System does Y when Z occurs.
        3. Performance of action A is under N seconds."
    *   **Tasks:** For specific pieces of work that are not necessarily user-facing but are required to deliver a feature or epic. The 'description' field **must be technically detailed**, outlining what needs to be done. If applicable, include **detailed Acceptance Criteria ONLY in the 'acceptanceCriteria' field** for tasks as well, especially if they involve verifiable outcomes or technical deliverables. Use the same formatting for 'acceptanceCriteria' as for Stories.
    *   **Bugs:** If the document describes existing issues or defects, create Bug tickets. The 'description' should include steps to reproduce, actual result, and expected result. The 'acceptanceCriteria' field can be used for conditions of fix verification or be omitted.
3.  **Decompose Stories/Tasks into Sub-tasks:** These are smaller, actionable steps required to complete a story or task. The 'description' field for sub-tasks should be concise and clearly state the work item. 'acceptanceCriteria' for sub-tasks is usually not needed but can be added if specific testable outcomes exist.
4.  **Structure:** Provide the output as a JSON array. Each element can be an epic. Epics can have a 'children' array containing stories or tasks. Stories/tasks can also have a 'children' array for their sub-tasks.
5.  **Ticket Details (Ensure comprehensiveness for development):**
    *   \\\`type\\\`: Must be one of "Epic", "Story", "Task", "Sub-task", "Bug".
    *   \\\`summary\\\`: A concise and descriptive summary (e.g., "User Registration: Implement email/password signup"). For epics and top-level stories/tasks, try to make them unique.
    *   \\\`description\\\`: A **comprehensive and self-contained description** derived from the document, detailed enough for a developer to begin work. This field should contain the main narrative, goals, and details but **SHOULD NOT include the acceptance criteria**. For Bugs, it should contain reproduction steps, actual vs. expected results.
    *   \\\`acceptanceCriteria\\\`: (Optional) A list of specific, measurable, achievable, relevant, and testable acceptance criteria. Format as a multi-line string if needed. This field is primarily for Stories and Tasks.
    *   \\\`suggestedId\\\`: (Optional) For Epics and top-level Stories/Tasks, you can suggest a Jira-like ID using the project key (e.g., "{{projectKey}}-1", "{{projectKey}}-2"). Do not add this for sub-tasks. Ensure these are for reference and the actual ID will be assigned by Jira.
6.  **Completeness & Detail:** Be thorough. Capture all distinct pieces of work. Prioritize detail and clarity in descriptions and ensure acceptance criteria are placed in the correct field. If the document is vague on a specific point, make reasonable assumptions based on common practices for the described feature and clearly state "Assumption: ..." within the ticket description. The goal is to produce tickets that are as development-ready as possible.
7.  **Clarity & Actionability:** Ensure summaries, descriptions, and acceptance criteria are clear, actionable, and directly reflect the content of the document, expanded with necessary detail for implementation.
8.  **Format:** Ensure the output strictly adheres to the JSON schema provided for 'AnalyzeDocumentOutputSchema'. The root should be an array of tickets.

Example of desired structure for a Story:
{
  "type": "Story",
  "summary": "User Profile: View and Edit Profile Information",
  "description": "As a registered user, I want to be able to view my profile information and edit certain fields so that I can keep my personal details up to date.\\n\\nDetails:\\n- Editable fields: Full Name, Display Name, Profile Picture URL, Bio.\\n- Non-editable fields: Email, Join Date.",
  "acceptanceCriteria": "1. User can navigate to their profile page from the main menu.\\n2. Profile page displays Full Name, Display Name, Email, Join Date, Profile Picture, and Bio.\\n3. User sees an 'Edit Profile' button on their profile page.\\n4. Clicking 'Edit Profile' makes Full Name, Display Name, Profile Picture URL, and Bio editable.\\n5. User can save changes, and the updated information is reflected on their profile page.\\n6. Invalid input for Profile Picture URL (e.g., not a valid URL) shows an error and does not save.\\n7. Email and Join Date are displayed but are not editable.",
  "children": [
    { "type": "Sub-task", "summary": "FE: Design profile page UI", "description": "Create wireframes and mockups for the user profile page (view and edit modes)." },
    { "type": "Sub-task", "summary": "BE: Develop API endpoint for updating profile", "description": "Implement PUT /api/users/profile endpoint for updating user details." }
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

