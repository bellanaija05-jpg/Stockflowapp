import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Store, Role, UserProfile } from '../types';
import { storage } from '../db/storageEngine';
import { supabase, isSupabaseConfigured } from '../db/supabase';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  currentStore: Store | null;
  stores: Store[];
  users: User[];
  isAdmin: boolean;
  isLoading: boolean;
  isSupabaseActive: boolean;
  authError: string | null;
  signInWithEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  signOut: () => Promise<void>;
  switchUser: (userId: string) => void;
  refreshUserData: () => Promise<void>;
  canAccessStore: (storeId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [stores, setStores] = useState<Store[]>(() => storage.getStores());
  const [users, setUsers] = useState<User[]>(() => storage.getUsers());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const isSupabaseActive = Boolean(isSupabaseConfigured && supabase);

  /**
   * Fetch user profile from Supabase `public.profiles` table
   */
  const fetchSupabaseProfile = async (authUserId: string, authEmail?: string): Promise<UserProfile | null> => {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUserId)
        .single();

      if (error) {
        console.warn('Error fetching Supabase user profile:', error.message);
        return null;
      }

      if (!data) return null;

      return {
        id: data.id,
        email: data.email || authEmail || '',
        name: data.name || (authEmail ? authEmail.split('@')[0] : 'Staff Member'),
        role: (data.role as Role) || 'ATTENDANT',
        assignedStoreId: data.assigned_store_id || null,
        status: data.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    } catch (err: any) {
      console.error('Unexpected error fetching profile:', err);
      return null;
    }
  };

  /**
   * Set the active application user from a loaded profile
   */
  const applyProfile = (prof: UserProfile): void => {
    if (prof.status === 'SUSPENDED') {
      setUserProfile(null);
      setCurrentUser(null);
      setAuthError('Your StockFlow account has been suspended. Please contact a Super Administrator.');
      return;
    }

    setUserProfile(prof);
    setAuthError(null);

    const mappedUser: User = {
      id: prof.id,
      name: prof.name,
      email: prof.email,
      role: prof.role,
      assignedStoreId: prof.assignedStoreId || undefined,
      status: 'ACTIVE',
      createdAt: prof.createdAt || new Date().toISOString(),
      updatedAt: prof.updatedAt || new Date().toISOString(),
    };

    setCurrentUser(mappedUser);
  };

  /**
   * Refresh all user data and synchronize stores
   */
  const refreshUserData = async () => {
    const updatedUsers = storage.getUsers();
    const updatedStores = storage.getStores();
    setUsers(updatedUsers);
    setStores(updatedStores);

    if (isSupabaseActive && supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchSupabaseProfile(session.user.id, session.user.email);
        if (profile) {
          applyProfile(profile);
        } else {
          setUserProfile(null);
          setCurrentUser(null);
          setAuthError(
            'Authenticated successfully, but no corresponding StockFlow profile was found in public.profiles. Please contact an administrator.'
          );
        }
      }
    } else {
      // In local mode, fall back to storage current user
      const localUser = storage.getCurrentUser();
      if (localUser) {
        setCurrentUser(localUser);
      }
    }
  };

  /**
   * Initialize authentication on mount
   */
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      setIsLoading(true);
      setAuthError(null);

      try {
        if (isSupabaseActive && supabase) {
          // 1. Get current active session
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            console.error('Supabase session recovery error:', sessionError);
            if (isMounted) setAuthError(sessionError.message);
          }

          if (session?.user) {
            const profile = await fetchSupabaseProfile(session.user.id, session.user.email);
            if (!isMounted) return;

            if (profile) {
              applyProfile(profile);
            } else {
              setUserProfile(null);
              setCurrentUser(null);
              setAuthError(
                'Authenticated, but no profile found in public.profiles. Please check with an administrator.'
              );
            }
          } else {
            // Not authenticated in Supabase
            if (isMounted) {
              setCurrentUser(null);
              setUserProfile(null);
            }
          }

          // 2. Subscribe to auth state changes (sign in, sign out, token refresh)
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, newSession) => {
              if (!isMounted) return;

              if (newSession?.user) {
                const profile = await fetchSupabaseProfile(newSession.user.id, newSession.user.email);
                if (profile) {
                  applyProfile(profile);
                } else {
                  setUserProfile(null);
                  setCurrentUser(null);
                  setAuthError(
                    'Authenticated, but no profile found in public.profiles.'
                  );
                }
              } else {
                setCurrentUser(null);
                setUserProfile(null);
              }
            }
          );

          return () => {
            subscription.unsubscribe();
          };
        } else {
          // Fallback demo/local storage mode when Supabase is not configured
          const localUser = storage.getCurrentUser();
          if (isMounted) {
            setCurrentUser(localUser);
          }
        }
      } catch (err: any) {
        console.error('Failed to initialize auth:', err);
        if (isMounted) setAuthError(err?.message || 'Authentication error');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [isSupabaseActive]);

  /**
   * Real Supabase Sign In with email and password
   */
  const signInWithEmail = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setAuthError(null);

    if (isSupabaseActive && supabase) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) {
          setAuthError(error.message);
          return { success: false, error: error.message };
        }

        if (!data.user) {
          const msg = 'No user returned after authentication.';
          setAuthError(msg);
          return { success: false, error: msg };
        }

        // Fetch corresponding profile
        const profile = await fetchSupabaseProfile(data.user.id, data.user.email);

        if (!profile) {
          setUserProfile(null);
          setCurrentUser(null);
          const msg =
            'Account authenticated, but no matching profile exists in public.profiles. Access is denied.';
          setAuthError(msg);
          return { success: false, error: msg };
        }

        if (profile.status === 'SUSPENDED') {
          setUserProfile(null);
          setCurrentUser(null);
          const msg = 'Your account is suspended. Please contact a Super Admin.';
          setAuthError(msg);
          return { success: false, error: msg };
        }

        applyProfile(profile);
        return { success: true };
      } catch (err: any) {
        const msg = err?.message || 'Failed to sign in.';
        setAuthError(msg);
        return { success: false, error: msg };
      }
    }

    // Fallback mode if Supabase environment is not set:
    // Match against seeded users to allow local testing
    const matchingUser = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (matchingUser) {
      storage.setCurrentUser(matchingUser.id);
      setCurrentUser(matchingUser);
      return { success: true };
    }

    const errorMsg = 'Invalid email or user not found in local directory.';
    setAuthError(errorMsg);
    return { success: false, error: errorMsg };
  };

  /**
   * Real Supabase Sign Up with email, password, and name
   */
  const signUpWithEmail = async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    setAuthError(null);

    if (isSupabaseActive && supabase) {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: {
              name: name.trim(),
            },
          },
        });

        if (error) {
          setAuthError(error.message);
          return { success: false, error: error.message };
        }
        
        // If email confirmation is enabled, session will be null
        if (data.user && !data.session) {
          return { 
            success: true, 
            message: 'Account created successfully! Please check your email for a confirmation link.' 
          };
        }

        // If auto sign-in occurs, the auth state listener will handle profile fetching
        return { success: true };
      } catch (err: any) {
        const msg = err?.message || 'Failed to sign up.';
        setAuthError(msg);
        return { success: false, error: msg };
      }
    }

    const errorMsg = 'Sign up is not supported in local demo mode. Please configure Supabase.';
    setAuthError(errorMsg);
    return { success: false, error: errorMsg };
  };

  /**
   * Sign out current user
   */
  const signOut = async (): Promise<void> => {
    try {
      if (isSupabaseActive && supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Supabase sign out error:', err);
    } finally {
      storage.setCurrentUser(null);
      setCurrentUser(null);
      setUserProfile(null);
      setAuthError(null);
    }
  };

  /**
   * Switch user (Demo/Inspection feature)
   */
  const switchUser = (userId: string) => {
    storage.setCurrentUser(userId);
    const selected = storage.getUserById(userId);
    if (selected) {
      setCurrentUser(selected);
      // Map to profile format for inspector
      setUserProfile({
        id: selected.id,
        name: selected.name,
        email: selected.email,
        role: selected.role,
        assignedStoreId: selected.assignedStoreId || null,
        status: 'ACTIVE',
      });
      setAuthError(null);
    }
  };

  const isAdmin = currentUser?.role === 'ADMIN';

  // Find assigned store if attendant, or null if admin
  const currentStore = currentUser?.assignedStoreId
    ? stores.find((s) => s.id === currentUser.assignedStoreId) || null
    : null;

  const canAccessStore = (storeId: string): boolean => {
    if (isAdmin) return true;
    return currentUser?.assignedStoreId === storeId;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        currentStore,
        stores,
        users,
        isAdmin,
        isLoading,
        isSupabaseActive,
        authError,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        switchUser,
        refreshUserData,
        canAccessStore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
