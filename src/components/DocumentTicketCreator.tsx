
"use client";

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, FileUp, CheckCircle, AlertCircle, Wand2, Edit3, Trash2, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { analyzeDocumentAction, createJiraTicketsAction } from '@/app/actions';
import type { AnalyzeDocumentOutput, DraftTicketRecursive } from '@/lib/schemas';

interface DocumentTicketCreatorProps {
  projectId: string;
  projectKey: string;
  projectName: string;
}

export function DocumentTicketCreator({ projectId, projectKey, projectName }: DocumentTicketCreatorProps) {
  const { credentials } = useAuth();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUri, setFileDataUri] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [draftedTickets, setDraftedTickets] = useState<AnalyzeDocumentOutput>([]);
  const [isCreatingTickets, setIsCreatingTickets] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast({ title: "Invalid File Type", description: "Please upload a PDF document.", variant: "destructive" });
        setSelectedFile(null);
        setFileDataUri(null);
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setFileDataUri(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      setDraftedTickets([]);
      setAnalysisError(null);
    }
  };

  const handleAnalyzeDocument = async () => {
    if (!fileDataUri || !credentials) {
      toast({ title: "Missing Information", description: "Please select a PDF file and ensure you are connected to Jira.", variant: "destructive" });
      return;
    }
    setIsAnalyzing(true);
    setAnalysisError(null);
    setDraftedTickets([]);
    try {
      const result = await analyzeDocumentAction({
        documentDataUri: fileDataUri,
        projectKey,
        projectName,
        // Potentially add userPersona and outputFormatPreference from UI inputs later
      });
      setDraftedTickets(result);
      if (result.length === 0) {
        toast({ title: "Analysis Complete", description: "AI could not identify any tickets from the document. Try a different document or check its content.", variant: "default" });
      } else {
        toast({ title: "Analysis Successful", description: `AI drafted ${result.length} top-level ticket(s). Review and edit before creating.`, variant: "default" });
      }
    } catch (error: any) {
      setAnalysisError(error.message || "Failed to analyze document.");
      toast({ title: "Analysis Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Placeholder for editing logic - this will become more complex
  const handleTicketChange = (path: number[], field: keyof DraftTicketRecursive, value: string) => {
    // This is a simplified example. A real implementation would need a more robust way
    // to update nested ticket structures, likely involving immutable updates.
    setDraftedTickets(prevTickets => {
        const newTickets = JSON.parse(JSON.stringify(prevTickets)); // Deep copy
        let currentLevel = newTickets;
        let targetTicket: DraftTicketRecursive | null = null;

        for(let i = 0; i < path.length; i++) {
            const index = path[i];
            if (i === path.length - 1) {
                targetTicket = currentLevel[index];
            } else {
                if (!currentLevel[index]?.children) {
                    console.error("Invalid path for ticket update");
                    return prevTickets; // Or handle error appropriately
                }
                currentLevel = currentLevel[index].children!;
            }
        }
        
        if (targetTicket && field !== 'children') {
          (targetTicket as any)[field] = value;
        }
        return newTickets;
    });
  };

  const handleCreateTickets = async () => {
    if (!credentials || draftedTickets.length === 0) {
      toast({ title: "Cannot Create Tickets", description: "No drafted tickets to create or not connected to Jira.", variant: "destructive" });
      return;
    }
    setIsCreatingTickets(true);
    setCreationError(null);
    try {
      const result = await createJiraTicketsAction(credentials, {
        projectId,
        projectKey,
        tickets: draftedTickets,
      });
      toast({
        title: result.success ? "Tickets Created" : "Ticket Creation Issues",
        description: result.message,
        variant: result.success ? "default" : "destructive",
        className: result.success ? "bg-green-100 border-green-300 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200" : "",
        duration: result.success ? 5000: 10000,
      });
      if (result.success) {
        setDraftedTickets([]); // Clear drafts on success
        setSelectedFile(null);
        setFileDataUri(null);
      }
    } catch (error: any) {
      setCreationError(error.message || "Failed to create tickets in Jira.");
      toast({ title: "Creation Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsCreatingTickets(false);
    }
  };

  // Recursive component to render drafted tickets
  const RenderDraftedTicket = ({ ticket, path }: { ticket: DraftTicketRecursive, path: number[] }) => (
    <Card className="mb-4 shadow-md border-l-4" style={{ borderColor: ticket.type === 'Epic' ? 'hsl(var(--chart-1))' : ticket.type === 'Story' ? 'hsl(var(--chart-2))' : ticket.type === 'Task' ? 'hsl(var(--chart-3))' : 'hsl(var(--muted))' }}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
            <div>
                <CardTitle className="text-lg mb-1">
                    <Input 
                        value={ticket.summary}
                        onChange={(e) => handleTicketChange(path, 'summary', e.target.value)}
                        className="text-lg font-semibold p-1 h-auto border-0 focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </CardTitle>
                <Badge variant="outline" className="text-xs">{ticket.type} {ticket.suggestedId && `(${ticket.suggestedId})`}</Badge>
            </div>
            {/* Add Edit/Delete buttons here if needed - for now, direct input editing */}
        </div>
      </CardHeader>
      <CardContent>
        <Label htmlFor={`desc-${path.join('-')}`} className="text-xs text-muted-foreground">Description:</Label>
        <Textarea
          id={`desc-${path.join('-')}`}
          value={ticket.description}
          onChange={(e) => handleTicketChange(path, 'description', e.target.value)}
          rows={3}
          className="text-sm mt-1"
        />
        {ticket.children && ticket.children.length > 0 && (
          <div className="mt-3 pl-4 border-l-2 border-dashed">
            <h4 className="text-xs font-semibold mb-2 text-muted-foreground">CHILDREN ({ticket.children.length})</h4>
            {ticket.children.map((child, index) => (
              <RenderDraftedTicket key={index} ticket={child} path={[...path, index]} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );


  return (
    <div className="space-y-8 mt-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <FileUp className="mr-2 h-6 w-6 text-primary" />
            Upload Requirements Document (PDF)
          </CardTitle>
          <CardDescription>
            Select a PDF document containing project requirements. The AI will analyze it to draft Jira tickets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="pdf-upload">PDF Document</Label>
            <Input id="pdf-upload" type="file" accept="application/pdf" onChange={handleFileChange} className="mt-1" />
            {selectedFile && <p className="text-xs text-muted-foreground mt-1">Selected: {selectedFile.name}</p>}
          </div>
          <Button onClick={handleAnalyzeDocument} disabled={!fileDataUri || isAnalyzing || isCreatingTickets}>
            {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {isAnalyzing ? 'Analyzing Document...' : 'Analyze & Draft Tickets'}
          </Button>
          {analysisError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Analysis Error</AlertTitle>
              <AlertDescription>{analysisError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {draftedTickets.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center text-xl">
              <Edit3 className="mr-2 h-6 w-6 text-primary" />
              Review and Edit Drafted Tickets
            </CardTitle>
            <CardDescription>
              Modify the AI-suggested tickets below before creating them in Jira for project: <strong>{projectName} ({projectKey})</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[60vh] overflow-y-auto p-1 space-y-3">
              {draftedTickets.map((ticket, index) => (
                <RenderDraftedTicket key={index} ticket={ticket} path={[index]} />
              ))}
            </div>
            <Button onClick={handleCreateTickets} disabled={isCreatingTickets || isAnalyzing || draftedTickets.length === 0} className="mt-6 w-full sm:w-auto">
              {isCreatingTickets ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              {isCreatingTickets ? 'Creating Tickets in Jira...' : 'Create Tickets in Jira'}
            </Button>
            {creationError && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Jira Creation Error</AlertTitle>
                <AlertDescription>{creationError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
