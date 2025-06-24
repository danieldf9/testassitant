
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { PlaywrightSetupSchema, type PlaywrightSetup, type GenerateTestCasesOutput } from '@/lib/schemas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { ProjectSelector } from '@/components/ProjectSelector';
import { IssueTable } from '@/components/IssueTable';
import { generateTestCasesAction, generatePlaywrightCodeAction, type JiraIssue } from '@/app/actions';
import { Bot, Info, Loader2, AlertCircle, Wand2, Clipboard, Check, Table as TableIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function PlaywrightGeneratorPage() {
  const { isAuthenticated, credentials } = useAuth();
  const { toast } = useToast();
  
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedProjectName, setSelectedProjectName] = useState<string | undefined>(undefined);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | undefined>(undefined);

  const [selectedIssue, setSelectedIssue] = useState<JiraIssue | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedTestCases, setGeneratedTestCases] = useState<GenerateTestCasesOutput | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => { setIsClient(true); }, []);

  const handleProjectSelect = (projectId: string, projectKey?: string, projectName?: string) => {
    setSelectedProjectId(projectId);
    setSelectedProjectKey(projectKey);
    setSelectedProjectName(projectName);
    setSelectedIssue(null);
    setGeneratedCode(null);
    setGeneratedTestCases(null);
    setError(null);
  };
  
  const handleGenerateCodeClick = (issue: JiraIssue) => {
    let playwrightSetup: PlaywrightSetup | null = null;
    try {
      const savedSetup = localStorage.getItem(`playwrightSetup_${issue.project.id}`);
      if (savedSetup) {
        playwrightSetup = PlaywrightSetupSchema.parse(JSON.parse(savedSetup));
      }
    } catch {
      playwrightSetup = null;
    }

    if (!playwrightSetup) {
      toast({
        title: "Playwright Setup Required",
        description: "Please configure the Playwright settings for this project before generating code.",
        variant: "destructive",
      });
      return;
    }
    
    setSelectedIssue(issue);
    setGeneratedCode(null);
    setGeneratedTestCases(null);
    setError(null);
    setIsGenerating(true);

    generateTestCasesAction({
      description: issue.description || '',
      acceptanceCriteria: issue.acceptanceCriteria || '',
    })
    .then(testCases => {
      setGeneratedTestCases(testCases);
      if (testCases.length === 0) {
        throw new Error("No test cases could be generated from the issue. Cannot proceed to code generation.");
      }
      return generatePlaywrightCodeAction({
        testCases,
        playwrightSetup: playwrightSetup!,
        projectName: issue.project.name,
      });
    })
    .then(codeResult => {
      setGeneratedCode(codeResult.playwrightCode);
    })
    .catch(err => {
      setError(err.message || "An unexpected error occurred during generation.");
      toast({
        title: 'Generation Failed',
        description: err.message,
        variant: 'destructive',
      });
    })
    .finally(() => {
      setIsGenerating(false);
    });
  };

  const copyToClipboard = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2000);
    }
  };

  if (!isClient) return null;

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto p-4 md:p-8 flex justify-center">
          <Alert className="max-w-xl">
              <Info className="h-4 w-4" />
              <AlertTitle>Not Connected</AlertTitle>
              <AlertDescription>Please connect to Jira on the main page to use the Playwright Generator.</AlertDescription>
          </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
        <Card className="shadow-lg mb-8">
            <CardHeader>
                <CardTitle className="text-3xl font-bold flex items-center">
                    <Bot className="mr-3 h-8 w-8 text-primary" />
                    Playwright Code Generator
                </CardTitle>
                <CardDescription className="text-lg text-muted-foreground">
                    Select a project, choose an issue, and let AI generate your Playwright test code.
                    <Button variant="link" asChild className="p-0 h-auto ml-1 text-lg">
                      <Link href="/playwright-setup">Go to Setup</Link>
                    </Button>
                </CardDescription>
            </CardHeader>
             <CardContent>
                <ProjectSelector 
                    selectedProjectId={selectedProjectId} 
                    onProjectSelect={handleProjectSelect}
                    disabled={isGenerating}
                />
            </CardContent>
        </Card>

        {selectedProjectId && (
            <IssueTable
              projectId={selectedProjectId}
              onActionClick={handleGenerateCodeClick}
              actionType="generateCode"
              isActionDisabled={isGenerating}
            />
        )}

        {isGenerating && (
            <div className="flex flex-col items-center justify-center text-center mt-10 p-8 border-2 border-dashed rounded-lg">
                <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                <p className="text-xl font-semibold text-foreground">Generating Code for {selectedIssue?.key}</p>
                <p className="text-muted-foreground">First, AI is creating test cases, then it will write the code... Please wait.</p>
            </div>
        )}
        
        {!isGenerating && error && (
            <Alert variant="destructive" className="mt-8">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Generation Error for {selectedIssue?.key}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        )}

        {!isGenerating && (generatedTestCases || generatedCode) && (
            <div className="mt-8">
                <h2 className="text-2xl font-semibold text-foreground mb-4">
                    Generated Artifacts for {selectedIssue?.key}: <span className="text-muted-foreground font-normal">{selectedIssue?.summary}</span>
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[70vh]">
                    <Card className="flex flex-col h-full">
                        <CardHeader className="flex-shrink-0">
                            <CardTitle className="flex items-center"><TableIcon className="mr-2 h-5 w-5" /> Test Cases</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-grow overflow-hidden">
                           <ScrollArea className="h-full pr-4">
                            <Table>
                              <TableHeader className="sticky top-0 bg-card"><TableRow><TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>Steps</TableHead></TableRow></TableHeader>
                              <TableBody>
                                {generatedTestCases?.map((tc, index) => (
                                  <TableRow key={tc.testCaseId || index}><TableCell className="font-medium align-top text-xs">{tc.testCaseId}</TableCell><TableCell className="align-top text-xs">{tc.testCaseName}</TableCell><TableCell className="align-top"><ul className="list-decimal list-inside text-xs space-y-1">{tc.testSteps.map((step, i) => <li key={i}>{step}</li>)}</ul></TableCell></TableRow>
                                ))}
                              </TableBody>
                            </Table>
                           </ScrollArea>
                        </CardContent>
                    </Card>
                     <Card className="flex flex-col h-full">
                        <CardHeader className="flex-shrink-0">
                            <CardTitle className="flex items-center"><Bot className="mr-2 h-5 w-5" /> Playwright Code</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-grow overflow-hidden relative">
                             <ScrollArea className="h-full bg-gray-900 rounded-md">
                                <SyntaxHighlighter language="typescript" style={vscDarkPlus} customStyle={{ margin: 0, padding: '1rem', height: '100%' }}>
                                  {generatedCode || "// Code will appear here..."}
                                </SyntaxHighlighter>
                            </ScrollArea>
                            {generatedCode && (
                                <Button variant="ghost" size="icon" className="absolute top-2 right-14 h-7 w-7 text-gray-300 hover:text-white hover:bg-white/20" onClick={copyToClipboard}>
                                    {hasCopied ? <Check className="h-4 w-4 text-green-400" /> : <Clipboard className="h-4 w-4" />}
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        )}
    </div>
  );
}
