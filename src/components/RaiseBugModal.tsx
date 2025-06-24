
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertCircle, Wand2, CheckCircle, FileUp, ListRestart } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { draftJiraBugAction, createJiraBugInJiraAction } from '@/app/actions';
import type { DraftJiraBugOutput, LocalStorageBugTemplate } from '@/lib/schemas';
import { useAuth } from '@/contexts/AuthContext';

interface RaiseBugModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectKey: string;
  projectName: string;
}

const JIRA_ENVIRONMENTS = ["QA", "PROD", "Staging", "Development", "Other"];

export function RaiseBugModal({ 
    isOpen, 
    onClose, 
    projectId, 
    projectKey, 
    projectName, 
}: RaiseBugModalProps) {
  const { toast } = useToast();
  const { credentials } = useAuth();
  
  const [actualBehaviour, setActualBehaviour] = useState('');
  const [expectedBehaviour, setExpectedBehaviour] = useState('');
  const [selectedEnvironment, setSelectedEnvironment] = useState('QA');
  const [otherEnvironment, setOtherEnvironment] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentDataUri, setAttachmentDataUri] = useState<string | null>(null);

  const [draftedBug, setDraftedBug] = useState<DraftJiraBugOutput | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const localStorageKey = `bugTemplate_${projectId}`;

  const resetForm = useCallback(() => {
    setActualBehaviour('');
    setExpectedBehaviour('');
    setSelectedEnvironment('QA');
    setOtherEnvironment('');
    setAttachmentFile(null);
    setAttachmentDataUri(null);
    setDraftedBug(null);
    setDraftError(null);
    setCreateError(null);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetForm();
    }
  }, [isOpen, resetForm]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAttachmentFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setAttachmentDataUri(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setAttachmentFile(null);
      setAttachmentDataUri(null);
    }
  };

  const handlePreviewBug = async () => {
    if (!actualBehaviour.trim() || !expectedBehaviour.trim()) {
      toast({ title: "Input Required", description: "Please describe both the actual and expected behaviour.", variant: "destructive" });
      return;
    }
    setIsDrafting(true);
    setDraftError(null);
    setDraftedBug(null); // Clear previous draft
    try {
      const env = selectedEnvironment === 'Other' ? otherEnvironment : selectedEnvironment;
      const result = await draftJiraBugAction({
        actualBehaviour,
        expectedBehaviour,
        environmentHint: env,
        attachmentFilename: attachmentFile?.name,
        projectKey,
      });
      setDraftedBug(result);
      if (result.identifiedEnvironment && JIRA_ENVIRONMENTS.includes(result.identifiedEnvironment)) {
        setSelectedEnvironment(result.identifiedEnvironment);
      } else if (result.identifiedEnvironment) {
        setSelectedEnvironment("Other");
        setOtherEnvironment(result.identifiedEnvironment);
      }

    } catch (error: any) {
      setDraftError(error.message || "Failed to draft bug details.");
      toast({ title: "Drafting Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsDrafting(false);
    }
  };

  const handleCreateJiraBug = async () => {
    if (!draftedBug || !credentials) {
      toast({ title: "Cannot Create Bug", description: "No bug drafted or not authenticated.", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    setCreateError(null);
    try {
      const result = await createJiraBugInJiraAction(
        credentials,
        {
          projectId,
          summary: draftedBug.summary,
          descriptionMarkdown: draftedBug.descriptionMarkdown,
          identifiedEnvironment: draftedBug.identifiedEnvironment,
        },
        attachmentDataUri || undefined, // Send data URI
        attachmentFile?.name // Send original filename
      );

      toast({
        title: result.success ? "Bug Created!" : "Creation Issue",
        description: (
            <>
              {result.message}
              {result.success && result.ticketKey && result.ticketUrl && (
                <a 
                    href={result.ticketUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="block mt-2 text-sm text-primary underline hover:text-primary/80"
                >
                    View {result.ticketKey} in Jira
                </a>
              )}
            </>
        ),
        variant: result.success ? "default" : "destructive",
        className: result.success ? "bg-green-100 border-green-300 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200" : "",
        duration: 10000,
      });

      if (result.success) {
        // Save template to localStorage
        const templateToSave: LocalStorageBugTemplate = {
          projectId,
          summary: draftedBug.summary,
          actualBehaviour: actualBehaviour,
          expectedBehaviour: expectedBehaviour,
          environment: draftedBug.identifiedEnvironment,
        };
        localStorage.setItem(localStorageKey, JSON.stringify(templateToSave));
        onClose(); // Close modal on full success
      }
    } catch (error: any) {
      setCreateError(error.message || "Failed to create bug in Jira.");
      toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const loadLastDraft = () => {
    try {
      const storedTemplate = localStorage.getItem(localStorageKey);
      if (storedTemplate) {
        const template: LocalStorageBugTemplate = JSON.parse(storedTemplate);
        setActualBehaviour(template.actualBehaviour);
        setExpectedBehaviour(template.expectedBehaviour);
        if (JIRA_ENVIRONMENTS.includes(template.environment)) {
            setSelectedEnvironment(template.environment);
            setOtherEnvironment('');
        } else {
            setSelectedEnvironment("Other");
            setOtherEnvironment(template.environment);
        }
        // Clear attachment and drafted bug as they are not part of the core template
        setAttachmentFile(null);
        setAttachmentDataUri(null);
        setDraftedBug(null); 
        toast({ title: "Draft Loaded", description: "Loaded the last saved bug information for this project." });
      } else {
        toast({ title: "No Draft Found", description: "No previously saved bug draft for this project.", variant: "default" });
      }
    } catch (error) {
      console.error("Failed to load or parse template from localStorage", error);
      toast({ title: "Load Error", description: "Could not load saved draft.", variant: "destructive" });
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="text-2xl">Raise Bug for {projectName} ({projectKey})</DialogTitle>
          <DialogDescription>
            Describe the actual vs expected behaviour, add an attachment if needed, and let AI help draft the Jira ticket.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="actual-behaviour">Actual Behaviour *</Label>
                <Textarea
                  id="actual-behaviour"
                  value={actualBehaviour}
                  onChange={(e) => setActualBehaviour(e.target.value)}
                  placeholder="Describe what is currently happening. Include steps to reproduce, or any relevant URLs or error messages."
                  rows={8}
                  className="mt-1"
                  disabled={isDrafting || isCreating}
                />
              </div>
              <div>
                <Label htmlFor="expected-behaviour">Expected Behaviour *</Label>
                <Textarea
                  id="expected-behaviour"
                  value={expectedBehaviour}
                  onChange={(e) => setExpectedBehaviour(e.target.value)}
                  placeholder="Describe what you expected to happen."
                  rows={8}
                  className="mt-1"
                  disabled={isDrafting || isCreating}
                />
              </div>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bug-environment">Environment *</Label>
              <Select
                value={selectedEnvironment}
                onValueChange={setSelectedEnvironment}
                disabled={isDrafting || isCreating}
              >
                <SelectTrigger id="bug-environment" className="mt-1">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  {JIRA_ENVIRONMENTS.map(env => (
                    <SelectItem key={env} value={env}>{env}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEnvironment === 'Other' && (
                <Input 
                  type="text" 
                  placeholder="Specify environment" 
                  value={otherEnvironment}
                  onChange={(e) => setOtherEnvironment(e.target.value)}
                  className="mt-2"
                  disabled={isDrafting || isCreating}
                />
              )}
            </div>
            <div>
              <Label htmlFor="bug-attachment">Attachment (Optional)</Label>
              <div className="relative mt-1">
                <FileUp className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input 
                    id="bug-attachment" 
                    type="file" 
                    onChange={handleFileChange} 
                    className="pl-10" 
                    disabled={isDrafting || isCreating}
                />
              </div>
              {attachmentFile && <p className="text-xs text-muted-foreground mt-1">Selected: {attachmentFile.name}</p>}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handlePreviewBug} disabled={isDrafting || isCreating || !actualBehaviour.trim() || !expectedBehaviour.trim()} className="flex-1 sm:flex-initial">
              {isDrafting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {isDrafting ? 'Drafting...' : 'Preview Bug with AI'}
            </Button>
            <Button onClick={loadLastDraft} variant="outline" disabled={isDrafting || isCreating} className="flex-1 sm:flex-initial">
              <ListRestart className="mr-2 h-4 w-4" />
              Load Last Draft for Project
            </Button>
          </div>

          {draftError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Drafting Error</AlertTitle>
              <AlertDescription>{draftError}</AlertDescription>
            </Alert>
          )}

          {draftedBug && (
            <Card className="mt-4 bg-muted/30 dark:bg-muted/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">AI Drafted Bug Preview</CardTitle>
                <CardDescription>Review the AI-generated details below. You can edit the descriptions above and re-preview if needed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs font-semibold">Generated Summary:</Label>
                  <p className="text-sm p-2 border rounded-md bg-background">{draftedBug.summary}</p>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Generated Description (Markdown):</Label>
                  <div className="prose prose-sm dark:prose-invert max-w-none p-2 border rounded-md bg-background overflow-x-auto">
                    <ReactMarkdown>{draftedBug.descriptionMarkdown}</ReactMarkdown>
                  </div>
                </div>
                 <p className="text-xs text-muted-foreground">Identified Environment by AI: {draftedBug.identifiedEnvironment}</p>
                 {draftedBug.attachmentName && <p className="text-xs text-muted-foreground">Attachment in draft: {draftedBug.attachmentName}</p>}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="p-6 border-t bg-background">
          {createError && (
            <Alert variant="destructive" className="mb-2 text-left">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Jira Creation Error</AlertTitle>
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          )}
          <DialogClose asChild>
            <Button variant="outline" disabled={isCreating || isDrafting}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleCreateJiraBug} disabled={!draftedBug || isCreating || isCreating}>
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
            {isCreating ? 'Creating in Jira...' : 'Confirm & Create Bug'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
