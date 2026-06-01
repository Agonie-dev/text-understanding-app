import { supabase } from './supabase';

export interface QuotaInfo {
  summaryUsed: number;
  summaryLimit: number;
  summaryRemaining: number;
  qaUsed: number;
  qaLimit: number;
  qaRemaining: number;
}

export async function getAppConfig() {
  const { data, error } = await supabase
    .from('app_config')
    .select('*')
    .eq('id', 1)
    .single();
  if (error || !data) {
    return {
      daily_summary_limit: 10,
      daily_qa_rounds: 20,
      admin_password_hash: null,
    };
  }
  return data;
}

export async function getVisitorQuota(visitorId: string, date?: string): Promise<QuotaInfo> {
  const today = date || new Date().toISOString().slice(0, 10);
  const config = await getAppConfig();

  const { data } = await supabase
    .from('visitor_quotas')
    .select('*')
    .eq('visitor_id', visitorId)
    .eq('date', today)
    .single();

  if (!data) {
    return {
      summaryUsed: 0,
      summaryLimit: config.daily_summary_limit,
      summaryRemaining: config.daily_summary_limit,
      qaUsed: 0,
      qaLimit: config.daily_qa_rounds,
      qaRemaining: config.daily_qa_rounds,
    };
  }

  return {
    summaryUsed: data.summary_used,
    summaryLimit: config.daily_summary_limit,
    summaryRemaining: Math.max(0, config.daily_summary_limit - data.summary_used),
    qaUsed: data.qa_used,
    qaLimit: config.daily_qa_rounds,
    qaRemaining: Math.max(0, config.daily_qa_rounds - data.qa_used),
  };
}

export async function checkAndConsumeQuota(
  visitorId: string,
  type: 'summary' | 'qa',
  ipHash?: string
): Promise<{ allowed: boolean; remaining: number; message?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  const config = await getAppConfig();

  const limit = type === 'summary' ? config.daily_summary_limit : config.daily_qa_rounds;

  // upsert 配额记录并原子扣减
  const { data: existing } = await supabase
    .from('visitor_quotas')
    .select('*')
    .eq('visitor_id', visitorId)
    .eq('date', today)
    .single();

  const currentUsed = existing ? (type === 'summary' ? existing.summary_used : existing.qa_used) : 0;

  if (currentUsed >= limit) {
    return {
      allowed: false,
      remaining: 0,
      message: `今日${type === 'summary' ? '总结' : '问答'}次数已用完（${limit}次），请明天再试`,
    };
  }

  const newSummary = type === 'summary' ? currentUsed + 1 : (existing?.summary_used || 0);
  const newQa = type === 'qa' ? currentUsed + 1 : (existing?.qa_used || 0);

  await supabase.from('visitor_quotas').upsert(
    {
      visitor_id: visitorId,
      ip_hash: ipHash || existing?.ip_hash || null,
      date: today,
      summary_used: newSummary,
      qa_used: newQa,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'visitor_id,date' }
  );

  return {
    allowed: true,
    remaining: limit - currentUsed - 1,
  };
}

export function generateVisitorId(): string {
  return 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
