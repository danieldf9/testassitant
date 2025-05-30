
"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthForm } from '@/components/AuthForm';
import { ProjectSelector } from '@/components/ProjectSelector';
import { IssueTable } from '@/components/IssueTable';
import { TestCaseDialog } from '@/components/TestCaseDialog';
import type { JiraIssue } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { LogOut, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function JiraCaseGenPage() {
  const { isAuthenticated, credentials, logout } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedIssueForTestCases, setSelectedIssueForTestCases] = useState<JiraIssue | null>(null);
  const [isTestCaseDialogOpen, setIsTestCaseDialogOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);


  const handleProjectSelect = (projectId: string) => {
    setSelectedProjectId(projectId);
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
     // Render nothing or a loading indicator on the server to avoid hydration mismatch
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

      {selectedProjectId ? (
        <IssueTable projectId={selectedProjectId} onGenerateTestCases={handleGenerateTestCases} />
      ) : (
        <Card className="mt-8 shadow-lg border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center text-2xl">
              <Info className="mr-3 h-8 w-8 text-primary" />
              Select a Project
            </CardTitle>
            <CardDescription>
              Please choose a project from the dropdown above to view its issues and generate test cases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Once a project is selected, its issues (Stories, Tasks, and Bugs) will be displayed here. 
              You can then click &quot;Generate Tests&quot; for any issue to use AI to create test cases based on its description and acceptance criteria.
            </p>
            <div className="mt-4">
              <Button variant="link" asChild className="p-0 h-auto">
                <Link href="/setup">Need help with setup?</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
