
import { z } from 'zod';

// Schemas for Test Case Generation
export const TestCaseSchema = z.object({
  testCaseId: z.string().describe('Unique identifier for the test case (e.g., PROJECTKEY-TEST-001).'),
  testCaseName: z.string().describe('Concise name describing the test case action and expected result.'),
  description: z.string().describe('One-sentence summary of the test case goal.'),
  precondition: z.string().describe('State or setup required before executing the test case.'),
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


// Schemas for Drafting Jira Bug Reports
export const DraftJiraBugInputSchema = z.object({
  rawDescription: z.string().describe("The user's free-form text description of the bug. It might contain reproduction steps, what happened, and what was expected."),
  environmentHint: z.string().optional().describe('A hint for the environment (e.g., QA, PROD, Staging, Development). The AI should try to confirm or override this based on rawDescription.'),
  attachmentFilename: z.string().optional().describe('The filename of the attachment, if any.'),
  projectKey: z.string().describe('The key of the Jira project (e.g., PROJ).'),
});
export type DraftJiraBugInput = z.infer<typeof DraftJiraBugInputSchema>;

export const DraftJiraBugOutputSchema = z.object({
  summary: z.string().describe('A concise, AI-generated summary/title for the bug report.'),
  descriptionMarkdown: z.string().describe('A detailed, AI-generated description of the bug in Markdown format. This should include sections like "## Steps to Reproduce", "## Actual Result", "## Expected Result".'),
  identifiedEnvironment: z.string().describe('The environment identified or confirmed by the AI (e.g., QA, PROD, Staging, Development).'),
  attachmentName: z.string().optional().describe('The name of the attachment to be listed in the description (if provided in input).'),
});
export type DraftJiraBugOutput = z.infer<typeof DraftJiraBugOutputSchema>;

// Schema for data to be stored in localStorage for bug templates
export const LocalStorageBugTemplateSchema = z.object({
  projectId: z.string(),
  rawDescription: z.string(),
  environment: z.string(),
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

// Schemas for Playwright Code Generation
export const PlaywrightSetupSchema = z.object({
  baseUrl: z.string().url({ message: "Please enter a valid URL." }).describe("The base URL of the application under test."),
  authFlow: z.string().optional().describe("A natural language description of the authentication process."),
  commonSelectors: z.string().optional().describe("Key-value pairs of common selectors (e.g., loginButton: '#login-btn'). One per line."),
  boilerplate: z.string().optional().describe("Boilerplate code to include at the start of every test file (e.g., imports, beforeEach)."),
});
export type PlaywrightSetup = z.infer<typeof PlaywrightSetupSchema>;

export const GeneratePlaywrightCodeInputSchema = z.object({
  testCases: GenerateTestCasesOutputSchema.describe("The array of test cases to convert to Playwright code."),
  playwrightSetup: PlaywrightSetupSchema.describe("The project-specific setup and context for Playwright."),
  projectName: z.string().describe("The name of the project for which the tests are being generated."),
});
export type GeneratePlaywrightCodeInput = z.infer<typeof GeneratePlaywrightCodeInputSchema>;

export const GeneratePlaywrightCodeOutputSchema = z.object({
    playwrightCode: z.string().describe("The generated Playwright test code as a single string."),
});
export type GeneratePlaywrightCodeOutput = z.infer<typeof GeneratePlaywrightCodeOutputSchema>;

// Schemas for Document Analysis
const DraftTicketRecursiveSchema: z.ZodType<DraftTicketRecursive> = z.lazy(() => z.object({
  type: z.enum(["Epic", "Story", "Task", "Sub-task", "Bug"]),
  summary: z.string(),
  description: z.string(),
  acceptanceCriteria: z.string().optional(),
  suggestedId: z.string().optional(),
  children: z.array(DraftTicketRecursiveSchema).optional(),
}));

export type DraftTicketRecursive = {
  type: "Epic" | "Story" | "Task" | "Sub-task" | "Bug";
  summary: string;
  description: string;
  acceptanceCriteria?: string;
  suggestedId?: string;
  children?: DraftTicketRecursive[];
};


export const AnalyzeDocumentInputSchema = z.object({
  documentDataUri: z.string().describe("The PDF document content as a Base64-encoded data URI."),
  projectKey: z.string(),
  projectName: z.string(),
  userPersona: z.string().optional().describe("An optional hint about the target user persona to guide ticket creation."),
  outputFormatPreference: z.string().optional().describe("An optional hint about the desired output format (e.g., 'focus on user stories', 'create granular sub-tasks')."),
});
export type AnalyzeDocumentInput = z.infer<typeof AnalyzeDocumentInputSchema>;


export const AnalyzeDocumentOutputSchema = z.array(DraftTicketRecursiveSchema).describe("A hierarchical array of drafted Jira tickets (Epics, Stories, Tasks, etc.).");
export type AnalyzeDocumentOutput = z.infer<typeof AnalyzeDocumentOutputSchema>;

export const CreateJiraTicketsInputSchema = z.object({
    projectId: z.string(),
    projectKey: z.string(),
    tickets: AnalyzeDocumentOutputSchema,
});
export type CreateJiraTicketsInput = z.infer<typeof CreateJiraTicketsInputSchema>;
