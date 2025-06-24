
"use client";

import type { JiraIssue } from '@/app/actions';
import { generateTestCasesAction, attachTestCasesToJiraAction, generatePlaywrightCodeAction } from '@/app/actions';
import type { GenerateTestCasesOutput } from '@/ai/flows/generate-test-cases';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { PlaywrightSetup, PlaywrightSetupSchema } from '@/lib/schemas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, Wand2, FileSpreadsheet, Code, Clipboard, Check } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import Link from 'next/link';

interface TestCaseDialogProps {
  issue: JiraIssue | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TestCaseDialog({ issue, isOpen, onClose }: TestCaseDialogProps) {
  const { credentials } = useAuth();
  const { toast } = useToast();
  const [generatedTestCases, setGeneratedTestCases] = useState<GenerateTestCasesOutput>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  // State for playwright code generation
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [playwrightSetup, setPlaywrightSetup] = useState<PlaywrightSetup | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  useEffect(() => {
    if (isOpen && issue) {
      // Reset state on open
      setGeneratedTestCases([]);
      setGeneratedCode(null);
      setError(null);
      setCodeError(null);
      setHasCopied(false);
      setIsLoading(true);

      // Check for playwright setup in localstorage
      try {
        const savedSetup = localStorage.getItem(`playwrightSetup_${issue.project.id}`);
        if (savedSetup) {
          setPlaywrightSetup(PlaywrightSetupSchema.parse(JSON.parse(savedSetup)));
        } else {
          setPlaywrightSetup(null);
        }
      } catch {
        setPlaywrightSetup(null);
      }


      generateTestCasesAction({
        description: issue.description || '',
        acceptanceCriteria: issue.acceptanceCriteria || '',
      })
        .then((data) => {
          setGeneratedTestCases(data);
          if (data.length === 0) {
            toast({
              title: "No Test Cases Generated",
              description: "The AI couldn't generate test cases. Try adding more detail to the issue description or acceptance criteria.",
              variant: "default",
            });
          }
        })
        .catch((err) => {
          console.error(err);
          setError(err.message || 'Failed to generate test cases.');
          toast({
            title: 'Error Generating Test Cases',
            description: err.message || 'An unexpected error occurred.',
            variant: 'destructive',
          });
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, issue, toast]);
  
  const handleDialogClose = useCallback(() => {
    // Fully reset state on close to ensure clean slate for next opening
    setGeneratedTestCases([]);
    setError(null);
    setIsLoading(false);
    setIsAttaching(false);
    setGeneratedCode(null);
    setCodeError(null);
    setIsGeneratingCode(false);
    setHasCopied(false);
    onClose();
  }, [onClose]);

  const handleAttachToJira = async () => {
    if (!credentials || !issue || generatedTestCases.length === 0) return;

    setIsAttaching(true);
    setError(null);
    try {
      const result = await attachTestCasesToJiraAction(credentials, {
        issueKey: issue.key,
        testCases: generatedTestCases,
        projectId: issue.project.id,
      });

      toast({
        title: result.success ? 'Success' : 'Error',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
        className: result.success ? "bg-green-100 border-green-300 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200" : "",
        duration: 10000,
      });
      if (result.success) { 
        handleDialogClose();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to attach test cases to Jira.');
      toast({
        title: 'Error Attaching Test Cases',
        description: err.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsAttaching(false);
    }
  };

  const handleGenerateCode = async () => {
    if (!playwrightSetup || !issue) return;

    setIsGeneratingCode(true);
    setGeneratedCode(null);
    setCodeError(null);

    try {
      const result = await generatePlaywrightCodeAction({
        testCases: generatedTestCases,
        playwrightSetup,
        projectName: issue.project.name,
      });
      setGeneratedCode(result.playwrightCode);
    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || 'An unexpected error occurred while generating code.';
      setCodeError(errorMessage);
      toast({
        title: 'Error Generating Code',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const copyToClipboard = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDialogClose()}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-2xl">Generated Test Cases for {issue?.key}</DialogTitle>
          <DialogDescription>
            Review AI-generated test cases for &quot;{issue?.summary}&quot;. Attach them to Jira or generate Playwright code.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-hidden px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Test Cases Column */}
          <div className="flex flex-col h-full overflow-hidden">
            <h3 className="text-lg font-semibold mb-2">Test Cases</h3>
            {isLoading && (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">AI is crafting test cases...</p>
              </div>
            )}
            {!isLoading && error && (
              <Alert variant="destructive" className="my-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
            )}
            {!isLoading && !error && generatedTestCases.length === 0 && (
              <Alert className="my-4"><Wand2 className="h-4 w-4" /><AlertTitle>No Test Cases Generated</AlertTitle><AlertDescription>The AI could not generate test cases based on the issue details.</AlertDescription></Alert>
            )}
            {!isLoading && !error && generatedTestCases.length > 0 && (
              <ScrollArea className="h-full pr-4 border rounded-md">
                <Table>
                  <TableHeader className="sticky top-0 bg-background shadow-sm"><TableRow><TableHead className="w-[120px]">ID</TableHead><TableHead>Name</TableHead><TableHead>Precondition</TableHead><TableHead>Steps</TableHead><TableHead>Expected Result</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {generatedTestCases.map((tc, index) => (
                      <TableRow key={tc.testCaseId || index}><TableCell className="font-medium align-top">{tc.testCaseId}</TableCell><TableCell className="align-top">{tc.testCaseName}</TableCell><TableCell className="align-top">{tc.precondition}</TableCell><TableCell className="align-top"><ul className="list-decimal list-inside text-xs space-y-1">{tc.testSteps.map((step, i) => <li key={i}>{step}</li>)}</ul></TableCell><TableCell className="align-top">{tc.expectedResult}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>

          {/* Playwright Code Column */}
          <div className="flex flex-col h-full overflow-hidden">
             <h3 className="text-lg font-semibold mb-2">Playwright Code</h3>
             {!playwrightSetup ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Playwright Setup Required</AlertTitle>
                  <AlertDescription>
                    To generate test code, you must first configure the Playwright settings for this project.
                    <Button variant="link" asChild className="p-0 h-auto ml-1">
                      <Link href="/playwright-setup">Go to Setup</Link>
                    </Button>
                  </AlertDescription>
                </Alert>
             ) : isGeneratingCode ? (
                <div className="flex flex-col items-center justify-center h-full"><Loader2 className="h-16 w-16 animate-spin text-primary mb-4" /><p className="text-lg text-muted-foreground">AI is writing Playwright code...</p></div>
             ) : codeError ? (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Code Generation Error</AlertTitle><AlertDescription>{codeError}</AlertDescription></Alert>
             ) : generatedCode ? (
               <div className="relative h-full">
                <ScrollArea className="h-full pr-4 border rounded-md bg-gray-900">
                    <SyntaxHighlighter language="typescript" style={vscDarkPlus} customStyle={{ margin: 0, padding: '1rem', height: '100%' }}>
                      {generatedCode}
                    </SyntaxHighlighter>
                </ScrollArea>
                 <Button variant="ghost" size="icon" className="absolute top-2 right-6 h-7 w-7 text-gray-300 hover:text-white hover:bg-white/20" onClick={copyToClipboard}>
                    {hasCopied ? <Check className="h-4 w-4 text-green-400" /> : <Clipboard className="h-4 w-4" />}
                 </Button>
               </div>
             ) : (
                <div className="flex items-center justify-center h-full border-2 border-dashed rounded-md">
                   <Button onClick={handleGenerateCode} disabled={isGeneratingCode || generatedTestCases.length === 0}><Code className="mr-2 h-4 w-4"/>Generate Playwright Code</Button>
                </div>
             )}
          </div>
        </div>

        <DialogFooter className="p-6 border-t bg-background">
          <div className="flex flex-col sm:flex-row items-center justify-end w-full gap-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDialogClose} disabled={isAttaching}>Cancel</Button>
              <Button onClick={handleAttachToJira} disabled={isAttaching || generatedTestCases.length === 0}>
                {isAttaching ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<FileSpreadsheet className="mr-2 h-4 w-4" />)}
                {isAttaching ? 'Attaching...' : 'Attach as Excel File'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
