
"use client";
import type { JiraIssue, PaginatedIssuesResponse } from '@/app/actions';
import { fetchIssuesAction } from '@/app/actions';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FileText, Wand2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import React, { useState, useEffect } from 'react';

interface IssueTableProps {
  projectId: string;
  onGenerateTestCases: (issue: JiraIssue) => void;
}

const PAGE_SIZE = 10;

export function IssueTable({ projectId, onGenerateTestCases }: IssueTableProps) {
  const { credentials } = useAuth();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);

  const { data: paginatedIssues, isLoading, error, isFetching, isPreviousData } = useQuery<PaginatedIssuesResponse, Error>({
    queryKey: ['jiraIssues', projectId, currentPage, credentials?.jiraUrl],
    queryFn: () => {
      if (!credentials) throw new Error('Not authenticated');
      if (!projectId) throw new Error('Project ID is required');
      return fetchIssuesAction(credentials, { projectId, page: currentPage, pageSize: PAGE_SIZE });
    },
    enabled: !!credentials && !!projectId,
    keepPreviousData: true, // Important for pagination UX
  });
  
  // Prefetch next page
  useEffect(() => {
    if (credentials && projectId && paginatedIssues && currentPage < paginatedIssues.totalPages) {
      queryClient.prefetchQuery({
        queryKey: ['jiraIssues', projectId, currentPage + 1, credentials?.jiraUrl],
        queryFn: () => fetchIssuesAction(credentials, { projectId, page: currentPage + 1, pageSize: PAGE_SIZE }),
      });
    }
  }, [paginatedIssues, currentPage, projectId, credentials, queryClient]);


  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('done') || lowerStatus.includes('resolved') || lowerStatus.includes('closed')) return 'default'; // Default is usually primary, looks good for "Done"
    if (lowerStatus.includes('progress') || lowerStatus.includes('review')) return 'secondary';
    if (lowerStatus.includes('to do') || lowerStatus.includes('open') || lowerStatus.includes('backlog')) return 'outline';
    return 'outline';
  };
  
  const getIssueTypeIcon = (issueType: string) => {
    // Placeholder for more specific icons
    return <FileText className="h-4 w-4 mr-2 text-muted-foreground" />;
  };


  if (isLoading && !paginatedIssues) { // Initial load
    return (
      <div className="space-y-4 mt-6">
        {[...Array(PAGE_SIZE)].map((_, i) => (
          <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg shadow-sm">
            <Skeleton className="h-12 w-12 rounded-md" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error Fetching Issues</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  
  if (!paginatedIssues || paginatedIssues.issues.length === 0) {
    return (
      <Alert className="mt-6">
         <AlertCircle className="h-4 w-4" />
        <AlertTitle>No Issues Found</AlertTitle>
        <AlertDescription>No issues found for the selected project, or an error occurred.</AlertDescription>
      </Alert>
    );
  }

  const { issues, total, page, totalPages } = paginatedIssues;

  return (
    <div className="mt-6">
      <div className={`transition-opacity duration-300 ${isFetching ? 'opacity-50' : 'opacity-100'}`}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map((issue) => (
              <TableRow key={issue.id}>
                <TableCell className="font-medium">{issue.key}</TableCell>
                <TableCell>{issue.summary}</TableCell>
                <TableCell className="flex items-center">
                  {getIssueTypeIcon(issue.issueType)}
                  {issue.issueType}
                </TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(issue.status)}>{issue.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onGenerateTestCases(issue)}
                    className="shadow-sm hover:shadow-md transition-shadow"
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate Tests
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages}. Total issues: {total}.
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1 || isFetching}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || isFetching}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || isFetching}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
             <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || isFetching}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
