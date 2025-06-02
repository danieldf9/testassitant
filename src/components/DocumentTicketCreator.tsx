
"use client";

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, FileUp, CheckCircle, AlertCircle, Wand2, Edit3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { analyzeDocumentAction, createJiraTicketsAction } from '@/app/actions';
import type { AnalyzeDocumentOutput, DraftTicketRecursive } from '@/lib/schemas';
import { Badge } from '@/components/ui/badge'; // Import Badge

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
      setCreationError(null);
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
      });
      setDraftedTickets(result);
      if (result.length === 0) {
        toast({ title: "Analysis Complete", description: "AI could not identify any tickets from the document. Try a different document or check its content.", variant: "default" });
      } else {
        toast({ title: "Analysis Successful", description: `AI drafted ${result.length} top-level ticket item(s). Review and edit before creating.`, variant: "default" });
      }
    } catch (error: any) {
      setAnalysisError(error.message || "Failed to analyze document.");
      toast({ title: "Analysis Failed", description: error.message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTicketChange = useCallback((path: number[], field: keyof Omit<DraftTicketRecursive, 'children' | 'type'>, value: string) => {
    setDraftedTickets(prevTickets => {
      const newTickets = JSON.parse(JSON.stringify(prevTickets)) as AnalyzeDocumentOutput; // Deep copy
      
      let currentLevelOrTicket: any = newTickets;
      for (let i = 0; i < path.length -1; i++) {
        currentLevelOrTicket = currentLevelOrTicket[path[i]].children;
         if (!currentLevelOrTicket) {
             console.error("Invalid path for ticket update - intermediate children missing");
             return prevTickets;
         }
      }
      
      const targetTicket = currentLevelOrTicket[path[path.length - 1]];
      if (targetTicket && field in targetTicket) {
        (targetTicket as any)[field] = value;
      } else {
          console.error("Invalid path or field for ticket update", path, field);
          return prevTickets;
      }
      return newTickets;
    });
  }, []);


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
        title: result.success ? "Ticket Creation Processed" : "Ticket Creation Issues",
        description: result.message,
        variant: result.success ? "default" : "destructive",
        className: result.success && result.message.toLowerCase().includes("successfully") ? "bg-green-100 border-green-300 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200" : "",
        duration: result.message.toLowerCase().includes("failed") || result.message.toLowerCase().includes("error") ? 10000 : 5000,
      });
      if (result.success && result.createdTickets.length > 0 && !result.message.includes("failed")) {
        setDraftedTickets([]); 
        setSelectedFile(null);
        setFileDataUri(null);
      }
    } catch (error: any) {
      setCreationError(error.message || "Failed to create tickets in Jira.");
      toast({ title: "Jira Creation Failed", description: error.message || "An unexpected error occurred during Jira ticket creation.", variant: "destructive", duration: 10000 });
    } finally {
      setIsCreatingTickets(false);
    }
  };

  const RenderDraftedTicket = useCallback(({ ticket, path }: { ticket: DraftTicketRecursive, path: number[] }) => (
    <Card className="mb-4 shadow-md border-l-4" style={{ borderColor: ticket.type === 'Epic' ? 'hsl(var(--chart-1))' : ticket.type === 'Story' ? 'hsl(var(--chart-2))' : ticket.type === 'Task' ? 'hsl(var(--chart-3))' : ticket.type === 'Bug' ? 'hsl(var(--destructive))' : 'hsl(var(--muted))' }}>
      <CardHeader className="pb-3 pt-4">
        <div className="flex justify-between items-start gap-2">
            <div className="flex-grow">
                <Input 
                    value={ticket.summary}
                    onChange={(e) => handleTicketChange(path, 'summary', e.target.value)}
                    className="text-md font-semibold p-1 h-auto border-0 focus-visible:ring-1 focus-visible:ring-ring mb-1"
                    placeholder="Ticket Summary"
                />
                <Badge variant="outline" className="text-xs">{ticket.type} {ticket.suggestedId && `(${ticket.suggestedId})`}</Badge>
            </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <Label htmlFor={`desc-${path.join('-')}`} className="text-xs text-muted-foreground">Description:</Label>
        <Textarea
          id={`desc-${path.join('-')}`}
          value={ticket.description}
          onChange={(e) => handleTicketChange(path, 'description', e.target.value)}
          rows={Math.max(3, ticket.description.split('\n').length)} 
          className="text-sm mt-1 w-full"
          placeholder="Ticket Description"
        />
        {ticket.children && ticket.children.length > 0 && (
          <div className="mt-4 pt-3 pl-4 border-l-2 border-dashed">
            <h4 className="text-xs font-semibold mb-2 uppercase text-muted-foreground">Children ({ticket.children.length})</h4>
            {ticket.children.map((child, index) => (
              <RenderDraftedTicket key={`${path.join('-')}-${index}`} ticket={child} path={[...path, index]} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  ), [handleTicketChange]);


  return (
    <div className="space-y-8 mt-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <FileUp className="mr-2 h-6 w-6 text-primary" />
            Upload Requirements Document (PDF)
          </CardTitle>
          <CardDescription>
            Select a PDF document containing project requirements. The AI will analyze it to draft Jira tickets for project: <strong>{projectName} ({projectKey})</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="pdf-upload">PDF Document</Label>
            <Input id="pdf-upload" type="file" accept="application/pdf" onChange={handleFileChange} className="mt-1" disabled={isAnalyzing || isCreatingTickets} />
            {selectedFile && <p className="text-xs text-muted-foreground mt-1">Selected: {selectedFile.name}</p>}
          </div>
          <Button onClick={handleAnalyzeDocument} disabled={!fileDataUri || isAnalyzing || isCreatingTickets}>
            {isAnalyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {isAnalyzing ? 'Analyzing Document...' : 'Analyze & Draft Tickets'}
          </Button>
          {analysisError && (
            <Alert variant="destructive" className="mt-2">
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
              <Edit3 className="mr-2 h-6 w-6 text-accent" />
              Review and Edit Drafted Tickets
            </CardTitle>
            <CardDescription>
              Modify the AI-suggested tickets below. When ready, click "Create Tickets in Jira".
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[60vh] overflow-y-auto p-1 space-y-3 rounded-md border">
              {draftedTickets.map((ticket, index) => (
                <RenderDraftedTicket key={index} ticket={ticket} path={[index]} />
              ))}
            </div>
            <Button onClick={handleCreateTickets} disabled={isCreatingTickets || isAnalyzing || draftedTickets.length === 0} className="mt-6 w-full sm:w-auto">
              {isCreatingTickets ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              {isCreatingTickets ? 'Creating Tickets in Jira...' : `Create ${draftedTickets.length} Ticket(s) in Jira`}
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
