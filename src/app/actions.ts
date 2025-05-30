
"use server";

import type { JiraCredentials } from '@/contexts/AuthContext';
import { generateTestCases, type GenerateTestCasesInput, type GenerateTestCasesOutput } from '@/ai/flows/generate-test-cases';
import { z } from 'zod';

// Placeholder for Jira Project data type
export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

// Placeholder for Jira Issue data type
export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  issueType: string;
  status: string;
  description?: string;
  acceptanceCriteria?: string;
}

// Schema for credentials to ensure they are passed correctly (though not used in placeholders)
const CredentialsSchema = z.object({
  jiraUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string(),
});

// --- Simulate API delay ---
const simulateDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


export async function fetchProjectsAction(credentials: JiraCredentials): Promise<JiraProject[]> {
  try {
    CredentialsSchema.parse(credentials); // Validate credentials format
    await simulateDelay(1000); // Simulate network latency
    
    // Placeholder data - In a real app, you would make an API call to Jira
    // e.g., `${credentials.jiraUrl}/rest/api/3/project`
    // using Basic Auth with email and apiToken
    console.log('Fetching projects from:', credentials.jiraUrl);
    return [
      { id: '10001', key: 'PROJA', name: 'Project Alpha' },
      { id: '10002', key: 'PROJB', name: 'Project Beta (Web)' },
      { id: '10003', key: 'PROJC', name: 'Project Charlie (Mobile App)' },
      { id: '10004', key: 'GAMMA', name: 'Gamma Initiative' },
    ];
  } catch (error) {
    console.error('Error fetching projects:', error);
    if (error instanceof z.ZodError) {
      throw new Error('Invalid credentials format.');
    }
    throw new Error('Failed to fetch projects. Please check your Jira connection and permissions.');
  }
}


const FetchIssuesParamsSchema = z.object({
  projectId: z.string(),
  page: z.number().min(1).optional().default(1),
  pageSize: z.number().min(1).max(50).optional().default(10),
});

export interface PaginatedIssuesResponse {
  issues: JiraIssue[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function fetchIssuesAction(
  credentials: JiraCredentials,
  params: z.infer<typeof FetchIssuesParamsSchema>
): Promise<PaginatedIssuesResponse> {
  try {
    CredentialsSchema.parse(credentials);
    const validatedParams = FetchIssuesParamsSchema.parse(params);
    
    await simulateDelay(1500);
    console.log('Fetching issues for project:', validatedParams.projectId, 'from:', credentials.jiraUrl, 'page:', validatedParams.page);

    // Placeholder data
    const allIssuesForProject: JiraIssue[] = Array.from({ length: 35 }, (_, i) => ({
      id: `${10100 + i}`,
      key: `${validatedParams.projectId}-10${i + 1}`,
      summary: `Issue summary for task ${i + 1} in project ${validatedParams.projectId}`,
      issueType: i % 3 === 0 ? 'Story' : i % 3 === 1 ? 'Task' : 'Bug',
      status: i % 4 === 0 ? 'To Do' : i % 4 === 1 ? 'In Progress' : i % 4 === 2 ? 'In Review' : 'Done',
      description: `This is a detailed description for issue ${validatedParams.projectId}-10${i + 1}. It outlines the requirements and goals. Users should be able to perform action X and expect result Y.`,
      acceptanceCriteria: i % 2 === 0 ? `1. System does A. \n2. User sees B. \n3. Performance is under 2s.` : undefined,
    }));
    
    const startIndex = (validatedParams.page - 1) * validatedParams.pageSize;
    const endIndex = startIndex + validatedParams.pageSize;
    const paginatedIssues = allIssuesForProject.slice(startIndex, endIndex);

    return {
      issues: paginatedIssues,
      total: allIssuesForProject.length,
      page: validatedParams.page,
      pageSize: validatedParams.pageSize,
      totalPages: Math.ceil(allIssuesForProject.length / validatedParams.pageSize),
    };
  } catch (error) {
    console.error('Error fetching issues:', error);
     if (error instanceof z.ZodError) {
      throw new Error('Invalid parameters or credentials format.');
    }
    throw new Error('Failed to fetch issues. Please check your Jira connection and project selection.');
  }
}


export async function generateTestCasesAction(input: GenerateTestCasesInput): Promise<GenerateTestCasesOutput> {
  // The AI flow `generateTestCases` is already a server function.
  // We can call it directly.
  // Add validation if needed, though the AI flow has its own Zod schema.
  try {
    console.log('Generating test cases for:', input.description?.substring(0, 50) + "...");
    // Add a small delay to simulate processing, as AI calls can take time
    await simulateDelay(2000 + Math.random() * 3000); // 2-5 seconds
    const result = await generateTestCases(input);
    if (result.length === 0) {
        // Simulate LLM returning empty if no criteria
        if (!input.description && !input.acceptanceCriteria) {
             return [];
        }
        // Simulate some basic cases if description is too short but not empty
        if (input.description && input.description.length < 20 && result.length === 0) {
             return [
                {
                    testCaseId: "DEMO-TEST-001",
                    testCaseName: "Basic Functionality Check",
                    description: "Verify the core feature works as described briefly.",
                    precondition: "System is accessible.",
                    testData: "N/A",
                    testSteps: ["1. Access the feature.", "2. Perform a basic operation."],
                    expectedResult: "The basic operation completes successfully.",
                    actualResult: "",
                    status: ""
                }
            ];
        }
    }
    return result;
  } catch (error) {
    console.error("Error in generateTestCasesAction:", error);
    // Consider more specific error handling or re-throwing
    throw new Error("Failed to generate test cases due to an AI processing error.");
  }
}

const AttachTestCasesParamsSchema = z.object({
  issueKey: z.string(),
  testCases: z.array(z.object({ // Simplified TestCase schema for this action
    testCaseId: z.string(),
    testCaseName: z.string(),
    // ... other fields if needed for attachment
  })),
  attachmentType: z.enum(['csv', 'subtask']),
});

export async function attachTestCasesToJiraAction(
  credentials: JiraCredentials,
  params: z.infer<typeof AttachTestCasesParamsSchema>
): Promise<{ success: boolean; message: string }> {
  try {
    CredentialsSchema.parse(credentials);
    const validatedParams = AttachTestCasesParamsSchema.parse(params);

    await simulateDelay(2000);
    console.log(
      `Simulating attaching ${validatedParams.testCases.length} test cases to ${validatedParams.issueKey} as ${validatedParams.attachmentType} using ${credentials.jiraUrl}`
    );

    // Placeholder logic
    // In a real app:
    // If 'csv', generate CSV content and use Jira API to upload attachment.
    // If 'subtask', iterate testCases and use Jira API to create sub-tasks.
    
    return {
      success: true,
      message: `Successfully simulated attaching ${validatedParams.testCases.length} test cases to ${validatedParams.issueKey} as ${validatedParams.attachmentType}.`,
    };
  } catch (error) {
    console.error('Error attaching test cases:', error);
    if (error instanceof z.ZodError) {
      throw new Error('Invalid parameters or credentials format for attaching test cases.');
    }
    throw new Error('Failed to attach test cases to Jira.');
  }
}
