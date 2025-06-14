
"use server";

import type { JiraCredentials } from '../../srcold/contexts/AuthContext';
import { generateTestCases, type GenerateTestCasesInput } from '../../srcold/ai/flows/generate-test-cases';
import { analyzeDocument as analyzeDocumentFlow, type AnalyzeDocumentInput } from '../../srcold/ai/flows/analyze-document-flow';
import { draftJiraBug as draftJiraBugFlow } from '@/ai/flows/draft-jira-bug-flow';

import {
  type GenerateTestCasesOutput,
  GenerateTestCasesOutputSchema,
  type AnalyzeDocumentOutput,
  type CreateJiraTicketsInput,
  CreateJiraTicketsInputSchema,
  type DraftTicketRecursive,
  type DraftJiraBugInput,
  DraftJiraBugOutputSchema,
  type DraftJiraBugOutput,
  type CreateJiraBugPayload,
  CreateJiraBugPayloadSchema,
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
  acceptanceCriteria?: string; // This is from a custom field when fetching
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
  if (!text || text.trim() === "") return null;
  return {
    type: "doc",
    version: 1,
    content: text.split('\n').map(paragraphText => {
      if (paragraphText.trim() === "") {
        return null;
      }
      return {
        type: "paragraph",
        content: [{ type: "text", text: paragraphText.trim() }]
      };
    }).filter(p => p !== null)
  };
}

// Basic Markdown to ADF converter
function markdownToAdf(markdown: string | undefined): any {
  if (!markdown || markdown.trim() === "") return null;

  const adfContent: any[] = [];
  const lines = markdown.split('\n');

  let inList = false;
  let listType: 'orderedList' | 'bulletList' | null = null;
  let currentListItems: any[] = [];

  function flushList() {
    if (inList && listType && currentListItems.length > 0) {
      adfContent.push({ type: listType, content: currentListItems });
    }
    inList = false;
    listType = null;
    currentListItems = [];
  }

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Headings
    if (trimmedLine.startsWith('## ')) {
      flushList();
      adfContent.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: trimmedLine.substring(3).trim() }],
      });
      continue;
    }
    if (trimmedLine.startsWith('# ')) {
      flushList();
      adfContent.push({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: trimmedLine.substring(2).trim() }],
      });
      continue;
    }

    // Ordered List Item (e.g., "1. Item")
    const orderedMatch = trimmedLine.match(/^(\d+)\.\s+(.*)/);
    if (orderedMatch) {
      if (!inList || listType !== 'orderedList') {
        flushList();
        inList = true;
        listType = 'orderedList';
      }
      currentListItems.push({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: orderedMatch[2].trim() }] }],
      });
      continue;
    }

    // Bullet List Item (e.g., "- Item" or "* Item")
    const bulletMatch = trimmedLine.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      if (!inList || listType !== 'bulletList') {
        flushList();
        inList = true;
        listType = 'bulletList';
      }
      currentListItems.push({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: bulletMatch[1].trim() }] }],
      });
      continue;
    }

    // If not a list item and we were in a list, flush it
    if (trimmedLine !== "" && inList) {
        flushList();
    }


    // Paragraphs (non-empty lines)
    if (trimmedLine !== "") {
      adfContent.push({
        type: 'paragraph',
        content: [{ type: 'text', text: trimmedLine }],
      });
    } else if (adfContent.length > 0 && adfContent[adfContent.length-1].type !== 'rule') {
        // Allow single empty lines to potentially break paragraphs, but don't add multiple empty paragraphs
        // This is a simple heuristic; more complex Markdown might need smarter empty line handling
    }
  }
  flushList(); // Ensure any pending list is flushed at the end

  if (adfContent.length === 0) return null;

  return { type: 'doc', version: 1, content: adfContent };
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
      const errorStatus = response.status;
      const errorText = await response.text();
      console.error(`Jira API Error (fetchProjects): Status ${errorStatus}`, errorText.substring(0, 500));

      let userFriendlyMessage = `Failed to connect to Jira (Status ${errorStatus}). Please check your network connection and Jira status.`;

      if (errorStatus === 401) {
        userFriendlyMessage = 'Authentication failed: Invalid email or API token. Please verify your credentials.';
      } else if (errorStatus === 403) {
        userFriendlyMessage = 'Access denied: Your account may not have permission to access projects. Please check your Jira permissions.';
      } else if (errorStatus === 404) {
        userFriendlyMessage = 'Invalid Jira URL or endpoint not found (404). Please verify your Jira URL.';
      } else {
        // For other error statuses, try to parse JSON, then check for common text/HTML errors
        let jsonParsedSuccessfully = false;
        try {
          const errorJson = JSON.parse(errorText);
          jsonParsedSuccessfully = true;
          if (errorJson.errorMessages && errorJson.errorMessages.length > 0) {
            userFriendlyMessage = `Jira Error: ${errorJson.errorMessages.join('; ')}`;
          } else if (errorJson.message) {
            userFriendlyMessage = `Jira Error: ${errorJson.message}`;
          } else {
            // JSON parsed, but not a recognized Jira error structure.
            userFriendlyMessage = `Jira API Error (Status ${errorStatus}): Received an unexpected JSON format. Snippet: ${errorText.substring(0,100)}...`;
          }
        } catch (e) {
          // JSON.parse failed, errorText is likely HTML or plain text.
          // jsonParsedSuccessfully remains false.
        }

        // If JSON parsing failed or didn't yield a specific message, analyze errorText directly
        if (!jsonParsedSuccessfully || userFriendlyMessage === `Failed to connect to Jira (Status ${errorStatus}). Please check your network connection and Jira status.` || userFriendlyMessage.includes("unexpected JSON format")) {
          const lowerErrorText = errorText.toLowerCase();
          if (lowerErrorText.includes("urlopen error [errno -3] temporary failure in name resolution") ||
              lowerErrorText.includes("econnrefused") ||
              lowerErrorText.includes("enotfound") ||
              lowerErrorText.includes("dns lookup failed") ||
              lowerErrorText.includes("net::err_name_not_resolved")) {
             userFriendlyMessage = 'Network Error: Could not resolve or connect to the Jira URL. Please check your internet connection and the Jira URL.';
          } else if (errorStatus === 503 || errorStatus === 502 || errorStatus === 504) {
            userFriendlyMessage = `Jira Service Unavailable (Status ${errorStatus}). The Jira server or a proxy may be temporarily down or overloaded. Please try again later.`;
          } else if (lowerErrorText.includes("<html") || lowerErrorText.includes("<!doctype html")) {
            userFriendlyMessage = `Jira API Error (Status ${errorStatus}): Received an HTML response instead of JSON. This could be a login page or an error page from a proxy/Jira. Check console for details.`;
          } else if (errorText.length > 0 && errorText.length < 300) {
            userFriendlyMessage = `Jira API Error (Status ${errorStatus}): ${errorText.replace(/<[^>]+>/g, '').trim()}`;
          } else {
            userFriendlyMessage = `Jira API Error (Status ${errorStatus}): An unexpected response was received. Response snippet: ${errorText.substring(0,100)}...`;
          }
        }
      }
      throw new Error(userFriendlyMessage);
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
      throw new Error('Invalid credentials format provided to fetchProjectsAction.');
    }
    if (error instanceof Error) {
        throw error; // Re-throw the (potentially user-friendly) error
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
      const errorText = await response.text();
      const errorStatus = response.status;
      console.error('Jira API Error (fetchIssues):', errorStatus, errorText);
      let userFriendlyMessage = `Failed to fetch issues (Status ${errorStatus}).`;
       if (errorStatus === 401 || errorStatus === 403) {
        userFriendlyMessage = 'Authentication or permission error while fetching issues. Your session might have expired or permissions changed.';
      } else if (errorText.length > 0 && errorText.length < 200) {
        userFriendlyMessage = `Jira API Error (Status ${errorStatus}): ${errorText.replace(/<[^>]+>/g, '').trim()}`;
      }
      throw new Error(userFriendlyMessage);
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
      throw new Error('Invalid parameters or credentials format for fetching issues.');
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
    if (error instanceof Error && error.message) {
        if (error.message.includes("503 Service Unavailable") || error.message.includes("model is overloaded")) {
            friendlyMessage = "The AI model is currently overloaded. Please try again in a few moments.";
        } else if (error.message.includes("429 Too Many Requests") || error.message.includes("quota exceeded")) {
            friendlyMessage = "AI model quota exceeded. Please check your Google AI plan and billing details, then try again.";
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
        throw new Error(`Failed to attach CSV to ${issueKey}. Status: ${attachResponse.status}. ${errorText.replace(/<[^>]+>/g, '').trim()}`);
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
          errorMessages.push(`Failed to create sub-task for "${tc.testCaseName.substring(0,30)}...": ${createResponse.status} - ${errorText.substring(0, 100).replace(/<[^>]+>/g, '').trim()}`);
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
    console.log('Analyzing document for project:', input.projectKey, 'Persona:', input.userPersona, 'Preference:', input.outputFormatPreference);
    const result = await analyzeDocumentFlow(input);
    return result;
  } catch (error) {
    console.error("Error in analyzeDocumentAction:", error);
    let friendlyMessage = "Failed to analyze document due to an AI processing error.";
    if (error instanceof Error && error.message) {
        if (error.message.includes("503 Service Unavailable") || error.message.includes("model is overloaded")) {
            friendlyMessage = "The AI model is currently overloaded. Please try again in a few moments.";
        } else if (error.message.includes("429 Too Many Requests") || error.message.includes("quota exceeded")) {
            friendlyMessage = "AI model quota exceeded. Please check your Google AI plan and billing details, then try again.";
        } else {
            friendlyMessage = `Failed to analyze document: ${error.message}`;
        }
    }
    throw new Error(friendlyMessage);
  }
}

function countAllDraftTickets(tickets: DraftTicketRecursive[]): number {
  let count = 0;
  for (const ticket of tickets) {
    count++; // Count the ticket itself
    if (ticket.children && ticket.children.length > 0) {
      count += countAllDraftTickets(ticket.children); // Recursively count children
    }
  }
  return count;
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
  const { projectId, tickets: allTickets } = validatedParams.data;

  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
  const createdTicketsResult: { key: string; summary: string; type: string }[] = [];
  const errorMessages: string[] = [];

  const BATCH_SIZE = 10;
  const totalTicketsToCreate = countAllDraftTickets(allTickets);

  const createSingleTicket = async (ticketData: DraftTicketRecursive, parentJiraKey?: string) => {
    let combinedDescriptionText = ticketData.description || "";
    if (ticketData.acceptanceCriteria && ticketData.acceptanceCriteria.trim() !== "") {
      combinedDescriptionText += `\n\nAcceptance Criteria:\n${ticketData.acceptanceCriteria.trim()}`;
    }
    const descriptionADF = textToAdf(combinedDescriptionText.trim());

    const payload: any = {
      fields: {
        project: { id: projectId },
        summary: ticketData.summary,
        issuetype: { name: ticketData.type },
      },
    };
    if (descriptionADF && descriptionADF.content && descriptionADF.content.length > 0) {
        payload.fields.description = descriptionADF;
    }

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
      console.error(`Jira API Error (create ${ticketData.type} "${ticketData.summary.substring(0,50)}...") Status ${response.status}: Full Response: ${errorText}`);
      let userFriendlyError = `Status ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.errorMessages && errorJson.errorMessages.length > 0) {
          userFriendlyError += ` - ${errorJson.errorMessages.join('. ')}`;
        } else if (errorJson.errors) {
           userFriendlyError += ` - ${Object.entries(errorJson.errors).map(([k,v]) => `${k}: ${v}`).join('. ')}`;
        }
      } catch (e) {
        userFriendlyError += ` - ${errorText.substring(0,100).replace(/<[^>]+>/g, '').trim()}${errorText.length > 100 ? '...' : ''}`;
      }
      errorMessages.push(`Failed to create ${ticketData.type} "${ticketData.summary.substring(0,30)}...": ${userFriendlyError}`);
      return { success: false, error: userFriendlyError };
    }
  };

  async function createTicketsRecursivelyInternal(ticketList: AnalyzeDocumentOutput, parentJiraKeyForSubtasks?: string) {
    for (const ticket of ticketList) {
      const result = await createSingleTicket(ticket, parentJiraKeyForSubtasks);
      if (result.success && result.data) {
        createdTicketsResult.push({ key: result.data.key, summary: ticket.summary, type: ticket.type });
        if (ticket.children && ticket.children.length > 0) {
          const newParentKeyForChildren = (ticket.type !== 'Epic') ? result.data.key : undefined;
          await createTicketsRecursivelyInternal(ticket.children, newParentKeyForChildren);
        }
      }
    }
  }

  for (let i = 0; i < allTickets.length; i += BATCH_SIZE) {
    const batch = allTickets.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(allTickets.length/BATCH_SIZE)}: ${batch.length} top-level tickets.`);
    await createTicketsRecursivelyInternal(batch);
  }

  let overallSuccess = errorMessages.length === 0 && createdTicketsResult.length === totalTicketsToCreate;
  let message = "";

  if (totalTicketsToCreate === 0) {
      overallSuccess = true;
      message = "No tickets were provided to create.";
  } else if (createdTicketsResult.length > 0 && overallSuccess) {
    message = `Successfully created all ${createdTicketsResult.length} ticket(s)/sub-task(s) in Jira.`;
  } else if (createdTicketsResult.length > 0 && !overallSuccess) {
    message = `Partially created ${createdTicketsResult.length} of ${totalTicketsToCreate} intended ticket(s)/sub-task(s). Failures: ${errorMessages.join('; ')}`;
     overallSuccess = false;
  } else if (createdTicketsResult.length === 0 && !overallSuccess && totalTicketsToCreate > 0) {
    overallSuccess = false;
    message = `Failed to create any of the ${totalTicketsToCreate} intended tickets in Jira. Errors: ${errorMessages.join('; ')}`;
  }

  console.log(`Ticket creation result: ${message}, Success: ${overallSuccess}, Created: ${createdTicketsResult.length}, Intended: ${totalTicketsToCreate}`);
  return { success: overallSuccess, message, createdTickets: createdTicketsResult };
}

// Action to call the AI flow for drafting a bug report
export async function draftJiraBugAction(input: DraftJiraBugInput): Promise<DraftJiraBugOutput> {
  try {
    console.log('Drafting Jira bug for project:', input.projectKey, 'Attachment:', input.attachmentFilename);
    const result = await draftJiraBugFlow(input);
    // Validate with Zod schema before returning (optional, but good practice)
    return DraftJiraBugOutputSchema.parse(result);
  } catch (error) {
    console.error("Error in draftJiraBugAction:", error);
    let friendlyMessage = "Failed to draft bug report due to an AI processing error.";
    if (error instanceof z.ZodError) {
        friendlyMessage = "AI returned an unexpected format for the bug draft.";
    } else if (error instanceof Error && error.message) {
      if (error.message.includes("503 Service Unavailable") || error.message.includes("model is overloaded")) {
        friendlyMessage = "The AI model is currently overloaded. Please try again in a few moments.";
      } else if (error.message.includes("429 Too Many Requests") || error.message.includes("quota exceeded")) {
        friendlyMessage = "AI model quota exceeded. Please check your Google AI plan and billing details.";
      } else {
        friendlyMessage = `Failed to draft bug: ${error.message}`;
      }
    }
    throw new Error(friendlyMessage);
  }
}

// Action to create the bug in Jira
export async function createJiraBugInJiraAction(
  credentials: JiraCredentials,
  bugData: CreateJiraBugPayload,
  attachmentDataUri?: string, // Base64 data URI
  attachmentFileName?: string // Original filename
): Promise<{ success: boolean; message: string; ticketKey?: string; ticketUrl?: string }> {
  const validatedCredentials = CredentialsSchema.parse(credentials);
  const validatedBugData = CreateJiraBugPayloadSchema.parse(bugData);

  const { jiraUrl, email, apiToken } = validatedCredentials;
  const { projectId, summary, descriptionMarkdown, identifiedEnvironment } = validatedBugData;

  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

  // Convert Markdown description to ADF
  const descriptionADF = markdownToAdf(descriptionMarkdown);

  const issuePayload = {
    fields: {
      project: { id: projectId },
      summary: summary,
      issuetype: { name: "Bug" },
      description: descriptionADF,
      // You might want to map 'identifiedEnvironment' to a custom Jira field if one exists.
      // For now, it's part of the description. Example for a custom field:
      // customfield_XXXXX: { value: identifiedEnvironment },
    },
  };

  try {
    // 1. Create the issue
    const createIssueResponse = await fetch(`${jiraUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(issuePayload),
    });

    if (!createIssueResponse.ok) {
      const errorText = await createIssueResponse.text();
      console.error(`Jira API Error (create bug): Status ${createIssueResponse.status}`, errorText);
       let userFriendlyError = `Status ${createIssueResponse.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.errorMessages && errorJson.errorMessages.length > 0) {
          userFriendlyError += ` - ${errorJson.errorMessages.join('. ')}`;
        } else if (errorJson.errors) {
           userFriendlyError += ` - ${Object.entries(errorJson.errors).map(([k,v]) => `${k}: ${v}`).join('. ')}`;
        } else {
            userFriendlyError += ` - ${errorText.substring(0,150).replace(/<[^>]+>/g, '').trim()}`;
        }
      } catch (e) {
        userFriendlyError += ` - ${errorText.substring(0,150).replace(/<[^>]+>/g, '').trim()}`;
      }
      throw new Error(`Failed to create bug in Jira: ${userFriendlyError}`);
    }

    const createdIssue = await createIssueResponse.json();
    const issueKey = createdIssue.key;
    const ticketUrl = `${jiraUrl}/browse/${issueKey}`;

    // 2. Attach file if provided
    if (attachmentDataUri && attachmentFileName && issueKey) {
      try {
        const base64Data = attachmentDataUri.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: attachmentDataUri.split(',')[0].split(':')[1].split(';')[0] });

        const formData = new FormData();
        formData.append('file', blob, attachmentFileName);

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
          const attachErrorText = await attachResponse.text();
          console.error(`Jira API Error (attach file to ${issueKey}): Status ${attachResponse.status}`, attachErrorText);
          // Don't fail the whole operation, just warn about attachment failure
          return {
            success: true, // Issue created, attachment failed
            message: `Bug ${issueKey} created, but failed to attach ${attachmentFileName}. Status: ${attachResponse.status}. ${attachErrorText.substring(0,100).replace(/<[^>]+>/g, '').trim()}`,
            ticketKey,
            ticketUrl,
          };
        }
        await attachResponse.json(); // Consume response
         return {
            success: true,
            message: `Bug ${issueKey} created successfully with attachment ${attachmentFileName}.`,
            ticketKey,
            ticketUrl
        };

      } catch (attachError: any) {
         console.error(`Error processing or attaching file to ${issueKey}:`, attachError);
         return {
            success: true, // Issue created, attachment processing failed
            message: `Bug ${issueKey} created, but failed to process or attach file: ${attachError.message}`,
            ticketKey,
            ticketUrl,
         }
      }
    }

    return {
        success: true,
        message: `Bug ${issueKey} created successfully.`,
        ticketKey,
        ticketUrl
    };

  } catch (error) {
    console.error('Error in createJiraBugInJiraAction:', error);
    if (error instanceof z.ZodError) {
      throw new Error('Invalid data provided for creating Jira bug.');
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred while creating the bug in Jira.');
  }
}

    