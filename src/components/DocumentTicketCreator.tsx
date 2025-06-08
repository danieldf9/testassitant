
"use client";

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, FileUp, CheckCircle, AlertCircle, Wand2, Edit3, User, Settings2, Trash2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import { analyzeDocumentAction, createJiraTicketsAction } from '@/app/actions';
import type { AnalyzeDocumentOutput, DraftTicketRecursive } from '@/lib/schemas';
import { Badge } from '@/components/ui/badge';

interface DocumentTicketCreatorProps {
  projectId: string;
  projectKey: string;
  projectName: string;
}

const JIRA_TICKET_TYPES: DraftTicketRecursive['type'][] = ['Epic', 'Story', 'Task', 'Sub-task', 'Bug'];


export function DocumentTicketCreator({ projectId, projectKey, projectName }: DocumentTicketCreatorProps) {
  const { credentials } = useAuth();
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDataUri, setFileDataUri] = useState<string | null>(null);
  const [userPersona, setUserPersona] = useState<string>('');
  const [outputFormatPreference, setOutputFormatPreference] = useState<string>('');
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
        userPersona: userPersona || undefined,
        outputFormatPreference: outputFormatPreference || undefined,
      });
      setDraftedTickets(result);
      if (result.length === 0) {
        toast({ title: "Analysis Complete", description: "AI could not identify any tickets from the document. Try a different document, adjust preferences, or check its content.", variant: "default" });
      } else {
        toast({ title: "Analysis Successful", description: `AI drafted ${result.length} top-level ticket item(s). Review and edit before creating.`, variant: "default", duration: 7000 });
      }
    } catch (error: any) {
      setAnalysisError(error.message || "Failed to analyze document.");
      toast({ title: "Analysis Failed", description: error.message || "An unexpected error occurred.", variant: "destructive", duration: 10000 });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTicketPropertyChange = useCallback((path: number[], field: keyof DraftTicketRecursive, value: string) => {
    setDraftedTickets(prevTickets => {
      const newTickets = JSON.parse(JSON.stringify(prevTickets)) as AnalyzeDocumentOutput; 
      
      let currentLevel: any = newTickets;
      for (let i = 0; i < path.length -1; i++) {
        currentLevel = currentLevel[path[i]].children;
         if (!currentLevel) {
             console.error("Invalid path for ticket update - intermediate children missing for path segment", i, "in", path);
             return prevTickets;
         }
      }
      
      const targetTicket = currentLevel[path[path.length - 1]];
      if (targetTicket) {
        (targetTicket as any)[field] = value;
      } else {
          console.error("Invalid path or field for ticket update. Ticket not found at path or field invalid:", path, field);
          return prevTickets;
      }
      return newTickets;
    });
  }, []);

  const handleDeleteTicket = useCallback((path: number[]) => {
    setDraftedTickets(prevTickets => {
      const newTickets = JSON.parse(JSON.stringify(prevTickets)) as AnalyzeDocumentOutput;

      if (path.length === 1) { // Top-level ticket
        newTickets.splice(path[0], 1);
        return newTickets;
      }

      let currentParentChildrenList = newTickets;
      for (let i = 0; i < path.length - 1; i++) {
        const parent = currentParentChildrenList[path[i]];
        if (!parent || !parent.children) {
            console.error("Invalid path for ticket deletion - parent or children missing.", path);
            return prevTickets; // Path broken or invalid
        }
        currentParentChildrenList = parent.children;
      }
      
      currentParentChildrenList.splice(path[path.length - 1], 1);
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
        variant: result.success && result.createdTickets.length > 0 && !result.message.toLowerCase().includes("fail") ? "default" : "destructive",
        className: result.success && result.createdTickets.length > 0 && !result.message.toLowerCase().includes("fail") ? "bg-green-100 border-green-300 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200" : "",
        duration: result.message.length > 100 || !result.success ? 15000 : 7000,
      });
      if (result.success && !result.message.toLowerCase().includes("fail") && !result.message.toLowerCase().includes("partial")) {
        setDraftedTickets([]); 
        setSelectedFile(null);
        setFileDataUri(null);
        setUserPersona('');
        setOutputFormatPreference('');
      }
    } catch (error: any) {
      setCreationError(error.message || "Failed to create tickets in Jira.");
      toast({ title: "Jira Creation Failed", description: error.message || "An unexpected error occurred during Jira ticket creation.", variant: "destructive", duration: 10000 });
    } finally {
      setIsCreatingTickets(false);
    }
  };

  const RenderDraftedTicket = useCallback(({ ticket, path }: { ticket: DraftTicketRecursive, path: number[] }) => (
    <Card 
        className="mb-4 shadow-md border-l-4 bg-card" 
        style={{ borderColor: ticket.type === 'Epic' ? 'hsl(var(--chart-1))' : ticket.type === 'Story' ? 'hsl(var(--chart-2))' : ticket.type === 'Task' ? 'hsl(var(--chart-3))' : ticket.type === 'Bug' ? 'hsl(var(--destructive))' : 'hsl(var(--muted))' }}
    >
      <CardHeader className="pb-3 pt-4">
        <div className="flex justify-between items-start gap-2">
            <div className="flex-grow">
                <Input 
                    value={ticket.summary}
                    onChange={(e) => handleTicketPropertyChange(path, 'summary', e.target.value)}
                    className="text-md font-semibold p-1 h-auto border-0 focus-visible:ring-1 focus-visible:ring-ring mb-1 bg-transparent"
                    placeholder="Ticket Summary"
                />
                 <div className="flex items-center gap-2 mt-1">
                    <Select 
                        value={ticket.type} 
                        onValueChange={(newType) => handleTicketPropertyChange(path, 'type', newType as DraftTicketRecursive['type'])}
                    >
                        <SelectTrigger className="w-[130px] h-7 text-xs px-2 py-1">
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                            {JIRA_TICKET_TYPES.map(type => (
                                <SelectItem key={type} value={type} className="text-xs">
                                    {type}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {ticket.suggestedId && <Badge variant="outline" className="text-xs py-0.5">({ticket.suggestedId})</Badge>}
                </div>
            </div>
             <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteTicket(path)}>
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Delete ticket</span>
            </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <Label htmlFor={`desc-${path.join('-')}`} className="text-xs text-muted-foreground">Description (includes Acceptance Criteria):</Label>
        <Textarea
          id={`desc-${path.join('-')}`}
          value={ticket.description}
          onChange={(e) => handleTicketPropertyChange(path, 'description', e.target.value)}
          rows={Math.max(4, ticket.description.split('\n').length)} 
          className="text-sm mt-1 w-full bg-card"
          placeholder="Ticket Description (AI will attempt to include Acceptance Criteria here)"
        />
        {ticket.children && ticket.children.length > 0 && (
          <div className="mt-4 pt-3 pl-4 border-l-2 border-dashed border-border/50">
            <h4 className="text-xs font-semibold mb-2 uppercase text-muted-foreground">Children ({ticket.children.length})</h4>
            {ticket.children.map((child, index) => (
              <RenderDraftedTicket key={`${path.join('-')}-${index}`} ticket={child} path={[...path, index]} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  ), [handleTicketPropertyChange, handleDeleteTicket]);


  return (
    <div className="space-y-8 mt-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center text-xl">
            <FileUp className="mr-2 h-6 w-6 text-primary" />
            Upload Requirements (PDF) & AI Options
          </CardTitle>
          <CardDescription>
            Select a PDF for project: <strong>{projectName} ({projectKey})</strong>. Optionally provide AI hints.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pdf-upload">PDF Document *</Label>
              <Input id="pdf-upload" type="file" accept="application/pdf" onChange={handleFileChange} className="mt-1" disabled={isAnalyzing || isCreatingTickets} />
              {selectedFile && <p className="text-xs text-muted-foreground mt-1">Selected: {selectedFile.name}</p>}
            </div>
             <div>
              <Label htmlFor="user-persona">Target User Persona (Optional)</Label>
               <div className="relative mt-1">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input 
                    id="user-persona" 
                    type="text" 
                    placeholder="e.g., End User, Project Manager" 
                    value={userPersona}
                    onChange={(e) => setUserPersona(e.target.value)}
                    className="pl-10"
                    disabled={isAnalyzing || isCreatingTickets}
                />
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="output-format-preference">Output Format Preference (Optional AI Hint)</Label>
             <div className="relative mt-1">
              <Settings2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input 
                  id="output-format-preference" 
                  type="text" 
                  placeholder="e.g., Focus on user stories under epics"
                  value={outputFormatPreference}
                  onChange={(e) => setOutputFormatPreference(e.target.value)}
                  className="pl-10"
                  disabled={isAnalyzing || isCreatingTickets}
              />
            </div>
             <p className="text-xs text-muted-foreground mt-1">Example: "Detailed tasks for each feature", "Ensure sub-tasks are granular".</p>
          </div>

          <Button onClick={handleAnalyzeDocument} disabled={!fileDataUri || isAnalyzing || isCreatingTickets} className="w-full sm:w-auto">
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
              Modify the AI-suggested tickets below. When ready, click "Create Tickets in Jira". Ensure summaries and descriptions (including Acceptance Criteria) are complete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[70vh] overflow-y-auto p-1 space-y-3 rounded-md border bg-background/50">
              {draftedTickets.map((ticket, index) => (
                <RenderDraftedTicket key={index} ticket={ticket} path={[index]} />
              ))}
            </div>
            <Button onClick={handleCreateTickets} disabled={isCreatingTickets || isAnalyzing || draftedTickets.length === 0} className="mt-6 w-full sm:w-auto">
              {isCreatingTickets ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
              {isCreatingTickets ? 'Creating Tickets...' : `Create ${draftedTickets.reduce((acc, t) => acc + 1 + (t.children?.reduce((sAcc, sT) => sAcc + 1 + (sT.children?.length || 0),0) || 0), 0)} Ticket(s) in Jira`}
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


