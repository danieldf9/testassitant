
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
import { GenerateTestCasesOutputSchema, type GenerateTestCasesOutput } from '@/lib/schemas';

const GenerateTestCasesInputSchema = z.object({
  description: z.string().describe('The description of the Jira ticket.'),
  acceptanceCriteria: z.string().optional().describe('The acceptance criteria of the Jira ticket.'),
});
export type GenerateTestCasesInput = z.infer<typeof GenerateTestCasesInputSchema>;

// GenerateTestCasesOutput and its schema are now imported from '@/lib/schemas'

export async function generateTestCases(input: GenerateTestCasesInput): Promise<GenerateTestCasesOutput> {
  return generateTestCasesFlow(input);
}

const generateTestCasesPrompt = ai.definePrompt({
  name: 'generateTestCasesPrompt',
  input: {schema: GenerateTestCasesInputSchema},
  output: {schema: GenerateTestCasesOutputSchema},
  prompt: `You are an expert test case generator for Jira tickets. Given a Jira ticket's description and acceptance criteria, you will generate as many comprehensive test cases as possible.

Each test case must include the following fields:
- Test Case ID: Unique identifier for the test case (e.g., PROJECTKEY-TEST-001).
- Test Case Name: Concise name describing the test case action and expected result.
- Description/Summary: One-sentence summary of the test case goal.
- Precondition: State or setup required before executing the test case.
- Test Data: Values or inputs to use for the test case.
- Test Steps: Ordered list of steps to execute for the test case.
- Expected Result: What should happen when the test steps are executed.
- Actual Result: Leave blank.
- Status: Leave blank.

Description: {{{description}}}
Acceptance Criteria: {{{acceptanceCriteria}}}

Output the test cases as a JSON array.
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
    return output!;
  }
);
