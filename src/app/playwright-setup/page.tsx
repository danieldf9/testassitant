
"use client";

import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { PlaywrightSetupSchema, type PlaywrightSetup } from '@/lib/schemas';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ProjectSelector } from '@/components/ProjectSelector';
import { Code, Info, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function PlaywrightSetupPage() {
  const { isAuthenticated, credentials } = useAuth();
  const { toast } = useToast();
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>();

  const form = useForm<PlaywrightSetup>({
    resolver: zodResolver(PlaywrightSetupSchema),
    defaultValues: {
      baseUrl: '',
      authFlow: '',
      commonSelectors: '',
      boilerplate: '',
    },
  });

  useEffect(() => {
    if (selectedProjectId) {
      try {
        const savedSetup = localStorage.getItem(`playwrightSetup_${selectedProjectId}`);
        if (savedSetup) {
          const parsedSetup = PlaywrightSetupSchema.parse(JSON.parse(savedSetup));
          form.reset(parsedSetup);
        } else {
          form.reset({
            baseUrl: '',
            authFlow: '',
            commonSelectors: '',
            boilerplate: `import { test, expect } from '@playwright/test';`,
          });
        }
      } catch (e) {
        console.error("Failed to load or parse Playwright setup from localStorage", e);
        form.reset();
      }
    }
  }, [selectedProjectId, form]);

  const onSubmit = (data: PlaywrightSetup) => {
    if (!selectedProjectId) {
      toast({
        title: "No Project Selected",
        description: "Please select a project before saving the setup.",
        variant: "destructive",
      });
      return;
    }
    try {
      localStorage.setItem(`playwrightSetup_${selectedProjectId}`, JSON.stringify(data));
      toast({
        title: "Setup Saved",
        description: "Your Playwright setup for this project has been saved locally.",
        className: "bg-green-100 border-green-300 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200"
      });
    } catch (error) {
      console.error("Failed to save Playwright setup to localStorage", error);
      toast({
        title: "Error Saving",
        description: "Could not save the setup to your browser's local storage.",
        variant: "destructive",
      });
    }
  };
  
  if (!isAuthenticated) {
     return (
        <div className="container mx-auto p-4 md:p-8 flex justify-center">
            <Alert className="max-w-xl">
                <Info className="h-4 w-4" />
                <AlertTitle>Not Connected</AlertTitle>
                <AlertDescription>Please connect to Jira on the main page to configure Playwright settings for a project.</AlertDescription>
            </Alert>
        </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl p-4 md:p-8">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-3xl font-bold flex items-center">
            <Code className="mr-3 h-8 w-8 text-primary" />
            Playwright Test Generation Setup
          </CardTitle>
          <CardDescription className="text-lg text-muted-foreground">
            Provide context about your project to help the AI generate accurate and robust Playwright test code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
            <div>
                <Label className="font-semibold">Select Project to Configure *</Label>
                <div className="mt-2">
                 <ProjectSelector 
                    selectedProjectId={selectedProjectId}
                    onProjectSelect={(projectId) => setSelectedProjectId(projectId)}
                />
                </div>
            </div>

            {selectedProjectId && (
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                    control={form.control}
                    name="baseUrl"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Application Base URL *</FormLabel>
                        <FormControl>
                        <Input placeholder="https://yourapp.com" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="authFlow"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Authentication Flow (Optional)</FormLabel>
                        <FormControl>
                        <Textarea
                            placeholder="Describe how a user logs in. e.g., Navigate to /login, fill in email and password, click submit."
                            rows={3}
                            {...field}
                        />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="commonSelectors"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Common Selectors (Optional)</FormLabel>
                        <FormControl>
                        <Textarea
                            placeholder={"One per line, e.g.:\nloginButton: [data-testid='login-button']\nusernameInput: #username"}
                            rows={5}
                            {...field}
                        />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                
                <FormField
                    control={form.control}
                    name="boilerplate"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Test File Boilerplate (Optional)</FormLabel>
                        <FormControl>
                        <Textarea
                            placeholder="Code to include at the start of every test file, like custom imports or a beforeEach hook."
                            rows={8}
                            {...field}
                            className="font-mono text-xs"
                        />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />

                <Button type="submit">
                    <Save className="mr-2 h-4 w-4" />
                    Save Setup for Project
                </Button>
                </form>
            </Form>
             )}
        </CardContent>
      </Card>
    </div>
  );
}
