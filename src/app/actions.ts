
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

// Schema for credentials to ensure they are passed correctly
const CredentialsSchema = z.object({
  jiraUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string(),
});

// NOTE: The specific custom field ID for "Acceptance Criteria" can vary significantly
// between Jira instances. 'customfield_10009' is a common placeholder pattern,
// but you may need to identify the correct ID for your Jira setup.
// You can find this by inspecting an issue's JSON response (add /rest/api/3/issue/{issueKey}?expand=names to your Jira URL)
// and looking for the field that holds acceptance criteria.
const ACCEPTANCE_CRITERIA_CUSTOM_FIELD_ID = 'customfield_10009';


// Helper function to extract text from Atlassian Document Format (ADF)
function extractTextFromADF(adf: any): string {
  if (!adf) return '';
  // If it's already a plain string (e.g. old Jira description field), return it
  if (typeof adf === 'string') return adf;

  // If it's not an object or doesn't have content, it's not ADF we can parse simply
  if (typeof adf !== 'object' || !adf.content || !Array.isArray(adf.content)) {
    return '';
  }

  let textContent = '';
  function traverseNodes(nodes: any[]) {
    for (const node of nodes) {
      if (node.type === 'text' && node.text) {
        textContent += node.text;
      }
      if (node.content && Array.isArray(node.content)) {
        traverseNodes(node.content);
      }
      // Add a newline after paragraphs for readability, if not the last block
      if (node.type === 'paragraph' && textContent.length > 0 && !textContent.endsWith('\n\n')) {
         if (textContent.trim().length > 0 && !textContent.endsWith('\n')) {
           textContent += '\n';
         }
      }
    }
  }
  traverseNodes(adf.content);
  return textContent.trim().replace(/\s+\n/g, '\n'); // Clean up extra spaces before newlines and multiple newlines
}


export async function fetchProjectsAction(credentials: JiraCredentials): Promise<JiraProject[]> {
  try {
    const validatedCredentials = CredentialsSchema.parse(credentials);
    const { jiraUrl, email, apiToken } = validatedCredentials;

    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
    const response = await fetch(`${jiraUrl}/rest/api/3/project`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Jira API Error (fetchProjects):', response.status, errorData);
      throw new Error(`Failed to fetch projects from Jira. Status: ${response.status}. ${errorData}`);
    }

    const projectsData: any[] = await response.json();
    return projectsData.map(project => ({
      id: project.id,
      key: project.key,
      name: project.name,
    }));

  } catch (error) {
    console.error('Error in fetchProjectsAction:', error);
    if (error instanceof z.ZodError) {
      throw new Error('Invalid credentials format.');
    }
    if (error instanceof Error) {
        throw error;
    }
    throw new Error('An unexpected error occurred while fetching projects.');
  }
}


const FetchIssuesParamsSchema = z.object({
  projectId: z.string(), // In Jira, we often use project KEY not ID for JQL
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
    const validatedCredentials = CredentialsSchema.parse(credentials);
    const validatedParams = FetchIssuesParamsSchema.parse(params);
    
    const { jiraUrl, email, apiToken } = validatedCredentials;
    const { projectId, page, pageSize } = validatedParams; // projectId here is actually projectKey

    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
    const startAt = (page - 1) * pageSize;
    
    // Fetch the project object to get its key if projectId is an ID.
    // However, the current UI passes project.id which is correct for selection.
    // For JQL, it's usually `project = "PROJECT_KEY"`. The `projectId` passed from frontend is the project ID.
    // We need the project key for JQL. Let's assume projectId is the KEY for now as per placeholder.
    // If projectId is numeric ID, we'd need to fetch project details first or adjust JQL.
    // The ProjectSelector uses project.id which is numeric.
    // To ensure compatibility, it's better to fetch project details IF projectId is numeric OR change ProjectSelector to pass key.
    // Simpler: JQL supports project ID: `project = ${projectId}` where projectId is the numeric ID.

    const jql = `project = ${projectId} ORDER BY created DESC`;
    const fields = `summary,issuetype,status,description,${ACCEPTANCE_CRITERIA_CUSTOM_FIELD_ID}`;
    
    const apiUrl = `${jiraUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${pageSize}&fields=${fields}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Jira API Error (fetchIssues):', response.status, errorData);
      throw new Error(`Failed to fetch issues. Status: ${response.status}. ${errorData}`);
    }

    const issuesData: any = await response.json();
    
    const mappedIssues: JiraIssue[] = issuesData.issues.map((issue: any) => ({
      id: issue.id,
      key: issue.key,
      summary: issue.fields.summary,
      issueType: issue.fields.issuetype?.name || 'Unknown',
      status: issue.fields.status?.name || 'Unknown',
      description: issue.fields.description ? extractTextFromADF(issue.fields.description) : undefined,
      acceptanceCriteria: issue.fields[ACCEPTANCE_CRITERIA_CUSTOM_FIELD_ID] ? extractTextFromADF(issue.fields[ACCEPTANCE_CRITERIA_CUSTOM_FIELD_ID]) : undefined,
    }));

    return {
      issues: mappedIssues,
      total: issuesData.total,
      page: page, // Current page
      pageSize: pageSize,
      totalPages: Math.ceil(issuesData.total / pageSize),
    };

  } catch (error) {
    console.error('Error in fetchIssuesAction:', error);
     if (error instanceof z.ZodError) {
      throw new Error('Invalid parameters or credentials format.');
    }
    if (error instanceof Error) {
        throw error;
    }
    throw new Error('An unexpected error occurred while fetching issues.');
  }
}


export async function generateTestCasesAction(input: GenerateTestCasesInput): Promise<GenerateTestCasesOutput> {
  try {
    console.log('Generating test cases for:', input.description?.substring(0, 50) + "...");
    // AI call can take time, direct call to Genkit flow.
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
                    testCaseId: "DEMO-AI-001", // Changed ID to avoid conflict with actual test data
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
    if (error instanceof Error) {
        throw new Error(`Failed to generate test cases: ${error.message}`);
    }
    throw new Error("Failed to generate test cases due to an AI processing error.");
  }
}

const AttachTestCasesParamsSchema = z.object({
  issueKey: z.string(),
  testCases: z.array(z.object({ 
    testCaseId: z.string(),
    testCaseName: z.string(),
  })),
  attachmentType: z.enum(['csv', 'subtask']),
});

export async function attachTestCasesToJiraAction(
  credentials: JiraCredentials,
  params: z.infer<typeof AttachTestCasesParamsSchema>
): Promise<{ success: boolean; message: string }> {
  try {
    const validatedCredentials = CredentialsSchema.parse(credentials);
    const validatedParams = AttachTestCasesParamsSchema.parse(params);

    // This remains a placeholder for actually attaching to Jira.
    // Real implementation would involve more Jira API calls.
    console.log(
      `Simulating attaching ${validatedParams.testCases.length} test cases to ${validatedParams.issueKey} as ${validatedParams.attachmentType} using ${validatedCredentials.jiraUrl}`
    );
    
    // Simulate an API call delay if you want, but it's not strictly necessary for placeholder
    // await new Promise(resolve => setTimeout(resolve, 1500));

    return {
      success: true,
      message: `Successfully simulated attaching ${validatedParams.testCases.length} test cases to ${validatedParams.issueKey} as ${validatedParams.attachmentType}. (This is a placeholder).`,
    };
  } catch (error) {
    console.error('Error attaching test cases:', error);
    if (error instanceof z.ZodError) {
      throw new Error('Invalid parameters or credentials format for attaching test cases.');
    }
     if (error instanceof Error) {
        throw new Error(`Failed to attach test cases to Jira: ${error.message}`);
    }
    throw new Error('Failed to attach test cases to Jira.');
  }
}

    