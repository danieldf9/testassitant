
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
  prompt: `You are an expert Jira project planner. Your task is to analyze the provided requirements document (PDF) for the project "{{projectName}}" (key: {{projectKey}}) and break it down into a structured hierarchy of Jira tickets: Epics, Stories, Tasks, and Sub-tasks.

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
1.  **Identify Major Features/Themes as Epics:** These are large bodies of work. Each epic should have a clear summary and a description explaining its overall goal.
2.  **Break Down Epics into User Stories or Tasks:**
    *   **Stories:** For user-centric features. A story should clearly state who wants what and why (e.g., "As a [user role], I want [feature] so that [benefit]"). Include acceptance criteria if discernible from the document.
    *   **Tasks:** For specific pieces of work that are not necessarily user-facing but are required to deliver a feature or epic.
3.  **Decompose Stories/Tasks into Sub-tasks:** These are smaller, actionable steps required to complete a story or task.
4.  **Structure:** Provide the output as a JSON array. Each element can be an epic. Epics can have a 'children' array containing stories or tasks. Stories/tasks can also have a 'children' array for their sub-tasks.
5.  **Ticket Details:**
    *   `type`: Must be one of "Epic", "Story", "Task", "Sub-task".
    *   `summary`: A concise and descriptive summary. For epics and top-level stories/tasks, try to make them unique.
    *   `description`: A detailed description derived from the document. For stories, if possible, include acceptance criteria within the description or as a separate list if the schema allows.
    *   `suggestedId`: (Optional) For Epics and top-level Stories/Tasks, you can suggest a Jira-like ID using the project key (e.g., "{{projectKey}}-1", "{{projectKey}}-2"). Do not add this for sub-tasks. Ensure these are for reference and the actual ID will be assigned by Jira.
6.  **Completeness:** Be thorough. Try to capture all distinct pieces of work mentioned or implied in the document. If the document is vague, make reasonable assumptions but clearly state them in the descriptions if necessary.
7.  **Clarity:** Ensure summaries and descriptions are clear, actionable, and reflect the content of the document.
8.  **Format:** Ensure the output strictly adheres to the JSON schema provided for 'AnalyzeDocumentOutputSchema'. The root should be an array of tickets.

Example of desired structure:
[
  {
    "type": "Epic",
    "summary": "User Authentication System",
    "description": "Implement a complete user authentication and authorization system.",
    "suggestedId": "{{projectKey}}-100",
    "children": [
      {
        "type": "Story",
        "summary": "As a user, I want to be able to register for a new account",
        "description": "Users should be able to create a new account using their email and a password. Acceptance Criteria: 1. User provides valid email. 2. Password meets complexity requirements. 3. User receives confirmation email.",
        "children": [
          { "type": "Sub-task", "summary": "Design registration UI", "description": "Create wireframes and mockups for the registration page." },
          { "type": "Sub-task", "summary": "Develop registration API endpoint", "description": "Implement the backend logic for account creation." }
        ]
      }
    ]
  }
]

Analyze the document and generate the Jira ticket structure.
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
      // Handle cases where the LLM might return an empty or undefined output,
      // though the output schema should guide it.
      console.warn('AI analysis returned no output for document:', input.documentDataUri.substring(0,50) + "...");
      return [];
    }
    return output;
  }
);
