// Verbindung zu Supabase. Ohne VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// (siehe .env.example) ist `supabase` null und die App läuft rein lokal.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;

export const cloudEnabled = supabase !== null;
