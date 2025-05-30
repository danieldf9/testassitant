
"use client";
import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useEffect } from 'react';

export interface JiraCredentials {
  jiraUrl: string;
  email: string;
  apiToken: string;
}

interface AuthContextType {
  credentials: JiraCredentials | null;
  setCredentials: (credentials: JiraCredentials | null) => void;
  isAuthenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [credentials, setCredentialsState] = useState<JiraCredentials | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Load credentials from localStorage on mount
    try {
      const storedCredentials = localStorage.getItem('jiraCredentials');
      if (storedCredentials) {
        setCredentialsState(JSON.parse(storedCredentials));
      }
    } catch (error) {
      console.error("Failed to parse credentials from localStorage", error);
      localStorage.removeItem('jiraCredentials');
    }
    setIsInitialized(true);
  }, []);
  
  const setCredentials = (newCredentials: JiraCredentials | null) => {
    setCredentialsState(newCredentials);
    if (newCredentials) {
      localStorage.setItem('jiraCredentials', JSON.stringify(newCredentials));
    } else {
      localStorage.removeItem('jiraCredentials');
    }
  };

  const logout = () => {
    setCredentials(null);
  };
  
  // Wait until initialized to determine isAuthenticated to avoid flash of unauthenticated content
  const isAuthenticated = isInitialized ? !!credentials : false;


  return (
    <AuthContext.Provider value={{ credentials, setCredentials, isAuthenticated: isAuthenticated && isInitialized, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
