import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApiClient } from '../lib/api';

export type UserRole = 'ADMIN' | 'LECTURER' | 'STUDENT' | 'PLACEMENT_OFFICER';

/** Landing route of each role's dashboard. */
export const ROLE_HOME: Record<UserRole, string> = {
  ADMIN: '/admin',
  LECTURER: '/lecturer',
  STUDENT: '/student',
  PLACEMENT_OFFICER: '/placement',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  LECTURER: 'Lecturer',
  STUDENT: 'Student',
  PLACEMENT_OFFICER: 'Placement Officer',
};

export interface UserProfile {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  student_profile?: {
    id: number;
    student_id_number: string;
    rfid_uid?: string;
    department_name?: string;
    course_name?: string;
    section_name?: string;
  };
  lecturer_profile?: {
    id: number;
    employee_id: string;
    designation: string;
    qualification?: string;
    specialization?: string;
    department_name?: string;
  };
}

interface AuthContextType {
  user: UserProfile | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<UserProfile>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('campus_core_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchProfile = async () => {
    try {
      const profile = await ApiClient.get<UserProfile>('/auth/me');
      setUser(profile);
      localStorage.setItem('campus_core_user', JSON.stringify(profile));
    } catch {
      setUser(null);
      ApiClient.clearToken();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('campus_core_token');
    if (token) {
      fetchProfile();
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (usernameOrEmail: string, password: string): Promise<UserProfile> => {
    setIsLoading(true);
    try {
      const tokenRes = await ApiClient.post<{
        access_token: string;
        role: UserRole;
        user_id: number;
        full_name: string;
        username: string;
      }>('/auth/login', {
        username_or_email: usernameOrEmail,
        password: password,
      });

      ApiClient.setToken(tokenRes.access_token);
      const profile = await ApiClient.get<UserProfile>('/auth/me');
      setUser(profile);
      localStorage.setItem('campus_core_user', JSON.stringify(profile));
      return profile;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    ApiClient.clearToken();
    setUser(null);
    window.location.href = '/login';
  };

  const refreshUser = async () => {
    await fetchProfile();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
