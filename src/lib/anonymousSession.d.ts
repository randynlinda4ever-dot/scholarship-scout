export type SupabaseAnonymousUser = {
  id: string;
  email?: string;
  is_anonymous?: boolean;
};

export type SupabaseAnonymousAuth = {
  getSession: () => Promise<{
    data?: { session?: { user?: SupabaseAnonymousUser } | null };
    error?: unknown | null;
  }>;
  signInAnonymously: () => Promise<{
    data?: { user?: SupabaseAnonymousUser | null };
    error?: unknown | null;
  }>;
};

export function ensureAnonymousUser(auth: SupabaseAnonymousAuth): Promise<SupabaseAnonymousUser>;
