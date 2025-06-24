
"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthForm } from '@/components/AuthForm';
import { ProjectSelector } from '@/components/ProjectSelector';
import { IssueTable } from '@/components/IssueTable';
import { TestCaseDialog } from '@/components/TestCaseDialog';
import { RaiseBugModal } from '@/components/RaiseBugModal';
import type { JiraIssue } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { LogOut, Info, Bug, FileText } from 'lucide-react'; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function JiraCaseGenPage() {
  const { isAuthenticated, credentials, logout } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | undefined>(undefined);
  const [selectedProjectName, setSelectedProjectName] = useState<string | undefined>(undefined);
  
  const [isRaiseBugModalOpen, setIsRaiseBugModalOpen] = useState(false);
  const [isTestCaseDialogOpen, setIsTestCaseDialogOpen] = useState(false);
  const [selectedIssueForTestCases, setSelectedIssueForTestCases] = useState<JiraIssue | null>(null);

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleProjectSelect = (projectId: string, projectKey?: string, projectName?: string) => {
    setSelectedProjectId(projectId);
    setSelectedProjectKey(projectKey);
    setSelectedProjectName(projectName);
  };

  const handleGenerateTestCases = (issue: JiraIssue) => {
    setSelectedIssueForTestCases(issue);
    setIsTestCaseDialogOpen(true);
  };
  
  const openRaiseBugModal = () => {
    if (selectedProjectId && selectedProjectKey && selectedProjectName) {
      setIsRaiseBugModalOpen(true);
    }
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
          {credentials && (
            <ProjectSelector 
              selectedProjectId={selectedProjectId} 
              onProjectSelect={handleProjectSelect}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
            {selectedProjectId && (
                 <Button variant="destructive" onClick={openRaiseBugModal} className="shadow-sm hover:shadow-md transition-shadow">
                    <Bug className="mr-2 h-4 w-4" /> Raise Bug
                 </Button>
            )}
            <Button variant="outline" onClick={logout} className="shadow-sm hover:shadow-md transition-shadow">
                <LogOut className="mr-2 h-4 w-4" /> Disconnect Jira
            </Button>
        </div>
      </div>

      {!selectedProjectId ? (
        <Card className="mt-8 shadow-lg border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center text-2xl">
              <Info className="mr-3 h-8 w-8 text-primary" />
              Select a Project
            </CardTitle>
            <CardDescription>
              Please choose a project from the dropdown above to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Once a project is selected, you will see a list of issues to generate test cases from, and you can raise new bugs.
            </p>
             <div className="mt-4">
              <Button variant="link" asChild className="p-0 h-auto">
                <Link href="/setup">Need help with setup?</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8">
            <h2 className="text-2xl font-semibold text-foreground mb-4">
                Issues for {selectedProjectName} ({selectedProjectKey})
            </h2>
            <IssueTable
              projectId={selectedProjectId}
              onGenerateTestCases={handleGenerateTestCases}
            />
        </div>
      )}
      
      {isRaiseBugModalOpen && selectedProjectId && selectedProjectKey && selectedProjectName && credentials && (
        <RaiseBugModal
          isOpen={isRaiseBugModalOpen}
          onClose={() => setIsRaiseBugModalOpen(false)}
          projectId={selectedProjectId}
          projectKey={selectedProjectKey}
          projectName={selectedProjectName}
        />
      )}

      <TestCaseDialog
        isOpen={isTestCaseDialogOpen}
        onClose={() => setIsTestCaseDialogOpen(false)}
        issue={selectedIssueForTestCases}
      />
    </div>
  );
}
