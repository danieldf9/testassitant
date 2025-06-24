
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

export const GenerateTestCasesInputSchema = z.object({
  description: z.string().describe('The description of the Jira ticket.'),
  acceptanceCriteria: z.string().optional().describe('The acceptance criteria of the Jira ticket.'),
});
export type GenerateTestCasesInput = z.infer<typeof GenerateTestCasesInputSchema>;

export const GenerateTestCasesOutputSchema = z.array(TestCaseSchema).describe('An array of generated test cases.');
export type GenerateTestCasesOutput = z.infer<typeof GenerateTestCasesOutputSchema>;


// Schemas for Document Analysis and Jira Ticket Drafting
const BaseDraftTicketSchema = z.object({
  type: z.enum(['Epic', 'Story', 'Task', 'Sub-task', 'Bug']).describe('The type of Jira issue (Epic, Story, Task, Sub-task, Bug).'),
  summary: z.string().describe('A concise summary for the Jira ticket.'),
  description: z.string().describe('A detailed description for the Jira ticket, outlining requirements or goals. This should NOT include acceptance criteria.'),
  acceptanceCriteria: z.string().optional().describe('Specific, measurable, achievable, relevant, and testable acceptance criteria for the ticket.'),
  suggestedId: z.string().optional().describe('An optional AI-suggested Jira-like ID (e.g., PROJECTKEY-123), primarily for epics or top-level stories/tasks for reference. Not for sub-tasks.'),
});

// Recursive schema for children
export type DraftTicketRecursive = z.infer<typeof BaseDraftTicketSchema> & {
  children?: DraftTicketRecursive[];
};

export const DraftTicketSchema: z.ZodType<DraftTicketRecursive> = BaseDraftTicketSchema.extend({
  children: z.lazy(() => DraftTicketSchema.array().optional()),
});


// Schemas for Drafting Jira Bug Reports
export const DraftJiraBugInputSchema = z.object({
  rawDescription: z.string().describe('The raw text description of the bug provided by the user. May include URLs or pasted content.'),
  environmentHint: z.string().optional().describe('A hint for the environment (e.g., QA, PROD, Staging, Development). The AI should try to confirm or override this based on rawDescription.'),
  attachmentFilename: z.string().optional().describe('The filename of the attachment, if any.'),
  projectKey: z.string().describe('The key of the Jira project (e.g., PROJ).'),
});
export type DraftJiraBugInput = z.infer<typeof DraftJiraBugInputSchema>;

export const DraftJiraBugOutputSchema = z.object({
  summary: z.string().describe('A concise, AI-generated summary/title for the bug report.'),
  descriptionMarkdown: z.string().describe('A detailed, AI-generated description of the bug in Markdown format. This should include sections like "## Issue", "## Environment", "## Steps to Reproduce".'),
  identifiedEnvironment: z.string().describe('The environment identified or confirmed by the AI (e.g., QA, PROD, Staging, Development).'),
  attachmentName: z.string().optional().describe('The name of the attachment to be listed in the description (if provided in input).'),
});
export type DraftJiraBugOutput = z.infer<typeof DraftJiraBugOutputSchema>;

// Schema for data to be stored in localStorage for bug templates
export const LocalStorageBugTemplateSchema = z.object({
  projectId: z.string(),
  summary: z.string(),
  rawDescription: z.string(), // Store the user's original raw input
  environment: z.string(),
  // We don't store attachment info in the template, as that's unique per bug report
});
export type LocalStorageBugTemplate = z.infer<typeof LocalStorageBugTemplateSchema>;

// Schema for creating a bug in Jira (used by createJiraBugInJiraAction)
export const CreateJiraBugPayloadSchema = z.object({
    projectId: z.string().describe("The Jira Project ID where the bug will be created."),
    summary: z.string().describe("The summary/title of the bug."),
    descriptionMarkdown: z.string().describe("The full bug description in Markdown format (will be converted to ADF)."),
    identifiedEnvironment: z.string().describe("The environment where the bug was observed."),
});
export type CreateJiraBugPayload = z.infer<typeof CreateJiraBugPayloadSchema>;
