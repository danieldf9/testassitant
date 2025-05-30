# **App Name**: JiraCaseGen

## Core Features:

- Jira Authentication: Authenticate with a Jira instance using OAuth or API token to access projects.
- Issue Retrieval and Display: Retrieve Stories, Tasks, and Bugs for a selected Jira project and display them in a paginated list with Issue Key, Summary, Issue Type, and Status.
- Test Case Generation: Parse a Jira ticket’s description and acceptance criteria to automatically generate test cases, using an LLM as a tool. If no test cases can be generated, an appropriate message will appear.
- Test Case Preview: Present a preview table of the generated test cases for review before attaching them back to Jira.
- Test Case Attachment: Attach generated test cases back to the original Jira ticket as either attachments (CSV/Excel) or sub-tasks.
- Setup Instructions: Provide clear instructions for running the app and configuring Jira credentials.

## Style Guidelines:

- Primary color: Soft, desaturated blue (#7BB4FF) to evoke a sense of calm productivity.
- Background color: Light gray (#F0F4F8) to provide a clean, neutral backdrop that doesn't distract from the content.
- Accent color: Muted violet (#9CA3E0) for interactive elements, providing a subtle but distinct visual cue.
- Clean and readable sans-serif font for all text elements.
- Responsive design with a sidebar for project selection and a main panel for issue listing.
- Simple and clear icons for actions and status indicators.
- Subtle loading spinners and success/error toasts to provide feedback on actions.