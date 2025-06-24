
'use server';
/**
 * @fileOverview Generates Playwright test code from a set of test cases and project context.
 *
 * - generatePlaywrightCode - A function that generates a Playwright spec file.
 * - GeneratePlaywrightCodeInput - The input type for the function.
 * - GeneratePlaywrightCodeOutput - The return type for the function.
 */

import {ai} from '@/ai/genkit';
import { GeneratePlaywrightCodeInputSchema, GeneratePlaywrightCodeOutputSchema, type GeneratePlaywrightCodeInput, type GeneratePlaywrightCodeOutput } from '@/lib/schemas';
import { z } from 'zod';

export async function generatePlaywrightCode(input: GeneratePlaywrightCodeInput): Promise<GeneratePlaywrightCodeOutput> {
  return generatePlaywrightCodeFlow(input);
}

const generatePlaywrightCodePrompt = ai.definePrompt({
  name: 'generatePlaywrightCodePrompt',
  input: {schema: GeneratePlaywrightCodeInputSchema},
  output: {schema: GeneratePlaywrightCodeOutputSchema},
  prompt: `You are an expert QA Automation Engineer specializing in writing clean, efficient, and robust Playwright tests using TypeScript. Your task is to generate a complete Playwright test file (\`.spec.ts\`) based on the provided test cases and project context.

Project Context:
- Project Name: {{projectName}}
- Base URL: {{playwrightSetup.baseUrl}}
{{#if playwrightSetup.authFlow}}
- Authentication Flow: {{{playwrightSetup.authFlow}}}
{{/if}}
{{#if playwrightSetup.commonSelectors}}
- Common Selectors (use these as locators where applicable):
{{{playwrightSetup.commonSelectors}}}
{{/if}}

Test Cases to Implement:
---
{{#each testCases}}
Test Case: {{testCaseName}} (ID: {{testCaseId}})
Description: {{description}}
Precondition: {{precondition}}
Steps:
{{#each testSteps}}
- {{{this}}}
{{/each}}
Expected Result: {{expectedResult}}
---
{{/each}}

Instructions for Code Generation:
1.  **File Structure:** Generate a single, complete TypeScript file. Start with the necessary imports from '@playwright/test'.
2.  **Test Block:** Use \`test.describe()\` to group the tests for the project, for example: \`test.describe('{{projectName}} - Feature Tests', () => { ... });\`.
3.  **Individual Tests:** For each provided test case, create a \`test()\` block. The test name should be descriptive, using the test case name, e.g., \`test('{{testCaseName}}', async ({ page }) => { ... });\`.
4.  **Boilerplate/Setup:**
    {{#if playwrightSetup.boilerplate}}
    *   **Crucially, start the file with this provided boilerplate code:**
    \`\`\`typescript
    {{{playwrightSetup.boilerplate}}}
    \`\`\`
    {{else}}
    *   Include the standard Playwright import: \`import { test, expect } from '@playwright/test';\`
    {{/if}}
5.  **Navigation:** Use \`await page.goto('{{{playwrightSetup.baseUrl}}}');\` or a relevant sub-path as the first step in your tests, guided by the test case's precondition or steps.
6.  **Locators:**
    *   Prioritize using the "Common Selectors" provided in the context when they are relevant to a step.
    *   For other elements, use robust locators like \`page.getByRole()\`, \`page.getByLabel() \`, \`page.getByTestId()\`, or other descriptive locators. Avoid relying on brittle CSS or XPath selectors unless necessary.
7.  **Actions:** Convert the "Test Steps" into Playwright actions (e.g., \`await page.click()\`, \`await page.fill()\`, \`await page.selectOption()\`).
8.  **Assertions:** Use the "Expected Result" to write clear Playwright assertions using \`expect()\`. For example, \`await expect(page.locator('h1')).toHaveText('Success!');\`. Assert visibility, text content, or other states as described.
9.  **Comments:** Add comments within the code to link back to the specific test steps. For example: \`// Step: Click the login button\`.
10. **Code Quality:** The code must be clean, well-formatted, and follow best practices. It should be ready to be saved as a \`.spec.ts\` file and run. Do not include any explanatory text outside of the code block. The entire output should be the code itself.
11. **Authentication**: If an authentication flow is described, implement it within a \`test.beforeEach()\` block if it's a prerequisite for all tests.

Now, generate the Playwright test code based on all the above instructions.
`,
});

const generatePlaywrightCodeFlow = ai.defineFlow(
  {
    name: 'generatePlaywrightCodeFlow',
    inputSchema: GeneratePlaywrightCodeInputSchema,
    outputSchema: GeneratePlaywrightCodeOutputSchema,
  },
  async (input) => {
    const {output} = await generatePlaywrightCodePrompt(input);
    if (!output) {
      console.warn("AI analysis for Playwright code returned no output.");
      return { playwrightCode: "// AI failed to generate Playwright code. Please check the input and try again." };
    }
    return output;
  }
);
