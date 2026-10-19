import { createClient } from '@supabase/supabase-js';
export const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const supabase = configured ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!) : null;
export const LIMIT = 800_000_000;
export const MAX_FILE = 20_000_000;
export function formatBytes(bytes: number) { return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`; }
