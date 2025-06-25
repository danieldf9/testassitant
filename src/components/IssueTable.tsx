
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
import { AlertCircle, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, FileText, Wand2, Bot } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import React, { useState, useEffect } from 'react';

interface IssueTableProps {
  projectId: string;
  onActionClick: (issue: JiraIssue) => void;
  actionType: 'generateTests' | 'generateCode';
  isActionDisabled?: boolean;
  searchQuery?: string;
}

const PAGE_SIZE = 10;

export function IssueTable({ projectId, onActionClick, actionType, isActionDisabled = false, searchQuery }: IssueTableProps) {
  const { credentials } = useAuth();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);

  const { data: paginatedIssues, isLoading, error, isFetching } = useQuery<PaginatedIssuesResponse, Error>({
    queryKey: ['jiraIssues', projectId, currentPage, searchQuery, credentials?.jiraUrl],
    queryFn: () => {
      if (!credentials) throw new Error('Not authenticated');
      if (!projectId) throw new Error('Project ID is required');
      return fetchIssuesAction(credentials, { projectId, page: currentPage, pageSize: PAGE_SIZE, searchQuery });
    },
    enabled: !!credentials && !!projectId,
    keepPreviousData: true,
  });
  
  useEffect(() => {
    if (credentials && projectId && paginatedIssues && currentPage < paginatedIssues.totalPages) {
      queryClient.prefetchQuery({
        queryKey: ['jiraIssues', projectId, currentPage + 1, searchQuery, credentials?.jiraUrl],
        queryFn: () => fetchIssuesAction(credentials, { projectId, page: currentPage + 1, pageSize: PAGE_SIZE, searchQuery }),
      });
    }
  }, [paginatedIssues, currentPage, projectId, searchQuery, credentials, queryClient]);

  useEffect(() => {
    setCurrentPage(1);
  }, [projectId, searchQuery]);


  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('done') || lowerStatus.includes('resolved') || lowerStatus.includes('closed')) return 'default';
    if (lowerStatus.includes('progress') || lowerStatus.includes('review')) return 'secondary';
    if (lowerStatus.includes('to do') || lowerStatus.includes('open') || lowerStatus.includes('backlog')) return 'outline';
    return 'outline';
  };
  
  const getIssueTypeIcon = (issueType: string) => {
    return <FileText className="h-4 w-4 mr-2 text-muted-foreground" />;
  };

  if (isLoading && !paginatedIssues) {
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
        <AlertDescription>
            {searchQuery 
                ? `No issues found matching your search for "${searchQuery}". Try a different keyword.`
                : 'No issues found for the selected project. You can still raise a new bug.'
            }
        </AlertDescription>
      </Alert>
    );
  }

  const { issues, total, page, totalPages } = paginatedIssues;

  const getActionContent = () => {
    if (actionType === 'generateCode') {
      return { icon: <Bot className="mr-2 h-4 w-4" />, text: 'Generate Code' };
    }
    return { icon: <Wand2 className="mr-2 h-4 w-4" />, text: 'Generate Tests' };
  };
  const { icon, text } = getActionContent();

  return (
    <div className="mt-6">
      <div className={`transition-opacity duration-300 ${isFetching || isActionDisabled ? 'opacity-50' : 'opacity-100'}`}>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Key</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right w-[180px]">Actions</TableHead>
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
                      onClick={() => onActionClick(issue)}
                      className="shadow-sm hover:shadow-md transition-shadow"
                      disabled={isActionDisabled}
                    >
                      {icon}
                      {text}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages}. Total issues: {total}.
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1 || isFetching || isActionDisabled}
              className="h-8 w-8"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || isFetching || isActionDisabled}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || isFetching || isActionDisabled}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
             <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages || isFetching || isActionDisabled}
              className="h-8 w-8"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
