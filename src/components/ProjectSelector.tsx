
"use client";
import type { JiraProject } from '@/app/actions';
import { fetchProjectsAction } from '@/app/actions';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ListFilter, Check, ChevronsUpDown } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ProjectSelectorProps {
  selectedProjectId: string | undefined;
  onProjectSelect: (projectId: string) => void;
  disabled?: boolean;
}

export function ProjectSelector({ selectedProjectId, onProjectSelect, disabled }: ProjectSelectorProps) {
  const { credentials } = useAuth();
  const [open, setOpen] = useState(false);
  const [currentValue, setCurrentValue] = useState(selectedProjectId); // Internal state for combobox value

  useEffect(() => {
    setCurrentValue(selectedProjectId); // Sync with prop
  }, [selectedProjectId]);

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

  const selectedProject = projects.find(project => project.id === currentValue);

  return (
    <div className="flex items-center space-x-2">
      <ListFilter className="h-5 w-5 text-muted-foreground shrink-0" />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[250px] justify-between shadow-sm"
            disabled={disabled || projects.length === 0}
          >
            {selectedProject
              ? `${selectedProject.name} (${selectedProject.key})`
              : "Select a project..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0">
          <Command>
            <CommandInput placeholder="Search project..." />
            <CommandList>
              <CommandEmpty>No project found.</CommandEmpty>
              <CommandGroup>
                {projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={`${project.name} ${project.key} ${project.id}`} // Value used for searching
                    onSelect={() => {
                      const newValue = project.id === currentValue ? "" : project.id;
                      setCurrentValue(newValue);
                      onProjectSelect(newValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        currentValue === project.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {project.name} ({project.key})
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
