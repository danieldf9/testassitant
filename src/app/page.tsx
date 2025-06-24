
"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthForm } from '@/components/AuthForm';
import { ProjectSelector } from '@/components/ProjectSelector';
import { RaiseBugModal } from '@/components/RaiseBugModal';
import type { JiraIssue } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { LogOut, Info, Bug, Eye, ListChecks, FileText } from 'lucide-react'; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function JiraCaseGenPage() {
  const { isAuthenticated, credentials, logout } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | undefined>(undefined);
  const [selectedProjectName, setSelectedProjectName] = useState<string | undefined>(undefined);
  
  const [isRaiseBugModalOpen, setIsRaiseBugModalOpen] = useState(false);

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleProjectSelect = (projectId: string, projectKey?: string, projectName?: string) => {
    setSelectedProjectId(projectId);
    setSelectedProjectKey(projectKey);
    setSelectedProjectName(projectName);
    setIsRaiseBugModalOpen(false);
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
              Please choose a project from the dropdown above to get started.
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
      ) : (
        <div className="mt-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">
                {selectedProjectName ? `Actions for ${selectedProjectName} (${selectedProjectKey})` : 'Select an Action'}
            </h2>
            <div className="grid gap-4 md:grid-cols-3">
            <Button
                variant="outline"
                className="p-6 h-auto flex-col items-start text-left hover:shadow-lg transition-shadow border-gray-300 dark:border-gray-700"
                onClick={() => { alert("Dashboard feature coming soon!"); }}
            >
                <ListChecks className="mr-3 h-7 w-7 text-gray-500 mb-2" />
                <span className="font-semibold text-lg">Dashboard</span>
                <p className="text-sm text-muted-foreground mt-1">View project issues and status (coming soon).</p>
            </Button>
            <Button
                variant="outline"
                className="p-6 h-auto flex-col items-start text-left hover:shadow-lg transition-shadow border-gray-300 dark:border-gray-700"
                onClick={() => { alert("Watchlist feature coming soon!"); }}
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
            </div>
        </div>
      )}
      
      {isRaiseBugModalOpen && selectedProjectId && selectedProjectKey && selectedProjectName && credentials && (
        <RaiseBugModal
          isOpen={isRaiseBugModalOpen}
          onClose={() => setIsRaiseBugModalOpen(false)}
          projectId={selectedProjectId}
          projectKey={selectedProjectKey}
          projectName={selectedProjectName}
          credentials={credentials}
        />
      )}
    </div>
  );
}
