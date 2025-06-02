
"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthForm } from '@/components/AuthForm';
import { ProjectSelector } from '@/components/ProjectSelector';
import { IssueTable } from '@/components/IssueTable';
import { TestCaseDialog } from '@/components/TestCaseDialog';
import type { JiraIssue } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { LogOut, Info, FileText, ListChecks } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { DocumentTicketCreator } from '@/components/DocumentTicketCreator'; // New component

type AppMode = 'viewIssues' | 'createFromDocument';

export default function JiraCaseGenPage() {
  const { isAuthenticated, credentials, logout } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | undefined>(undefined);
  const [selectedProjectName, setSelectedProjectName] = useState<string | undefined>(undefined);
  const [selectedIssueForTestCases, setSelectedIssueForTestCases] = useState<JiraIssue | null>(null);
  const [isTestCaseDialogOpen, setIsTestCaseDialogOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [currentMode, setCurrentMode] = useState<AppMode | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleProjectSelect = (projectId: string, projectKey?: string, projectName?: string) => {
    setSelectedProjectId(projectId);
    setSelectedProjectKey(projectKey);
    setSelectedProjectName(projectName);
    setCurrentMode(null); // Reset mode when project changes
  };

  const handleGenerateTestCases = (issue: JiraIssue) => {
    setSelectedIssueForTestCases(issue);
    setIsTestCaseDialogOpen(true);
  };

  const handleCloseTestCaseDialog = () => {
    setIsTestCaseDialogOpen(false);
    setSelectedIssueForTestCases(null);
  };

  if (!isClient) {
    return null;
  }

  if (!isAuthenticated) {
    return <AuthForm />;
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex-grow">
          {credentials && <ProjectSelector selectedProjectId={selectedProjectId} onProjectSelect={handleProjectSelect} />}
        </div>
        <Button variant="outline" onClick={logout} className="shadow-sm hover:shadow-md transition-shadow">
          <LogOut className="mr-2 h-4 w-4" /> Disconnect Jira
        </Button>
      </div>

      {!selectedProjectId ? (
        <Card className="mt-8 shadow-lg border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center text-2xl">
              <Info className="mr-3 h-8 w-8 text-primary" />
              Select a Project
            </CardTitle>
            <CardDescription>
              Please choose a project from the dropdown above to proceed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Once a project is selected, you can choose to either view its existing issues and generate test cases, or create new Jira tickets from a document.
            </p>
            <div className="mt-4">
              <Button variant="link" asChild className="p-0 h-auto">
                <Link href="/setup">Need help with setup?</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : !currentMode ? (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card
            className="cursor-pointer hover:shadow-xl transition-shadow border-primary/20 hover:border-primary/40"
            onClick={() => setCurrentMode('viewIssues')}
          >
            <CardHeader>
              <CardTitle className="flex items-center text-xl">
                <ListChecks className="mr-3 h-7 w-7 text-primary" />
                View Issues & Generate Tests
              </CardTitle>
              <CardDescription>
                Browse existing project issues and generate test cases using AI.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Select this option to see a table of issues from the selected project. You can then generate test cases for individual issues.
              </p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer hover:shadow-xl transition-shadow border-accent/20 hover:border-accent/40"
            onClick={() => setCurrentMode('createFromDocument')}
          >
            <CardHeader>
              <CardTitle className="flex items-center text-xl">
                <FileText className="mr-3 h-7 w-7 text-accent" />
                Create Tickets from Document
              </CardTitle>
              <CardDescription>
                Upload a requirements document (PDF) and use AI to draft new Jira tickets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Select this option to analyze a document, preview AI-suggested tickets (epics, stories, tasks), edit them, and then create them in Jira.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : currentMode === 'viewIssues' ? (
        <IssueTable projectId={selectedProjectId} onGenerateTestCases={handleGenerateTestCases} />
      ) : currentMode === 'createFromDocument' && selectedProjectId && selectedProjectKey && selectedProjectName ? (
        <DocumentTicketCreator projectId={selectedProjectId} projectKey={selectedProjectKey} projectName={selectedProjectName} />
      ) : null}

      {selectedIssueForTestCases && (
        <TestCaseDialog
          issue={selectedIssueForTestCases}
          isOpen={isTestCaseDialogOpen}
          onClose={handleCloseTestCaseDialog}
        />
      )}
    </div>
  );
}
