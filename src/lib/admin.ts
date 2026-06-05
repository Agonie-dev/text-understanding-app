import { supabase } from './supabase';
import { decrypt } from './crypto';

export interface ApiKeyConfig {
  id: string;
  name: string;
  apiKey: string;   // 解密后的
  baseUrl: string;
  model?: string;
  authType?: string;
  isActive: boolean;
  isDefault: boolean;
}

export async function getActiveApiKey(): Promise<ApiKeyConfig | null> {
  const { data } = await supabase
    .from('api_keys')
    .select('*')
    .eq('is_active', true)
    .eq('is_default', true)
    .single();

  if (!data) {
    // 回退：取任意一个 active 的
    const { data: fallback } = await supabase
      .from('api_keys')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();
    if (!fallback) return null;
    return {
      id: fallback.id,
      name: fallback.name,
      apiKey: decrypt(fallback.api_key),
      baseUrl: fallback.base_url || 'https://api.moonshot.cn/v1',
      model: fallback.model || undefined,
      authType: fallback.auth_type || 'bearer',
      isActive: fallback.is_active,
      isDefault: fallback.is_default,
    };
  }

  return {
    id: data.id,
    name: data.name,
    apiKey: decrypt(data.api_key),
    baseUrl: data.base_url || 'https://api.moonshot.cn/v1',
    model: data.model || undefined,
    authType: data.auth_type || 'bearer',
    isActive: data.is_active,
    isDefault: data.is_default,
  };
}

export async function getAllApiKeys(): Promise<Omit<ApiKeyConfig, 'apiKey'>[]> {
  const { data } = await supabase
    .from('api_keys')
    .select('id, name, base_url, model, auth_type, is_active, is_default, created_at')
    .order('created_at', { ascending: false });

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    apiKey: '', // 列表不返回明文
    baseUrl: row.base_url,
    model: row.model,
    authType: row.auth_type,
    isActive: row.is_active,
    isDefault: row.is_default,
  }));
}
