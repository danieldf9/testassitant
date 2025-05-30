
import { z } from 'zod';

export const TestCaseSchema = z.object({
  testCaseId: z.string().describe('Unique identifier for the test case (e.g., PROJECTKEY-TEST-001).'),
  testCaseName: z.string().describe('Concise name describing the test case action and expected result.'),
  description: z.string().describe('One-sentence summary of the test case goal.'),
  precondition: z.string().describe('State or setup required before executing the test case.'),
  testData: z.string().describe('Values or inputs to use for the test case.'),
  testSteps: z.array(z.string()).describe('Ordered list of steps to execute for the test case.'),
  expectedResult: z.string().describe('What should happen when the test steps are executed.'),
  actualResult: z.string().optional().describe('Actual outcome of the test case execution (leave blank initially).'),
  status: z.string().optional().describe('Status of the test case (e.g., Pass, Fail, Blocked; leave blank initially).'),
});

export const GenerateTestCasesOutputSchema = z.array(TestCaseSchema).describe('An array of generated test cases.');
export type GenerateTestCasesOutput = z.infer<typeof GenerateTestCasesOutputSchema>;
