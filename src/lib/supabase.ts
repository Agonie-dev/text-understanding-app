import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function createSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createSupabaseClient();
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) {
    const client = getSupabase();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export interface HistoryRecord {
  id: string;
  created_at: string;
  filename: string;
  file_size: number;
  file_type: string;
  operation_type: 'upload' | 'summarize' | 'convert';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result_url?: string;
  summary_text?: string;
  error_message?: string;
}
