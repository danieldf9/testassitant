
"use server";

import type { JiraCredentials } from '@/contexts/AuthContext';
import { generateTestCases, type GenerateTestCasesInput } from '@/ai/flows/generate-test-cases';
import { analyzeDocument as analyzeDocumentFlow, type AnalyzeDocumentInput } from '@/ai/flows/analyze-document-flow';
import {
  type GenerateTestCasesOutput,
  GenerateTestCasesOutputSchema,
  type AnalyzeDocumentOutput,
  type CreateJiraTicketsInput,
  CreateJiraTicketsInputSchema, // Keep this if used, or remove if params are destructured
  type DraftTicketRecursive
} from '@/lib/schemas';
import { z } from 'zod';

// JiraProject data type
export interface JiraProject {
  id: string;
  key: string;
  name: string;
}

// JiraIssue data type
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

const CredentialsSchema = z.object({
  jiraUrl: z.string().url(),
  email: z.string().email(),
  apiToken: z.string(),
});

const ACCEPTANCE_CRITERIA_CUSTOM_FIELD_ID = 'customfield_10009'; // Example custom field ID

// Helper to convert plain text to Atlassian Document Format (ADF) for description
function textToAdf(text: string): any {
  if (!text) return null;
  return {
    type: "doc",
    version: 1,
    content: text.split('\n').map(paragraph => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }]
    }))
  };
}

function extractTextFromADF(adf: any): string {
  if (!adf) return '';
  if (typeof adf === 'string') return adf; // Should not happen with modern Jira
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
         // Add a newline after paragraphs, but not if it's already double-spaced or empty.
         if (textContent.trim().length > 0 && !textContent.endsWith('\n')) {
           textContent += '\n';
         }
      }
    }
  }
  traverseNodes(adf.content);
  // Normalize multiple newlines to single, and remove trailing/leading newlines from the whole block
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
    // Requesting 'description' and a common custom field for acceptance criteria
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
      project: { // Ensure project details are mapped
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
     // Add a check to ensure AI doesn't return empty results for valid inputs unnecessarily
     if (result.length === 0) {
        // If both description and AC are truly empty, an empty array is fine.
        // Otherwise, it might indicate an AI processing issue if inputs were provided.
        if (!input.description && !input.acceptanceCriteria) {
             return []; // Expected empty if inputs are empty
        }
        // Potentially log or handle cases where inputs were provided but AI returned nothing
    }
    return result;
  } catch (error) {
    console.error("Error in generateTestCasesAction:", error);
    // Provide a more user-friendly error message for AI related issues
    if (error instanceof Error) {
        // Check for specific AI related error messages if possible, or generalize
        throw new Error(`Failed to generate test cases: ${error.message}`);
    }
    throw new Error("Failed to generate test cases due to an AI processing error.");
  }
}

const AttachTestCasesParamsSchema = z.object({
  issueKey: z.string(),
  testCases: GenerateTestCasesOutputSchema, // Expecting the full test case data
  attachmentType: z.enum(['csv', 'subtask']),
  projectId: z.string(), // Add projectId
});

// Helper to convert test cases to CSV
function convertTestCasesToCsv(testCases: GenerateTestCasesOutput): string {
  if (!testCases || testCases.length === 0) return '';

  const escapeCsvField = (field: string | undefined): string => {
    if (field === undefined || field === null) return '';
    let strField = String(field);
    // Escape quotes by doubling them, and wrap in quotes if field contains comma, newline, or quote
    if (strField.includes(',') || strField.includes('\n') || strField.includes('"')) {
      strField = strField.replace(/"/g, '""'); // Escape existing quotes
      return `"${strField}"`; // Wrap in quotes
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
    escapeCsvField(tc.testSteps.join('\n')), // Join steps with newline for CSV readability
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
      const fileName = `${issueKey}-test-cases-${new Date().toISOString().split('T')[0]}.csv`;
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
        // Construct detailed description for the sub-task using ADF
        const subtaskDescriptionADF = {
          type: "doc",
          version: 1,
          content: [
            { type: "paragraph", content: [ { type: "text", text: "Test Case ID: ", marks: [{ type: "strong" }] }, { type: "text", text: tc.testCaseId } ] },
            { type: "paragraph", content: [ { type: "text", text: "Description: ", marks: [{ type: "strong" }] }, { type: "text", text: tc.description } ] },
            { type: "paragraph", content: [ { type: "text", text: "Precondition: ", marks: [{ type: "strong" }] }, { type: "text", text: tc.precondition } ] },
            { type: "paragraph", content: [ { type: "text", text: "Test Data: ", marks: [{ type: "strong" }] }, { type: "text", text: tc.testData || 'N/A' } ] },
            { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Test Steps" }] },
            { type: "orderedList", content: tc.testSteps.map(step => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: step }] }] })) },
            { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Expected Result" }] },
            { type: "paragraph", content: [{ type: "text", text: tc.expectedResult }] }
          ]
        };
        
        const subtaskPayload = {
          fields: {
            project: { id: projectId }, // Use the passed projectId
            parent: { key: issueKey },
            summary: tc.testCaseName, // Use test case name as summary
            description: subtaskDescriptionADF, 
            issuetype: { name: 'Sub-task' }, // This might need to be configurable or use ID
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
        // Partial success message
        return { success: true, message: `Created ${successCount} of ${testCases.length} sub-task(s) for ${issueKey}. Some failed: ${errorMessages.join('; ')}` };
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

// Action to analyze document and draft tickets
export async function analyzeDocumentAction(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentOutput> {
  try {
    console.log('Analyzing document for project:', input.projectKey);
    const result = await analyzeDocumentFlow(input);
    return result;
  } catch (error) {
    console.error("Error in analyzeDocumentAction:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to analyze document: ${error.message}`);
    }
    throw new Error("Failed to analyze document due to an AI processing error.");
  }
}

// Action to create drafted tickets in Jira
export async function createJiraTicketsAction(
  credentials: JiraCredentials,
  params: CreateJiraTicketsInput
): Promise<{ success: boolean; message: string; createdTickets: { key: string; summary: string; type: string }[] }> {
  const validatedCredentials = CredentialsSchema.parse(credentials);
  // Validate params using the Zod schema to ensure structure
  const validatedParams = CreateJiraTicketsInputSchema.safeParse(params);
  if (!validatedParams.success) {
    console.error("Invalid params for createJiraTicketsAction:", validatedParams.error.flatten());
    throw new Error(`Invalid input parameters for creating Jira tickets: ${validatedParams.error.flatten().formErrors.join(', ')}`);
  }
  
  const { jiraUrl, email, apiToken } = validatedCredentials;
  const { projectId, projectKey, tickets } = validatedParams.data;

  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
  const createdTicketsResult: { key: string; summary: string; type: string }[] = [];
  const errorMessages: string[] = [];

  // Helper function to create a single ticket.
  const createSingleTicket = async (ticketData: DraftTicketRecursive, parentJiraKey?: string) => {
    const descriptionADF = textToAdf(ticketData.description);

    const payload: any = {
      fields: {
        project: { id: projectId }, // project ID
        summary: ticketData.summary,
        description: descriptionADF,
        issuetype: { name: ticketData.type }, // Assumes 'type' is a valid Jira issue type name
      },
    };

    // Handle parent linking for sub-tasks
    if (parentJiraKey && ticketData.type === 'Sub-task') {
      payload.fields.parent = { key: parentJiraKey };
    } 
    // Note: Linking Stories/Tasks to Epics often requires a custom field (e.g., 'Epic Link').
    // This ID varies by Jira instance. For simplicity, this initial version doesn't implement
    // direct epic linking for children of epics unless they are sub-tasks. They'll be top-level.
    // Future enhancement: Make Epic Link field ID configurable.

    const response = await fetch(`${jiraUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const created = await response.json();
      return { success: true, data: created };
    } else {
      const errorText = await response.text();
      const shortError = errorText.length > 200 ? errorText.substring(0, 200) + "..." : errorText;
      console.error(`Jira API Error (create ${ticketData.type} "${ticketData.summary}"):`, response.status, shortError);
      errorMessages.push(`Failed to create ${ticketData.type} "${ticketData.summary.substring(0,30)}...": ${response.status} - ${shortError}`);
      return { success: false, error: shortError };
    }
  };

  // Recursive function to create tickets and their children
  async function createTicketsRecursively(ticketList: AnalyzeDocumentOutput, parentJiraKey?: string) {
    for (const ticket of ticketList) {
      const result = await createSingleTicket(ticket, parentJiraKey);
      if (result.success && result.data) {
        createdTicketsResult.push({ key: result.data.key, summary: ticket.summary, type: ticket.type });
        if (ticket.children && ticket.children.length > 0) {
          // If the created ticket can be a parent (Epic, Story, Task, Bug), its key is used for sub-tasks.
          const newParentKey = result.data.key;
          await createTicketsRecursively(ticket.children, newParentKey);
        }
      }
      // Errors are collected in errorMessages by createSingleTicket
    }
  }

  await createTicketsRecursively(tickets);

  let overallSuccess = errorMessages.length === 0;
  let message = "";

  if (createdTicketsResult.length > 0 && overallSuccess) {
    message = `Successfully created ${createdTicketsResult.length} ticket(s) in Jira.`;
  } else if (createdTicketsResult.length > 0 && !overallSuccess) {
    message = `Partially created ${createdTicketsResult.length} ticket(s). Some failures occurred: ${errorMessages.join('; ')}`;
  } else if (createdTicketsResult.length === 0 && !overallSuccess) {
     overallSuccess = false; // Ensure success is false if nothing was created and errors occurred
    message = `Failed to create any tickets in Jira. Errors: ${errorMessages.join('; ')}`;
  } else if (createdTicketsResult.length === 0 && overallSuccess && tickets.length > 0) {
    // This case should ideally not happen if tickets were provided but none created and no errors.
    // It might mean the input 'tickets' array was processed but all creations failed silently (which createSingleTicket should prevent).
    message = `No tickets were created, though no explicit errors were reported. Please check the input or Jira configuration.`;
    overallSuccess = false;
  } else if (tickets.length === 0) {
    message = "No tickets were provided to create.";
    overallSuccess = true; // No operation to fail
  }


  if (!overallSuccess && createdTicketsResult.length === 0) {
     // If truly nothing was created and there were errors, throw to indicate a larger failure.
     // Otherwise, partial success will be handled by the return object.
     // This helps the client side distinguish between total failure and partial success.
     if (tickets.length > 0) { // Only throw if there was an attempt to create something
        // throw new Error(message); // Decided to return message instead of throwing for UI handling
     }
  }

  return { success: overallSuccess, message, createdTickets: createdTicketsResult };
}
