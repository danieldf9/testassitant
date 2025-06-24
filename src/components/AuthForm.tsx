
"use client";
import type { JiraCredentials } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/AuthContext';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, KeyRound, AtSign, LinkIcon, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { fetchProjectsAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

const authSchema = z.object({
  jiraUrl: z.string().url({ message: 'Enter your full Jira instance URL (e.g., https://your-org.atlassian.net or https://jira.yourcompany.com).' }),
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  apiToken: z.string().min(1, { message: 'API Token cannot be empty.' }),
});

type AuthFormData = z.infer<typeof authSchema>;

export function AuthForm() {
  const { setCredentials, logout } = useAuth();
  const { toast } = useToast();
  const [showApiToken, setShowApiToken] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const form = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      jiraUrl: '',
      email: '',
      apiToken: '',
    },
  });

  async function onSubmit(data: AuthFormData) {
    setIsVerifying(true);
    form.clearErrors(); // Clear previous form errors, if any

    try {
      // Attempt to fetch projects to validate the credentials
      await fetchProjectsAction(data);
      // If successful, set the credentials in the AuthContext
      setCredentials(data);
      toast({ 
        title: "Success", 
        description: "Successfully connected to Jira.",
        className: "bg-green-100 border-green-300 text-green-800 dark:bg-green-900 dark:border-green-700 dark:text-green-200" 
      });
      // The AuthProvider will update isAuthenticated, and UI should react (e.g., show main page)
    } catch (error: any) {
      // If fetchProjectsAction throws an error, it means authentication/connection failed
      logout(); // Ensure any potentially partially set or invalid credentials are cleared
      console.error("Authentication error:", error.message);
      toast({
        title: "Connection Failed",
        description: error.message || "Could not connect to Jira. Please check your details and try again.",
        variant: "destructive",
        duration: 8000, // Give more time for longer error messages
      });
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="container mx-auto flex min-h-[calc(100vh-10rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Connect to Jira</CardTitle>
          <CardDescription>Enter your Jira instance details and API token to get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="jiraUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jira URL</FormLabel>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <FormControl>
                        <Input placeholder="e.g., https://your-org.atlassian.net" {...field} className="pl-10" />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Jira Email Address</FormLabel>
                     <div className="relative">
                      <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <FormControl>
                        <Input placeholder="you@example.com" {...field} className="pl-10" />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="apiToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API Token</FormLabel>
                    <div className="relative">
                       <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <FormControl>
                        <Input type={showApiToken ? 'text' : 'password'} placeholder="Your Jira API Token" {...field} className="pl-10 pr-10" />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 px-2"
                        onClick={() => setShowApiToken(!showApiToken)}
                        aria-label={showApiToken ? "Hide API token" : "Show API token"}
                      >
                        {showApiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <FormDescription>
                      You can create an API token <a href="https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">here</a>.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isVerifying}>
                {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isVerifying ? 'Verifying...' : 'Connect'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
