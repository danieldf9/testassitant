
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
  prompt: `You are an expert QA Automation Engineer specializing in writing clean, efficient, and robust Playwright tests using TypeScript. Your task is to generate a single, complete Playwright test file (\`.spec.ts\`) that implements the **Page Object Model (POM)** pattern based on the provided test cases and project context.

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
1.  **Page Object Model (POM):**
    *   Analyze the test cases to identify distinct pages or major components of the application (e.g., LoginPage, Dashboard, ProfilePage).
    *   For each identified page, create a TypeScript class (e.g., \`class LoginPage\`).
    *   Inside each Page Object class, define locators for the interactive elements on that page. Use the "Common Selectors" from the context where applicable.
    *   Create methods within the class that represent user actions on that page (e.g., \`async login(username, password)\`, \`async goto()\`, \`async search(term)\`). These methods will use the defined locators to interact with the page.
    *   The Page Object classes should be defined at the **top of the generated file**, before the test blocks.

2.  **File Structure:** Generate a single, complete TypeScript file. It should start with the necessary imports, followed by the Page Object class definitions, and then the test blocks.
3.  **Test Block:** Use \`test.describe()\` to group the tests for the project, for example: \`test.describe('{{projectName}} - Feature Tests', () => { ... });\`.
4.  **Individual Tests:** For each provided test case, create a \`test()\` block. The test name should be descriptive, using the test case name. Inside the test, instantiate the necessary Page Object(s) (e.g., \`const loginPage = new LoginPage(page);\`). Use the methods on your page objects to perform the test steps (e.g., \`await loginPage.login('user', 'pass');\`).
5.  **Boilerplate/Setup:**
    {{#if playwrightSetup.boilerplate}}
    *   **Crucially, start the file with this provided boilerplate code:**
    \`\`\`typescript
    {{{playwrightSetup.boilerplate}}}
    \`\`\`
    {{else}}
    *   Include the standard Playwright import: \`import { test, expect, type Page } from '@playwright/test';\`
    {{/if}}
6.  **Navigation:** Navigation to the base URL or specific pages should be handled by methods within the Page Objects (e.g., \`await page.goto()\`).
7.  **Locators:**
    *   Prioritize using the "Common Selectors" provided in the context when they are relevant to a step.
    *   For other elements, use robust locators like \`page.getByRole()\`, \`page.getByLabel() \`, \`page.getByTestId()\`, or other descriptive locators. Avoid relying on brittle CSS or XPath selectors unless necessary.
8.  **Actions:** The test steps should be implemented by calling methods on the Page Object instances.
9.  **Assertions:** Use the "Expected Result" to write clear Playwright assertions using \`expect()\`. Assertions can check the URL, visibility of elements, or text content by calling methods or accessing locators on the Page Objects (e.g., \`await expect(dashboardPage.header).toBeVisible();\`).
10. **Comments:** Add comments within the test code to link back to the specific test steps. For example: \`// Step: Click the login button\`.
11. **Code Quality:** The code must be clean, well-formatted, and follow best practices. It should be ready to be saved as a \`.spec.ts\` file and run. Do not include any explanatory text outside of the code block. The entire output should be the code itself.
12. **Authentication**: If an authentication flow is described, implement it within a \`test.beforeEach()\` block if it's a prerequisite for all tests, and it should use the Page Objects.

**Example Structure:**
\`\`\`typescript
import { test, expect, type Page } from '@playwright/test';

// --- Page Objects ---
class LoginPage {
  readonly page: Page;
  readonly usernameInput = this.page.locator('#username');
  readonly passwordInput = this.page.locator('#password');
  readonly loginButton = this.page.getByRole('button', { name: 'Login' });

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('{{{playwrightSetup.baseUrl}}}/login');
  }

  async login(username, password) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}

// --- Tests ---
test.describe('{{projectName}} - Feature Tests', () => {
  test('{{testCaseName}}', async ({ page }) => {
    const loginPage = new LoginPage(page);
    
    // Step: Go to login page
    await loginPage.goto();
    
    // Step: Perform login
    await loginPage.login('testuser', 'password123');

    // Expected Result: Should be on dashboard
    await expect(page).toHaveURL(/.*dashboard/);
  });
});
\`\`\`

Now, generate the Playwright test code based on all the above instructions, ensuring the Page Object Model pattern is used.
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
