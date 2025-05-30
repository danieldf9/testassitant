
"use client";
import type { JiraCredentials } from '@/contexts/AuthContext';
import type { JiraProject } from '@/app/actions';
import { fetchProjectsAction } from '@/app/actions';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ListFilter } from 'lucide-react';

interface ProjectSelectorProps {
  selectedProjectId: string | undefined;
  onProjectSelect: (projectId: string) => void;
  disabled?: boolean;
}

export function ProjectSelector({ selectedProjectId, onProjectSelect, disabled }: ProjectSelectorProps) {
  const { credentials } = useAuth();

  const { data: projects, isLoading, error } = useQuery<JiraProject[], Error>({
    queryKey: ['jiraProjects', credentials?.jiraUrl],
    queryFn: () => {
      if (!credentials) throw new Error('Not authenticated');
      return fetchProjectsAction(credentials);
    },
    enabled: !!credentials,
  });

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <ListFilter className="h-5 w-5 text-muted-foreground" />
        <Skeleton className="h-10 w-[250px]" />
      </div>
    );
  }

  if (error) {
    return (
       <Alert variant="destructive" className="w-full max-w-md">
        <AlertTitle>Error Fetching Projects</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <Alert className="w-full max-w-md">
        <AlertTitle>No Projects Found</AlertTitle>
        <AlertDescription>No projects were found for your Jira instance, or you may not have permission to view them.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <ListFilter className="h-5 w-5 text-muted-foreground" />
      <Select
        value={selectedProjectId}
        onValueChange={onProjectSelect}
        disabled={disabled || projects.length === 0}
      >
        <SelectTrigger className="w-[250px] shadow-sm">
          <SelectValue placeholder="Select a project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name} ({project.key})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
