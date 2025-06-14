
"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../srcold/contexts/AuthContext';
import { AuthForm } from '../../srcold/components/AuthForm';
import { ProjectSelector } from '../../srcold/components/ProjectSelector';
import { IssueTable } from '../../srcold/components/IssueTable';
import { TestCaseDialog } from '../../srcold/components/TestCaseDialog';
import { DocumentTicketCreator } from '../../srcold/components/DocumentTicketCreator'; 
import { RaiseBugModal } from '@/components/RaiseBugModal'; // New component
import type { JiraIssue } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { LogOut, Info, FileText, ListChecks, ArrowLeft, Bug, Eye } from 'lucide-react'; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

type AppMode = 'viewIssues' | 'createFromDocument' | 'raiseBug' | null;

export default function JiraCaseGenPage() {
  const { isAuthenticated, credentials, logout } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | undefined>(undefined);
  const [selectedProjectName, setSelectedProjectName] = useState<string | undefined>(undefined);
  
  const [selectedIssueForTestCases, setSelectedIssueForTestCases] = useState<JiraIssue | null>(null);
  const [isTestCaseDialogOpen, setIsTestCaseDialogOpen] = useState(false);
  const [isRaiseBugModalOpen, setIsRaiseBugModalOpen] = useState(false);

  const [isClient, setIsClient] = useState(false);
  const [currentAppMode, setCurrentAppMode] = useState<AppMode>(null); // For main content area

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleProjectSelect = (projectId: string, projectKey?: string, projectName?: string) => {
    setSelectedProjectId(projectId);
    setSelectedProjectKey(projectKey);
    setSelectedProjectName(projectName);
    setCurrentAppMode(null); // Reset mode when project changes
    setIsRaiseBugModalOpen(false); // Close bug modal if open
  };

  const handleGenerateTestCases = (issue: JiraIssue) => {
    setSelectedIssueForTestCases(issue);
    setIsTestCaseDialogOpen(true);
  };

  const handleCloseTestCaseDialog = () => {
    setIsTestCaseDialogOpen(false);
    setSelectedIssueForTestCases(null);
  };

  const handleBackToModeSelection = () => {
    setCurrentAppMode(null);
  };

  const openRaiseBugModal = () => {
    if (selectedProjectId && selectedProjectKey && selectedProjectName) {
      setIsRaiseBugModalOpen(true);
      setCurrentAppMode('raiseBug'); // Also set app mode, though modal might overlay
    }
  };

  if (!isClient) {
    return null; 
  }

  if (!isAuthenticated) {
    return <AuthForm />;
  }

  const getModeTitle = () => {
    if (currentAppMode === 'viewIssues' && selectedProjectName) {
      return `Viewing Issues for ${selectedProjectName}`;
    }
    if (currentAppMode === 'createFromDocument' && selectedProjectName) {
      return `Creating Tickets from Document for ${selectedProjectName}`;
    }
    // No title needed if raiseBug modal is open, or handled by modal itself
    return selectedProjectName ? `Project: ${selectedProjectName}` : 'JiraCaseGen';
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex-grow">
          {credentials && (
            <ProjectSelector 
              selectedProjectId={selectedProjectId} 
              onProjectSelect={handleProjectSelect} 
              disabled={!!currentAppMode && currentAppMode !== 'raiseBug'} // Allow project change even if bug modal is conceptionalized
            />
          )}
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
              Once a project is selected, you can choose an action below.
            </p>
            <div className="mt-4">
              <Button variant="link" asChild className="p-0 h-auto">
                <Link href="/setup">Need help with setup?</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : !currentAppMode ? (
        <div className="mt-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">
                {selectedProjectName ? `Actions for ${selectedProjectName} (${selectedProjectKey})` : 'Select an Action'}
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
            <Button
                variant="outline"
                className="p-6 h-auto flex-col items-start text-left hover:shadow-lg transition-shadow border-primary/30 hover:border-primary/60"
                onClick={() => setCurrentAppMode('viewIssues')}
            >
                <ListChecks className="mr-3 h-7 w-7 text-primary mb-2" />
                <span className="font-semibold text-lg">View Issues & Tests</span>
                <p className="text-sm text-muted-foreground mt-1">Browse project issues and generate AI test cases.</p>
            </Button>
            <Button
                variant="outline"
                className="p-6 h-auto flex-col items-start text-left hover:shadow-lg transition-shadow border-gray-300 dark:border-gray-700"
                onClick={() => { /* Placeholder for Watchlist */ alert("Watchlist feature coming soon!"); }}
            >
                <Eye className="mr-3 h-7 w-7 text-gray-500 mb-2" />
                <span className="font-semibold text-lg">Watchlist</span>
                <p className="text-sm text-muted-foreground mt-1">Track important issues (coming soon).</p>
            </Button>
            <Button
                variant="outline"
                className="p-6 h-auto flex-col items-start text-left hover:shadow-lg transition-shadow border-destructive/30 hover:border-destructive/60"
                onClick={openRaiseBugModal}
            >
                <Bug className="mr-3 h-7 w-7 text-destructive mb-2" />
                <span className="font-semibold text-lg">Raise Bug to JIRA</span>
                <p className="text-sm text-muted-foreground mt-1">Report a new bug with AI assistance.</p>
            </Button>
            <Button
                variant="outline"
                className="p-6 h-auto flex-col items-start text-left hover:shadow-lg transition-shadow border-accent/30 hover:border-accent/60 md:col-span-1" // Span 1 on md, will wrap or be separate line
                onClick={() => setCurrentAppMode('createFromDocument')}
            >
                <FileText className="mr-3 h-7 w-7 text-accent mb-2" />
                <span className="font-semibold text-lg">Create from Document</span>
                <p className="text-sm text-muted-foreground mt-1">Draft tickets from a PDF document.</p>
            </Button>
            </div>
        </div>
      ) : (
        <div className="mt-6">
          {currentAppMode !== 'raiseBug' && ( // Don't show back button if bug modal is the "mode"
            <div className="flex items-center mb-6">
                <Button variant="outline" size="sm" onClick={handleBackToModeSelection} className="mr-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Actions
                </Button>
                <h2 className="text-xl font-semibold text-foreground">{getModeTitle()}</h2>
            </div>
          )}

          {currentAppMode === 'viewIssues' ? (
            <IssueTable projectId={selectedProjectId} onGenerateTestCases={handleGenerateTestCases} />
          ) : currentAppMode === 'createFromDocument' && selectedProjectId && selectedProjectKey && selectedProjectName ? (
            <DocumentTicketCreator projectId={selectedProjectId} projectKey={selectedProjectKey} projectName={selectedProjectName} />
          ) : null}
        </div>
      )}

      {selectedIssueForTestCases && (
        <TestCaseDialog
          issue={selectedIssueForTestCases}
          isOpen={isTestCaseDialogOpen}
          onClose={handleCloseTestCaseDialog}
        />
      )}
      
      {isRaiseBugModalOpen && selectedProjectId && selectedProjectKey && selectedProjectName && credentials && (
        <RaiseBugModal
          isOpen={isRaiseBugModalOpen}
          onClose={() => {
            setIsRaiseBugModalOpen(false);
            // If closing bug modal returns to action selection
            if (currentAppMode === 'raiseBug') setCurrentAppMode(null); 
          }}
          projectId={selectedProjectId}
          projectKey={selectedProjectKey}
          projectName={selectedProjectName}
          credentials={credentials}
        />
      )}
    </div>
  );
}
