
"use server";

import type { JiraCredentials } from '@/contexts/AuthContext';
import { draftJiraBug as draftJiraBugFlow } from '@/ai/flows/draft-jira-bug-flow';
import { generateTestCases as generateTestCasesFlow, type GenerateTestCasesInput } from '@/ai/flows/generate-test-cases';
import { generatePlaywrightCode as generatePlaywrightCodeFlow, type GeneratePlaywrightCodeInput } from '@/ai/flows/generate-playwright-code';
import { analyzeDocument as analyzeDocumentFlow, type AnalyzeDocumentInput } from '@/ai/flows/analyze-document-flow';
import * as ExcelJS from 'exceljs';

import {
  type GenerateTestCasesOutput,
  GenerateTestCasesOutputSchema,
  type DraftJiraBugInput,
  DraftJiraBugOutputSchema,
  type DraftJiraBugOutput,
  type CreateJiraBugPayload,
  CreateJiraBugPayloadSchema,
  GeneratePlaywrightCodeOutputSchema,
  type GeneratePlaywrightCodeOutput,
  AnalyzeDocumentOutputSchema,
  type AnalyzeDocumentOutput,
  CreateJiraTicketsInputSchema,
  type DraftTicketRecursive,
  LocalStorageBugTemplateSchema,
  type LocalStorageBugTemplate,
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
  acceptanceCriteria?: string; // This from a custom field when fetching
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
const EPIC_LINK_CUSTOM_FIELD_ID = 'customfield_10002'; // Example custom field ID for Epic Link

// Helper to convert plain text to Atlassian Document Format (ADF) for description
function textToAdf(text: string | undefined): any {
  if (!text || text.trim() === "") return null;
  return {
    type: "doc",
    version: 1,
    content: text.split('\n').filter(p => p.trim() !== "").map(paragraphText => ({
        type: "paragraph",
        content: [{ type: "text", text: paragraphText.trim() }]
    }))
  };
}


// Basic Markdown to ADF converter
function markdownToAdf(markdown: string | undefined): any {
  if (!markdown || markdown.trim() === "") return null;

  const adfContent: any[] = [];
  const lines = markdown.split('\n');

  let inList: 'orderedList' | 'bulletList' | null = null;
  let currentList: any = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    const isListItem = trimmedLine.match(/^(\d+\.|[-*])\s+/);

    // If the line is not a list item, but we were in a list, end the list.
    if (!isListItem && inList) {
      inList = null;
      currentList = null;
    }

    // Headings
    if (trimmedLine.startsWith('## ')) {
      adfContent.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: trimmedLine.substring(3).trim() }],
      });
    } else if (trimmedLine.startsWith('# ')) {
      adfContent.push({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: trimmedLine.substring(2).trim() }],
      });
    }
    // Ordered List Item (e.g., "1. Item")
    else if (trimmedLine.match(/^\d+\.\s+/)) {
      const text = trimmedLine.replace(/^\d+\.\s+/, '').trim();
      const listItem = { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
      if (inList === 'orderedList' && currentList) {
        currentList.content.push(listItem);
      } else {
        inList = 'orderedList';
        currentList = { type: 'orderedList', content: [listItem] };
        adfContent.push(currentList);
      }
    }
    // Bullet List Item (e.g., "- Item" or "* Item")
    else if (trimmedLine.match(/^[-*]\s+/)) {
      const text = trimmedLine.replace(/^[-*]\s+/, '').trim();
      const listItem = { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
       if (inList === 'bulletList' && currentList) {
        currentList.content.push(listItem);
      } else {
        inList = 'bulletList';
        currentList = { type: 'bulletList', content: [listItem] };
        adfContent.push(currentList);
      }
    }
    // Paragraphs (non-empty lines)
    else if (trimmedLine !== "") {
      adfContent.push({
        type: 'paragraph',
        content: [{ type: 'text', text: trimmedLine }],
      });
    }
  }

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


export async function fetchProjectsAction(credentials: JiraCredentials): Promise<JraProject[]> {
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
        }

        if (!jsonParsedSuccessfully) {
          const lowerErrorText = errorText.toLowerCase();
          if (lowerErrorText.includes("urlopen error") || lowerErrorText.includes("econnrefused") || lowerErrorText.includes("enotfound")) {
             userFriendlyMessage = 'Network Error: Could not resolve or connect to the Jira URL. Please check your internet connection and the Jira URL.';
          } else if (errorStatus >= 500) {
            userFriendlyMessage = `Jira Service Unavailable (Status ${errorStatus}). The Jira server may be temporarily down or overloaded.`;
          } else if (lowerErrorText.includes("<html")) {
            userFriendlyMessage = `Jira API Error (Status ${errorStatus}): Received an HTML response instead of JSON. This could be a login page or an error page.`;
          } else {
            userFriendlyMessage = `Jira API Error (Status ${errorStatus}): ${errorText.substring(0,150)}`;
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
  searchQuery: z.string().optional(),
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
    const { projectId, page, pageSize, searchQuery } = validatedParams;

    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;
    const startAt = (page - 1) * pageSize;

    let jql = `project = ${projectId}`;
    if (searchQuery && searchQuery.trim()) {
      const sanitizedQuery = searchQuery.replace(/"/g, '\\"');
      jql += ` AND text ~ "${sanitizedQuery}*"`;
    }
    jql += ` ORDER BY created DESC`;

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

// Action to call the AI flow for drafting a bug report
export async function draftJiraBugAction(input: DraftJiraBugInput): Promise<DraftJiraBugOutput> {
  try {
    const result = await draftJiraBugFlow(input);
    return DraftJiraBugOutputSchema.parse(result);
  } catch (error) {
    console.error("Error in draftJiraBugAction:", error);
    let friendlyMessage = "Failed to draft bug report due to an AI processing error.";
    if (error instanceof z.ZodError) {
        friendlyMessage = "AI returned an unexpected format for the bug draft.";
    } else if (error instanceof Error && error.message) {
      friendlyMessage = `Failed to draft bug: ${error.message}`;
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

  const descriptionADF = markdownToAdf(descriptionMarkdown);

  const issuePayload = {
    fields: {
      project: { id: projectId },
      summary: summary,
      issuetype: { name: "Bug" },
      description: descriptionADF,
    },
  };

  try {
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
        }
      } catch (e) { /* ignore json parse error */ }
      throw new Error(`Failed to create bug in Jira: ${userFriendlyError}`);
    }

    const createdIssue = await createIssueResponse.json();
    const ticketKey = createdIssue.key;
    const ticketUrl = `${jiraUrl}/browse/${ticketKey}`;

    if (attachmentDataUri && attachmentFileName && ticketKey) {
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

        const attachResponse = await fetch(`${jiraUrl}/rest/api/3/issue/${ticketKey}/attachments`, {
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
          console.error(`Jira API Error (attach file to ${ticketKey}): Status ${attachResponse.status}`, attachErrorText);
          return {
            success: true, 
            message: `Bug ${ticketKey} created, but failed to attach ${attachmentFileName}. Status: ${attachResponse.status}.`,
            ticketKey,
            ticketUrl,
          };
        }
         return {
            success: true,
            message: `Bug ${ticketKey} created successfully with attachment ${attachmentFileName}.`,
            ticketKey,
            ticketUrl
        };

      } catch (attachError: any) {
         console.error(`Error processing or attaching file to ${ticketKey}:`, attachError);
         return {
            success: true,
            message: `Bug ${ticketKey} created, but failed to process or attach file: ${attachError.message}`,
            ticketKey,
            ticketUrl,
         }
      }
    }

    return {
        success: true,
        message: `Bug ${ticketKey} created successfully.`,
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

// Test Case Generation Action
export async function generateTestCasesAction(input: GenerateTestCasesInput): Promise<GenerateTestCasesOutput> {
  try {
    const result = await generateTestCasesFlow(input);
    return GenerateTestCasesOutputSchema.parse(result);
  } catch (error: any) {
     console.error("Error in generateTestCasesAction:", error);
    let friendlyMessage = "Failed to generate test cases due to an AI processing error.";
    if (error instanceof z.ZodError) {
        friendlyMessage = "AI returned an unexpected format for the test cases.";
    } else if (error.message) {
      friendlyMessage = `Failed to generate test cases: ${error.message}`;
    }
    throw new Error(friendlyMessage);
  }
}

// Playwright Code Generation Action
export async function generatePlaywrightCodeAction(input: GeneratePlaywrightCodeInput): Promise<GeneratePlaywrightCodeOutput> {
    try {
        const result = await generatePlaywrightCodeFlow(input);
        return GeneratePlaywrightCodeOutputSchema.parse(result);
    } catch (error: any) {
        console.error("Error in generatePlaywrightCodeAction:", error);
        let friendlyMessage = "Failed to generate Playwright code due to an AI processing error.";
        if (error instanceof z.ZodError) {
            friendlyMessage = "AI returned an unexpected format for the Playwright code.";
        } else if (error.message) {
            friendlyMessage = `Failed to generate code: ${error.message}`;
        }
        throw new Error(friendlyMessage);
    }
}


const AttachTestCasesInputSchema = z.object({
  issueKey: z.string(),
  testCases: GenerateTestCasesOutputSchema,
  projectId: z.string(), 
});

// Helper to convert JSON test cases to a formatted Excel buffer
async function convertTestCasesToExcel(testCases: GenerateTestCasesOutput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Test Cases');

  // Define columns and set widths
  worksheet.columns = [
    { header: 'Test Case ID', key: 'testCaseId', width: 20 },
    { header: 'Test Case Name', key: 'testCaseName', width: 40 },
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Precondition', key: 'precondition', width: 40 },
    { header: 'Test Steps', key: 'testSteps', width: 60 },
    { header: 'Expected Result', key: 'expectedResult', width: 60 },
  ];

  // Style the header row
  const headerRow = worksheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2F528F' }, // Darker blue for header
    };
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Add data rows and apply styling
  testCases.forEach(tc => {
    const row = worksheet.addRow({
      testCaseId: tc.testCaseId,
      testCaseName: tc.testCaseName,
      description: tc.description,
      precondition: tc.precondition,
      testSteps: tc.testSteps.join('\n'), // Join steps with newline for display in Excel
      expectedResult: tc.expectedResult,
    });
    row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
            top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
        };
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    });
  });

  // Convert workbook to buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as Buffer;
}

// Action to attach generated test cases to a Jira issue
export async function attachTestCasesToJiraAction(
  credentials: JiraCredentials,
  params: z.infer<typeof AttachTestCasesInputSchema>
): Promise<{ success: boolean; message: string }> {
  const validatedCredentials = CredentialsSchema.parse(credentials);
  const validatedParams = AttachTestCasesInputSchema.parse(params);
  const { jiraUrl, email, apiToken } = validatedCredentials;
  const { issueKey, testCases } = validatedParams;
  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

  const excelBuffer = await convertTestCasesToExcel(testCases);
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const formData = new FormData();
  formData.append('file', blob, `test-cases-${issueKey}.xlsx`);
  
  const response = await fetch(`${jiraUrl}/rest/api/3/issue/${issueKey}/attachments`, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'X-Atlassian-Token': 'no-check',
    },
    body: formData,
  });

  if (response.ok) {
    return { success: true, message: `Successfully attached test cases as Excel file to ${issueKey}.` };
  } else {
    const errorText = await response.text();
    console.error('Jira API Error (attach Excel):', response.status, errorText);
    throw new Error(`Failed to attach Excel file to ${issueKey}. Status: ${response.status}`);
  }
}


// Document Analysis Actions

export async function analyzeDocumentAction(input: AnalyzeDocumentInput): Promise<AnalyzeDocumentOutput> {
  try {
    const result = await analyzeDocumentFlow(input);
    return AnalyzeDocumentOutputSchema.parse(result);
  } catch (error: any) {
    console.error("Error in analyzeDocumentAction:", error);
    let friendlyMessage = "Failed to analyze document due to an AI processing error.";
    if (error instanceof z.ZodError) {
      friendlyMessage = "AI returned an unexpected format for the drafted tickets.";
    } else if (error.message) {
      friendlyMessage = `Failed to analyze document: ${error.message}`;
    }
    throw new Error(friendlyMessage);
  }
}

// A helper function to create a single Jira issue
async function createSingleJiraIssue(
  authHeader: string,
  jiraUrl: string,
  projectId: string,
  issueData: Omit<DraftTicketRecursive, 'children' | 'suggestedId'>,
  parentIssueKey?: string,
  epicKey?: string
): Promise<{ key: string, id: string }> {
    
    const descriptionADF = markdownToAdf(issueData.description);
    const acceptanceCriteriaADF = markdownToAdf(issueData.acceptanceCriteria);

    const payload: any = {
      fields: {
        project: { id: projectId },
        summary: issueData.summary,
        issuetype: { name: issueData.type },
        description: descriptionADF,
      }
    };

    // Only add acceptance criteria for Stories and Tasks, and only if it exists.
    if (acceptanceCriteriaADF && (issueData.type === 'Story' || issueData.type === 'Task')) {
        payload.fields[ACCEPTANCE_CRITERIA_CUSTOM_FIELD_ID] = acceptanceCriteriaADF;
    }
    
    // For regular issues (Story, Task, Bug) inside an Epic
    if (epicKey && issueData.type !== 'Epic' && issueData.type !== 'Sub-task') {
        payload.fields[EPIC_LINK_CUSTOM_FIELD_ID] = epicKey;
    }
    
    // For sub-tasks
    if (parentIssueKey && issueData.type === 'Sub-task') {
      payload.fields.parent = { key: parentIssueKey };
    }

    const response = await fetch(`${jiraUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorText = await response.text();
        let userFriendlyError = `Status ${response.status}`;
        try {
            const errorJson = JSON.parse(errorText);
            const messages = errorJson.errorMessages || [];
            const errors = errorJson.errors ? Object.entries(errorJson.errors).map(([k,v]) => `${k}: ${v}`).join(', ') : '';
            userFriendlyError += ` - ${messages.join('. ')} ${errors}`;
        } catch (e) { /* ignore json parse error */ }
        console.error(`Jira API Error (create issue - ${issueData.summary}): Status ${response.status}`, errorText);
        throw new Error(`Failed to create '${issueData.summary}': ${userFriendlyError}`);
    }

    const createdIssue = await response.json();
    return { key: createdIssue.key, id: createdIssue.id };
}


export async function createJiraTicketsAction(
  credentials: JiraCredentials,
  params: z.infer<typeof CreateJiraTicketsInputSchema>
): Promise<{ success: boolean; message: string; createdTickets: {key: string; summary: string}[] }> {
    const { jiraUrl, email, apiToken } = CredentialsSchema.parse(credentials);
    const { projectId, tickets } = CreateJiraTicketsInputSchema.parse(params);
    const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

    const createdTickets: {key: string; summary: string}[] = [];
    const errors: string[] = [];

    // Recursive function to process tickets
    async function processTicketsRecursive(
      ticketQueue: DraftTicketRecursive[], 
      parentKey?: string, 
      epicKey?: string
    ) {
        for (const ticket of ticketQueue) {
            try {
                // Determine the correct epic context for the current ticket
                const currentEpicKey = ticket.type === 'Epic' ? undefined : epicKey;

                const createdIssue = await createSingleJiraIssue(
                    authHeader, jiraUrl, projectId, ticket, parentKey, currentEpicKey
                );
                
                createdTickets.push({ key: createdIssue.key, summary: ticket.summary });

                if (ticket.children && ticket.children.length > 0) {
                    // If the current ticket is an Epic, its key becomes the epicKey for its children
                    // Otherwise, pass down the existing epicKey
                    const nextEpicKeyForChildren = ticket.type === 'Epic' ? createdIssue.key : epicKey;
                    
                    // The current ticket becomes the parent for its children
                    await processTicketsRecursive(ticket.children, createdIssue.key, nextEpicKeyForChildren);
                }

            } catch (error: any) {
                console.error(`Error processing ticket "${ticket.summary}":`, error);
                errors.push(error.message || `An unknown error occurred for ticket "${ticket.summary}".`);
            }
        }
    }

    await processTicketsRecursive(tickets);

    const totalRequested = (function count(ts: DraftTicketRecursive[]): number {
      return ts.reduce((acc, t) => acc + 1 + (t.children ? count(t.children) : 0), 0);
    })(tickets);

    if (errors.length === 0) {
        return {
            success: true,
            message: `Successfully created all ${createdTickets.length} tickets in Jira.`,
            createdTickets,
        };
    } else if (createdTickets.length > 0) {
        return {
            success: false,
            message: `Partially completed. Created ${createdTickets.length} of ${totalRequested} tickets. Failures: ${errors.join('; ')}`,
            createdTickets,
        };
    } else {
        return {
            success: false,
            message: `Failed to create any tickets. Errors: ${errors.join('; ')}`,
            createdTickets: [],
        };
    }
}

    

    