
"use server";

import type { JiraCredentials } from '@/contexts/AuthContext';
import { generateTestCases, type GenerateTestCasesInput } from '@/ai/flows/generate-test-cases';
import { analyzeDocument as analyzeDocumentFlow, type AnalyzeDocumentInput } from '@/ai/flows/analyze-document-flow';
import {
  type GenerateTestCasesOutput,
  GenerateTestCasesOutputSchema,
  type AnalyzeDocumentOutput,
  type CreateJiraTicketsInput,
  CreateJiraTicketsInputSchema, 
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
function textToAdf(text: string | undefined): any {
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
      project: { 
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
    }
    return result;
  } catch (error) {
    console.error("Error in generateTestCasesAction:", error);
    let friendlyMessage = "Failed to generate test cases due to an AI processing error.";
    if (error instanceof Error) {
        if (error.message && error.message.includes("503 Service Unavailable")) {
            friendlyMessage = "The AI model is currently overloaded and cannot generate test cases at this moment. Please try again in a few moments.";
        } else {
            friendlyMessage = `Failed to generate test cases: ${error.message}`;
        }
    }
    throw new Error(friendlyMessage);
  }
}

const AttachTestCasesParamsSchema = z.object({
  issueKey: z.string(),
  testCases: GenerateTestCasesOutputSchema, 
  attachmentType: z.enum(['csv', 'subtask']),
  projectId: z.string(), 
});

function convertTestCasesToCsv(testCases: GenerateTestCasesOutput): string {
  if (!testCases || testCases.length === 0) return '';

  const escapeCsvField = (field: string | undefined): string => {
    if (field === undefined || field === null) return '';
    let strField = String(field);
    if (strField.includes(',') || strField.includes('\n') || strField.includes('"')) {
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
    escapeCsvField(tc.testSteps.join('\n')), 
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
          'X-Atlassian-Token': 'no-check', 
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
        const subtaskDescriptionContent: any[] = [
            { type: "paragraph", content: [ { type: "text", text: "Test Case ID: ", marks: [{ type: "strong" }] }, { type: "text", text: tc.testCaseId } ] },
            { type: "paragraph", content: [ { type: "text", text: "Description: ", marks: [{ type: "strong" }] }, { type: "text", text: tc.description } ] },
            { type: "paragraph", content: [ { type: "text", text: "Precondition: ", marks: [{ type: "strong" }] }, { type: "text", text: tc.precondition } ] },
            { type: "paragraph", content: [ { type: "text", text: "Test Data: ", marks: [{ type: "strong" }] }, { type: "text", text: tc.testData || 'N/A' } ] },
        ];

        if (tc.testSteps && tc.testSteps.length > 0) {
            subtaskDescriptionContent.push({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Test Steps" }] });
            subtaskDescriptionContent.push({ type: "orderedList", content: tc.testSteps.map(step => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: step }] }] })) });
        }
        
        subtaskDescriptionContent.push({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Expected Result" }] });
        subtaskDescriptionContent.push({ type: "paragraph", content: [{ type: "text", text: tc.expectedResult }] });
        
        const subtaskDescriptionADF = {
          type: "doc",
          version: 1,
          content: subtaskDescriptionContent
        };
        
        const subtaskPayload = {
          fields: {
            project: { id: projectId }, 
            parent: { key: issueKey },
            summary: tc.testCaseName, 
            description: subtaskDescriptionADF, 
            issuetype: { name: 'Sub-task' }, 
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
          errorMessages.push(`Failed to create sub-task for "${tc.testCaseName.substring(0,30)}...": ${createResponse.status} - ${errorText.substring(0, 100)}`);
        }
      }

      if (successCount === testCases.length) {
        return { success: true, message: `Successfully created ${successCount} sub-task(s) for ${issueKey}.` };
      } else if (successCount > 0) {
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

export async function analyzeDocumentAction(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentOutput> {
  try {
    console.log('Analyzing document for project:', input.projectKey);
    const result = await analyzeDocumentFlow(input);
    return result;
  } catch (error) {
    console.error("Error in analyzeDocumentAction:", error);
    let friendlyMessage = "Failed to analyze document due to an AI processing error.";
    if (error instanceof Error) {
        if (error.message && error.message.includes("503 Service Unavailable")) {
            friendlyMessage = "The AI model is currently overloaded and cannot analyze the document at this moment. Please try again in a few moments.";
        } else {
            friendlyMessage = `Failed to analyze document: ${error.message}`;
        }
    }
    throw new Error(friendlyMessage);
  }
}

export async function createJiraTicketsAction(
  credentials: JiraCredentials,
  params: CreateJiraTicketsInput
): Promise<{ success: boolean; message: string; createdTickets: { key: string; summary: string; type: string }[] }> {
  const validatedCredentials = CredentialsSchema.parse(credentials);
  const validatedParams = CreateJiraTicketsInputSchema.safeParse(params);
  if (!validatedParams.success) {
    console.error("Invalid params for createJiraTicketsAction:", validatedParams.error.flatten());
    throw new Error(`Invalid input parameters for creating Jira tickets: ${validatedParams.error.flatten().formErrors.join(', ')}`);
  }
  
  const { jiraUrl, email, apiToken } = validatedCredentials;
  const { projectId, tickets } = validatedParams.data; // projectKey is not directly used here but available if needed

  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
  const createdTicketsResult: { key: string; summary: string; type: string }[] = [];
  const errorMessages: string[] = [];

  const createSingleTicket = async (ticketData: DraftTicketRecursive, parentJiraKey?: string) => {
    const descriptionADF = textToAdf(ticketData.description);

    const payload: any = {
      fields: {
        project: { id: projectId }, 
        summary: ticketData.summary,
        description: descriptionADF,
        issuetype: { name: ticketData.type }, 
      },
    };

    if (parentJiraKey && ticketData.type === 'Sub-task') {
      payload.fields.parent = { key: parentJiraKey };
    } 
    
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
      console.error(`Jira API Error (create ${ticketData.type} "${ticketData.summary.substring(0,50)}...") Status ${response.status}:`, shortError);
      errorMessages.push(`Failed to create ${ticketData.type} "${ticketData.summary.substring(0,30)}...": ${response.status} - ${shortError}`);
      return { success: false, error: shortError };
    }
  };

  async function createTicketsRecursively(ticketList: AnalyzeDocumentOutput, parentJiraKey?: string) {
    for (const ticket of ticketList) {
      const result = await createSingleTicket(ticket, parentJiraKey);
      if (result.success && result.data) {
        createdTicketsResult.push({ key: result.data.key, summary: ticket.summary, type: ticket.type });
        if (ticket.children && ticket.children.length > 0) {
          const newParentKey = result.data.key;
          await createTicketsRecursively(ticket.children, newParentKey);
        }
      }
    }
  }

  await createTicketsRecursively(tickets);

  let overallSuccess = errorMessages.length === 0;
  let message = "";

  if (createdTicketsResult.length > 0 && overallSuccess) {
    message = `Successfully created ${createdTicketsResult.length} ticket(s) in Jira.`;
  } else if (createdTicketsResult.length > 0 && !overallSuccess) {
    message = `Partially created ${createdTicketsResult.length} ticket(s). Some failures occurred: ${errorMessages.join('; ')}`;
  } else if (createdTicketsResult.length === 0 && !overallSuccess && tickets.length > 0) {
     overallSuccess = false; 
    message = `Failed to create any tickets in Jira. Errors: ${errorMessages.join('; ')}`;
  } else if (createdTicketsResult.length === 0 && overallSuccess && tickets.length === 0) {
    message = "No tickets were provided to create.";
    overallSuccess = true; 
  } else if (createdTicketsResult.length === 0 && overallSuccess && tickets.length > 0){
    message = `No tickets were created, though no explicit errors were reported. Please check the input or Jira configuration.`;
    overallSuccess = false;
  }


  return { success: overallSuccess, message, createdTickets: createdTicketsResult };
}


    