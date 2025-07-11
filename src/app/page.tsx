
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
import { Input } from '@/components/ui/input';
import { LogOut, Info, Bug, FileText, Search, FileUp } from 'lucide-react'; 
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

  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleProjectSelect = (projectId: string, projectKey?: string, projectName?: string) => {
    setSelectedProjectId(projectId);
    setSelectedProjectKey(projectKey);
    setSelectedProjectName(projectName);
    setSearchTerm('');
    setActiveSearch('');
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
  
  const handleSearch = () => {
    setActiveSearch(searchTerm);
  };

  const clearSearch = () => {
    setSearchTerm('');
    setActiveSearch('');
  };

  if (!isClient) {
    return null; 
  }

  if (!isAuthenticated) {
    return <AuthForm />;
  }

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
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
                <>
                  <Button variant="outline" asChild className="shadow-sm hover:shadow-md transition-shadow">
                     <Link href="/document-importer">
                        <FileUp className="mr-2 h-4 w-4" /> Import from Doc
                     </Link>
                  </Button>
                  <Button variant="destructive" onClick={openRaiseBugModal} className="shadow-sm hover:shadow-md transition-shadow">
                    <Bug className="mr-2 h-4 w-4" /> Raise Bug
                  </Button>
                </>
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
              Once a project is selected, you can view issues, generate test cases, raise bugs, or import tickets from a document.
            </p>
             <div className="mt-4">
              <Button variant="link" asChild className="p-0 h-auto">
                <Link href="/setup">Need help with setup?</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6">
            <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder={`Search issues in ${selectedProjectName}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                        className="pl-10"
                    />
                </div>
                <Button onClick={handleSearch}>Search</Button>
                {activeSearch && (
                    <Button variant="ghost" onClick={clearSearch}>Clear</Button>
                )}
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-4">
                Issues for {selectedProjectName} ({selectedProjectKey})
            </h2>
            <IssueTable
              projectId={selectedProjectId}
              onActionClick={handleGenerateTestCases}
              actionType="generateTests"
              searchQuery={activeSearch}
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
