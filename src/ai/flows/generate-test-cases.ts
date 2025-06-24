
'use server';

/**
 * @fileOverview Generates test cases from a Jira ticket description and acceptance criteria.
 *
 * - generateTestCases - A function that generates test cases for a given Jira ticket.
 * - GenerateTestCasesInput - The input type for the generateTestCases function.
 * - GenerateTestCasesOutput - The return type for the generateTestCases function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { GenerateTestCasesInputSchema, GenerateTestCasesOutputSchema, type GenerateTestCasesInput, type GenerateTestCasesOutput } from '@/lib/schemas';


export async function generateTestCases(input: GenerateTestCasesInput): Promise<GenerateTestCasesOutput> {
  return generateTestCasesFlow(input);
}

const generateTestCasesPrompt = ai.definePrompt({
  name: 'generateTestCasesPrompt',
  input: {schema: GenerateTestCasesInputSchema},
  output: {schema: GenerateTestCasesOutputSchema},
  prompt: `You are an expert test case generator for Jira tickets. Your task is to generate a comprehensive set of test cases based on the provided Jira ticket description and acceptance criteria. The goal is to cover positive paths, negative paths, edge cases, and accessibility considerations.

Each test case must include the following fields:
- testCaseId: A unique identifier for the test case, following the format "[PROJECTKEY]-TEST-XXX" where XXX is a padded number (e.g., JIRA-TEST-001, JIRA-TEST-002). You will need to infer the project key from the ticket details if available, or use a placeholder like "PROJ".
- testCaseName: A concise, descriptive name for the test case, summarizing the action and expected outcome.
- description: A one-sentence summary of the test case's goal.
- precondition: The state or setup required before executing the test case (e.g., "User is logged in and on the dashboard page."). Can be "None" if not applicable.
- testSteps: A clear, ordered list of steps to execute the test case.
- expectedResult: A detailed description of the expected outcome after executing the test steps.
- actualResult: Leave this field blank.
- status: Leave this field blank.

Here is the Jira ticket information:
- Description: {{{description}}}
- Acceptance Criteria: {{{acceptanceCriteria}}}

Based on this information, generate a complete list of test cases. Be thorough and think about different user scenarios. The output must be a JSON array of test case objects.
`,
});

const generateTestCasesFlow = ai.defineFlow(
  {
    name: 'generateTestCasesFlow',
    inputSchema: GenerateTestCasesInputSchema,
    outputSchema: GenerateTestCasesOutputSchema,
  },
  async input => {
    const {output} = await generateTestCasesPrompt(input);
    if (!output) {
        console.warn("AI analysis for test cases returned no output.");
        return [];
    }
    return output;
  }
);
