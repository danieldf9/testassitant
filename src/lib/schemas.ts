
import { z } from 'zod';

// Schemas for Test Case Generation
export const TestCaseSchema = z.object({
  testCaseId: z.string().describe('Unique identifier for the test case (e.g., PROJECTKEY-TEST-001).'),
  testCaseName: z.string().describe('Concise name describing the test case action and expected result.'),
  description: z.string().describe('One-sentence summary of the test case goal.'),
  precondition: z.string().describe('State or setup required before executing the test case.'),
  testData: z.string().describe('Values or inputs to use for the test case.'),
  testSteps: z.array(z.string()).describe('Ordered list of steps to execute for the test case.'),
  expectedResult: z.string().describe('What should happen when the test steps are executed.'),
  actualResult: z.string().optional().describe('Actual outcome of the test case execution (leave blank initially).'),
  status: z.string().optional().describe('Status of the test case (e.g., Pass, Fail, Blocked; leave blank initially).'),
});

export const GenerateTestCasesOutputSchema = z.array(TestCaseSchema).describe('An array of generated test cases.');
export type GenerateTestCasesOutput = z.infer<typeof GenerateTestCasesOutputSchema>;


// Schemas for Document Analysis and Jira Ticket Drafting
const BaseDraftTicketSchema = z.object({
  type: z.enum(['Epic', 'Story', 'Task', 'Sub-task', 'Bug']).describe('The type of Jira issue (Epic, Story, Task, Sub-task, Bug).'),
  summary: z.string().describe('A concise summary for the Jira ticket.'),
  description: z.string().describe('A detailed description for the Jira ticket, outlining requirements, goals, or steps.'),
  suggestedId: z.string().optional().describe('An optional AI-suggested Jira-like ID (e.g., PROJECTKEY-123), primarily for epics or top-level stories/tasks for reference. Not for sub-tasks.'),
});

// Recursive schema for children
export type DraftTicketRecursive = z.infer<typeof BaseDraftTicketSchema> & {
  children?: DraftTicketRecursive[];
};

export const DraftTicketSchema: z.ZodType<DraftTicketRecursive> = BaseDraftTicketSchema.extend({
  children: z.lazy(() => DraftTicketSchema.array().optional()),
});

export const AnalyzeDocumentOutputSchema = z.array(DraftTicketSchema).describe('A hierarchical array of drafted Jira tickets (epics, stories, tasks, sub-tasks) based on the document analysis.');
export type AnalyzeDocumentOutput = z.infer<typeof AnalyzeDocumentOutputSchema>;

export const AnalyzeDocumentInputSchema = z.object({
  documentDataUri: z
    .string()
    .describe(
      "The content of the PDF document, as a data URI that must include a MIME type (application/pdf) and use Base64 encoding. Expected format: 'data:application/pdf;base64,<encoded_data>'."
    ),
  projectKey: z.string().describe('The key of the Jira project (e.g., PROJ) to provide context for ticket ID suggestions.'),
  projectName: z.string().describe('The name of the Jira project to provide context to the AI.'),
  userPersona: z.string().optional().describe('Optional: The primary user persona or role this document focuses on (e.g., "Project Manager", "Software Developer", "End User").'),
  outputFormatPreference: z.string().optional().describe('Optional: User preference for the output structure, e.g., "Focus on user stories under epics", "Detailed tasks for each feature".'),
});
export type AnalyzeDocumentInput = z.infer<typeof AnalyzeDocumentInputSchema>;

// Schema for creating tickets in Jira (will be used by createJiraTicketsAction)
// This is similar to AnalyzeDocumentOutputSchema but represents the state before creation.
export const CreateJiraTicketsInputSchema = z.object({
  projectId: z.string().describe("The Jira Project ID where tickets will be created."),
  projectKey: z.string().describe("The Jira Project Key."),
  tickets: AnalyzeDocumentOutputSchema,
});
export type CreateJiraTicketsInput = z.infer<typeof CreateJiraTicketsInputSchema>;
