
import { config } from 'dotenv';
config();

import '@/ai/flows/generate-test-cases.ts';
import '@/ai/flows/draft-jira-bug-flow.ts';
import '@/ai/flows/generate-playwright-code.ts';
import '@/ai/flows/analyze-document-flow.ts';
