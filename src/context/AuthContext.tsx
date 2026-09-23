import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, Store, Role, UserProfile } from '../types';
import { storage } from '../db/storageEngine';
import { supabase, isSupabaseConfigured } from '../db/supabase';
import { SupabaseBridge } from '../db/supabaseBridge';

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
  authReadError: string | null;
  signInWithEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  signOut: () => Promise<void>;
  switchUser: (userId: string) => void;
  refreshUserData: () => Promise<void>;
  canAccessStore: (storeId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Milestone 5H: truthful result contract for the private profile read.
 *  - success: the query completed and a visible profile row exists
 *  - notFound: the query completed with NO visible row (a genuine missing profile)
 *  - error: the read itself failed (network / query / permission / exception)
 *
 * A read failure must never be interpreted as "profile does not exist" and must
 * never be used to clear an already-valid authenticated StockFlow user.
 */
interface ProfileReadResult {
  success: boolean;
  profile?: UserProfile;
  notFound?: boolean;
  error?: string;
}

// Milestone 5H: wording for a FAILED profile read (never "profile not found").
const PROFILE_READ_FAILED_MESSAGE = 'StockFlow could not verify your profile. Check your connection and try again.';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  // Milestone 5H: connected-mode read-failure state. Set when a profile / stores
  // / users READ fails, cleared by the next successful read. Surfaced globally by
  // App.tsx because authError is only rendered by LoginPage (which is invisible
  // while currentUser is retained).
  const [authReadError, setAuthReadError] = useState<string | null>(null);

  // Milestone 5H: latest identity for the long-lived auth callbacks — the
  // onAuthStateChange closure is created once, so a plain `currentUser` read
  // inside it would be stale.
  const currentUserRef = useRef<User | null>(null);
  currentUserRef.current = currentUser;

  const isSupabaseActive = Boolean(isSupabaseConfigured && supabase);

  /**
   * Fetch user profile from Supabase `public.profiles` table
   *
   * Milestone 5H: uses `.maybeSingle()` plus the ProfileReadResult contract so
   * the four outcomes below stay distinguishable. Classification deliberately
   * does NOT depend on any PostgREST "no rows" error code, and no RLS / policy /
   * trigger / RPC is touched by this change.
   *  1. row visible              → success: true, profile set
   *  2. query ok, no visible row → success: false, notFound: true
   *  3. genuine query error      → success: false, notFound: false, error set
   *  4. thrown exception         → success: false, notFound: false, error set
   */
  const fetchSupabaseProfile = async (authUserId: string, authEmail?: string): Promise<ProfileReadResult> => {
    if (!supabase) {
      return { success: false, notFound: false, error: PROFILE_READ_FAILED_MESSAGE };
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUserId)
        .maybeSingle();

      if (error) {
        console.warn('Error fetching Supabase user profile:', error.message);
        return { success: false, notFound: false, error: PROFILE_READ_FAILED_MESSAGE };
      }

      if (!data) {
        // Query succeeded and no profile row is visible: a genuine missing profile.
        return { success: false, notFound: true };
      }

      return {
        success: true,
        profile: {
          id: data.id,
          email: data.email || authEmail || '',
          name: data.name || (authEmail ? authEmail.split('@')[0] : 'Staff Member'),
          role: (data.role as Role) || 'ATTENDANT',
          assignedStoreId: data.assigned_store_id || null,
          status: data.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        },
      };
    } catch (err: any) {
      console.error('Unexpected error fetching profile:', err);
      return { success: false, notFound: false, error: PROFILE_READ_FAILED_MESSAGE };
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
    // Milestone 5H: a verified profile read clears any previous read warning.
    setAuthReadError(null);

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
   *
   * Milestone 5H (C3): every read is inspected instead of silently discarded.
   * Successful datasets replace state, failed datasets retain the previous valid
   * state and are reported as ONE concise authReadError. A failed profile read
   * never clears a valid identity and never signs the user out.
   */
  const refreshUserData = async () => {
    if (isSupabaseActive && supabase) {
      const failedReads: string[] = [];

      try {
        const [storesRes, usersRes] = await Promise.all([
          SupabaseBridge.fetchStores(),
          SupabaseBridge.fetchUsers()
        ]);

        if (storesRes.success && storesRes.stores) {
          setStores(storesRes.stores);
        } else if (!storesRes.success) {
          // Retain the previous store list rather than erasing good data.
          console.warn('Refresh could not load store branches:', storesRes.error);
          failedReads.push('store branches');
        }

        if (usersRes.success && usersRes.users) {
          setUsers(usersRes.users);
        } else if (!usersRes.success) {
          // Retain the previous staff list rather than erasing good data.
          console.warn('Refresh could not load the staff list:', usersRes.error);
          failedReads.push('staff list');
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('Supabase session read error:', sessionError.message);
          failedReads.push('session');
        }

        if (session?.user) {
          const profileRes = await fetchSupabaseProfile(session.user.id, session.user.email);

          if (profileRes.success && profileRes.profile) {
            applyProfile(profileRes.profile);
          } else if (profileRes.notFound) {
            // Genuine missing profile — existing denial behaviour preserved.
            setUserProfile(null);
            setCurrentUser(null);
            setAuthError(
              'Authenticated successfully, but no corresponding StockFlow profile was found in public.profiles. Please contact an administrator.'
            );
          } else {
            // Read FAILURE: keep currentUser / userProfile exactly as they are.
            console.warn('Refresh could not verify the profile:', profileRes.error);
            failedReads.push('profile');
            if (!currentUserRef.current) {
              // No verified profile data to build an identity from.
              setAuthError(profileRes.error || PROFILE_READ_FAILED_MESSAGE);
            }
          }
        }
      } catch (err: any) {
        // Milestone 5H: a thrown read must surface, never disappear.
        console.error('Refresh failed unexpectedly:', err);
        failedReads.push('data refresh');
      }

      if (failedReads.length > 0) {
        setAuthReadError(
          `StockFlow could not refresh some account data (${failedReads.join(', ')}). ` +
            'Your current session is still active. Check your connection and retry.'
        );
      } else {
        // Milestone 5H: cleared after a fully successful refresh.
        setAuthReadError(null);
      }
    } else {
      // In local mode, fall back to storage current user
      setUsers(storage.getUsers());
      setStores(storage.getStores());
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
          const [{ stores: dbStores }, { users: dbUsers }] = await Promise.all([
            SupabaseBridge.fetchStores(),
            SupabaseBridge.fetchUsers()
          ]);
          if (isMounted) {
            if (dbStores) setStores(dbStores);
            if (dbUsers) setUsers(dbUsers);
          }

          // 1. Get current active session
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (sessionError) {
            console.error('Supabase session recovery error:', sessionError);
            if (isMounted) setAuthError(sessionError.message);
          }

          if (session?.user) {
            const profileRes = await fetchSupabaseProfile(session.user.id, session.user.email);
            if (!isMounted) return;

            if (profileRes.success && profileRes.profile) {
              applyProfile(profileRes.profile);
            } else if (profileRes.notFound) {
              // Genuine missing profile — existing access-denial behaviour preserved.
              setUserProfile(null);
              setCurrentUser(null);
              setAuthError(
                'Authenticated, but no profile found in public.profiles. Please check with an administrator.'
              );
            } else {
              // Milestone 5H: the READ failed — this is not a missing profile.
              // An already-loaded identity is retained and nothing is signed out.
              console.warn('Profile read failed while restoring the session:', profileRes.error);
              const msg = profileRes.error || PROFILE_READ_FAILED_MESSAGE;
              setAuthReadError(msg);
              if (!currentUserRef.current) {
                // First restoration: no verified profile data exists to build an
                // identity from, so the UI stays unauthenticated (identity states
                // are untouched) and LoginPage explains the real reason.
                setAuthError(msg);
              }
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
                const profileRes = await fetchSupabaseProfile(newSession.user.id, newSession.user.email);
                if (profileRes.success && profileRes.profile) {
                  applyProfile(profileRes.profile);
                } else if (profileRes.notFound) {
                  // Genuine missing profile — existing access-denial behaviour preserved.
                  setUserProfile(null);
                  setCurrentUser(null);
                  setAuthError(
                    'Authenticated, but no profile found in public.profiles.'
                  );
                } else {
                  // Milestone 5H: read failure on INITIAL_SESSION / SIGNED_IN /
                  // TOKEN_REFRESHED / USER_UPDATED. Retain the current identity,
                  // surface the failure, never sign out, never claim "not found".
                  console.warn('Profile read failed on auth state change:', profileRes.error);
                  const msg = profileRes.error || PROFILE_READ_FAILED_MESSAGE;
                  setAuthReadError(msg);
                  if (!currentUserRef.current) {
                    setAuthError(msg);
                  }
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
          if (isMounted) {
            setUsers(storage.getUsers());
            setStores(storage.getStores());
            const localUser = storage.getCurrentUser();
            if (localUser) {
              setCurrentUser(localUser);
            }
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

        // Fetch corresponding profile (Milestone 5H: missing vs failed read)
        const profileRes = await fetchSupabaseProfile(data.user.id, data.user.email);

        if (profileRes.notFound) {
          setUserProfile(null);
          setCurrentUser(null);
          const msg =
            'Account authenticated, but no matching profile exists in public.profiles. Access is denied.';
          setAuthError(msg);
          return { success: false, error: msg };
        }

        if (!profileRes.success || !profileRes.profile) {
          // Milestone 5H: the READ failed — not a missing profile. The Supabase
          // session created above is deliberately left intact (no signOut), so a
          // transient read failure never becomes a credential/session failure.
          // No profile is invented and the identity states are left untouched.
          const msg =
            'Your account was authenticated, but StockFlow could not verify your profile. Check your connection and try again.';
          setAuthError(msg);
          return { success: false, error: msg };
        }

        if (profileRes.profile.status === 'SUSPENDED') {
          setUserProfile(null);
          setCurrentUser(null);
          const msg = 'Your account is suspended. Please contact a Super Admin.';
          setAuthError(msg);
          return { success: false, error: msg };
        }

        applyProfile(profileRes.profile);
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
    // Milestone 5F: demo-only. While Supabase Auth is connected the
    // authenticated identity is authoritative, so no browser-local identity is
    // written or read and the session is left untouched.
    if (isSupabaseActive) {
      console.warn('[auth] switchUser is disabled while Supabase Auth is connected.');
      return;
    }

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
        authReadError,
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
