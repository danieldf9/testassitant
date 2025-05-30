
"use server";

import type { JiraCredentials } from '@/contexts/AuthContext';
import { generateTestCases, type GenerateTestCasesInput } from '@/ai/flows/generate-test-cases';
import { type GenerateTestCasesOutput, GenerateTestCasesOutputSchema } from '@/lib/schemas';
import { z } from 'zod';

// Updated JiraProject data type (if needed elsewhere, though not directly used in these changes)
export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

// Updated JiraIssue data type to include project information
export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  issueType: string;
  status: string;
  description?: string;
  acceptanceCriteria?: string;
  project: {
    id: string;
    key: string;
    name: string;
  };
}

// Schema for credentials to ensure they are passed correctly
const CredentialsSchema = z.object({
  jiraUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string(),
});

const ACCEPTANCE_CRITERIA_CUSTOM_FIELD_ID = 'customfield_10009';


function extractTextFromADF(adf: any): string {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
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
      if (node.type === 'paragraph' && textContent.length > 0 && !textContent.endsWith('\n\n')) {
         if (textContent.trim().length > 0 && !textContent.endsWith('\n')) {
           textContent += '\n';
         }
      }
    }
  }
  traverseNodes(adf.content);
  return textContent.trim().replace(/\s+\n/g, '\n');
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
    const validatedCredentials = CredentialsSchema.parse(credentials);
    const validatedParams = FetchIssuesParamsSchema.parse(params);
    
    const { jiraUrl, email, apiToken } = validatedCredentials;
    const { projectId, page, pageSize } = validatedParams;

    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
    const startAt = (page - 1) * pageSize;
    
    const jql = `project = ${projectId} ORDER BY created DESC`;
    // Added 'project' to fields
    const fields = `summary,issuetype,status,description,${ACCEPTANCE_CRITERIA_CUSTOM_FIELD_ID},project`; 
    
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
      project: { // Populate project details
        id: issue.fields.project.id,
        key: issue.fields.project.key,
        name: issue.fields.project.name,
      },
    }));

    return {
      issues: mappedIssues,
      total: issuesData.total,
      page: page,
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
    const result = await generateTestCases(input);
     if (result.length === 0) {
        if (!input.description && !input.acceptanceCriteria) {
             return [];
        }
        // Remove the demo data generation for short descriptions as per original logic.
        // This was a placeholder and might not be desired with real AI.
        // If you want to keep some fallback for very short/empty inputs, it can be added here.
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

// Updated schema to accept full test case data and project ID
const AttachTestCasesParamsSchema = z.object({
  issueKey: z.string(),
  testCases: GenerateTestCasesOutputSchema, // Use the schema for full test case data
  attachmentType: z.enum(['csv', 'subtask']),
  projectId: z.string(), // Project ID of the parent issue, for creating sub-tasks
});

function convertTestCasesToCsv(testCases: GenerateTestCasesOutput): string {
  if (!testCases || testCases.length === 0) return '';

  const escapeCsvField = (field: string | undefined): string => {
    if (field === undefined || field === null) return '';
    let strField = String(field);
    // If field contains comma, newline, or double quote, wrap in double quotes
    if (strField.includes(',') || strField.includes('\n') || strField.includes('"')) {
      // Escape existing double quotes by doubling them
      strField = strField.replace(/"/g, '""');
      return `"${strField}"`;
    }
    return strField;
  };
  
  const headers = ['Test Case ID', 'Test Case Name', 'Description', 'Precondition', 'Test Data', 'Test Steps', 'Expected Result'];
  const rows = testCases.map(tc => [
    escapeCsvField(tc.testCaseId),
    escapeCsvField(tc.testCaseName),
    escapeCsvField(tc.description),
    escapeCsvField(tc.precondition),
    escapeCsvField(tc.testData),
    escapeCsvField(tc.testSteps.join('\n')), // Join steps with newline
    escapeCsvField(tc.expectedResult),
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

export async function attachTestCasesToJiraAction(
  credentials: JiraCredentials,
  params: z.infer<typeof AttachTestCasesParamsSchema>
): Promise<{ success: boolean; message: string }> {
  try {
    const validatedCredentials = CredentialsSchema.parse(credentials);
    const validatedParams = AttachTestCasesParamsSchema.parse(params);
    const { jiraUrl, email, apiToken } = validatedCredentials;
    const { issueKey, testCases, attachmentType, projectId } = validatedParams;

    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

    if (attachmentType === 'csv') {
      const csvContent = convertTestCasesToCsv(testCases);
      if (!csvContent) {
        return { success: false, message: 'No test cases to convert to CSV.' };
      }

      const formData = new FormData();
      const csvBlob = new Blob([csvContent], { type: 'text/csv' });
      const fileName = `${issueKey}-test-cases.csv`;
      formData.append('file', csvBlob, fileName);

      const attachResponse = await fetch(`${jiraUrl}/rest/api/3/issue/${issueKey}/attachments`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'X-Atlassian-Token': 'no-check', // Required for multipart/form-data
        },
        body: formData,
      });

      if (!attachResponse.ok) {
        const errorText = await attachResponse.text();
        console.error(`Jira API Error (attach CSV for ${issueKey}):`, attachResponse.status, errorText);
        throw new Error(`Failed to attach CSV to ${issueKey}. Status: ${attachResponse.status}. ${errorText}`);
      }
      const attachmentResult = await attachResponse.json();
      return { success: true, message: `Successfully attached ${attachmentResult.length > 0 ? attachmentResult[0].filename : 'test cases'} as CSV to ${issueKey}.` };

    } else if (attachmentType === 'subtask') {
      let successCount = 0;
      const errorMessages: string[] = [];

      for (const tc of testCases) {
        const subtaskDescriptionADF = {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Test Case ID: ", marks: [{ type: "strong" }] },
                { type: "text", text: tc.testCaseId }
              ]
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Description: ", marks: [{ type: "strong" }] },
                { type: "text", text: tc.description }
              ]
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Precondition: ", marks: [{ type: "strong" }] },
                { type: "text", text: tc.precondition }
              ]
            },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Test Data: ", marks: [{ type: "strong" }] },
                { type: "text", text: tc.testData || 'N/A' }
              ]
            },
            {
              type: "heading",
              attrs: { level: 3 },
              content: [{ type: "text", text: "Test Steps" }]
            },
            {
              type: "orderedList",
              content: tc.testSteps.map(step => ({
                type: "listItem",
                content: [{
                  type: "paragraph",
                  content: [{ type: "text", text: step }]
                }]
              }))
            },
            {
              type: "heading",
              attrs: { level: 3 },
              content: [{ type: "text", text: "Expected Result" }]
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: tc.expectedResult }]
            }
          ]
        };
        
        const subtaskPayload = {
          fields: {
            project: { id: projectId }, // Use Project ID
            parent: { key: issueKey },
            summary: tc.testCaseName,
            description: subtaskDescriptionADF, 
            issuetype: { name: 'Sub-task' }, // This name might need to be configured if your Jira instance uses a different name or requires an ID.
          },
        };

        const createResponse = await fetch(`${jiraUrl}/rest/api/3/issue`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(subtaskPayload),
        });

        if (createResponse.ok) {
          successCount++;
        } else {
          const errorText = await createResponse.text();
          console.error(`Jira API Error (create sub-task for ${tc.testCaseId} under ${issueKey}):`, createResponse.status, errorText);
          errorMessages.push(`Failed to create sub-task for "${tc.testCaseName}": ${createResponse.status} - ${errorText.substring(0, 100)}`);
        }
      }

      if (successCount === testCases.length) {
        return { success: true, message: `Successfully created ${successCount} sub-task(s) for ${issueKey}.` };
      } else if (successCount > 0) {
        return { success: true, message: `Created ${successCount} sub-task(s) for ${issueKey}. Some failed: ${errorMessages.join('; ')}` };
      } else {
        throw new Error(`Failed to create any sub-tasks for ${issueKey}. Errors: ${errorMessages.join('; ')}`);
      }
    }

    return { success: false, message: 'Invalid attachment type specified.' };

  } catch (error) {
    console.error('Error attaching test cases:', error);
    if (error instanceof z.ZodError) {
      throw new Error('Invalid parameters or credentials format for attaching test cases.');
    }
     if (error instanceof Error) {
        throw new Error(`Failed to attach test cases to Jira: ${error.message}`);
    }
    throw new Error('An unexpected error occurred while attaching test cases to Jira.');
  }
}
