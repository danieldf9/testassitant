
"use client";

import type { JiraIssue } from '@/app/actions';
import { generateTestCasesAction, attachTestCasesToJiraAction, convertTestCasesToExcel } from '@/app/actions';
import type { GenerateTestCasesOutput } from '@/ai/flows/generate-test-cases';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
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
import { Loader2, AlertCircle, Wand2, FileSpreadsheet, Download } from 'lucide-react';
import React, { useState, useEffect, useCallback } from 'react';

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
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (isOpen && issue) {
      // Reset state on open
      setGeneratedTestCases([]);
      setError(null);
      setIsLoading(true);

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
    setIsDownloading(false);
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

  const handleDownloadExcel = async () => {
    if (!issue || generatedTestCases.length === 0) return;
    setIsDownloading(true);
    try {
        const buffer = await convertTestCasesToExcel(generatedTestCases);
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `test-cases-${issue.key}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        toast({
            title: "Download Started",
            description: "Your test cases Excel file is downloading.",
        });
    } catch (err: any) {
        console.error("Failed to download excel file", err);
        toast({
            title: "Download Failed",
            description: "Could not create the Excel file for download.",
            variant: "destructive",
        });
    } finally {
        setIsDownloading(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDialogClose()}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-2xl">Generated Test Cases for {issue?.key}</DialogTitle>
          <DialogDescription>
            Review AI-generated test cases for &quot;{issue?.summary}&quot;. Attach them to Jira as a formatted Excel file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-hidden px-6 py-4">
          <div className="flex flex-col h-full overflow-hidden">
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
        </div>

        <DialogFooter className="p-6 border-t bg-background">
          <div className="flex flex-col sm:flex-row items-center justify-end w-full gap-4">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleDialogClose} disabled={isAttaching || isDownloading}>Cancel</Button>
              <Button onClick={handleDownloadExcel} variant="secondary" disabled={isDownloading || generatedTestCases.length === 0}>
                {isDownloading ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<Download className="mr-2 h-4 w-4" />)}
                {isDownloading ? 'Downloading...' : 'Download as Excel'}
              </Button>
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

    