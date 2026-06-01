-- Supabase 登录系统迁移
-- 在 Supabase Dashboard → SQL Editor 中执行

-- 1. API Key 存储表（加密存储）
create table if not exists api_keys (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  api_key text not null,        -- AES 加密后的密钥
  base_url text default 'https://api.moonshot.cn/v1',
  is_active boolean default false,
  is_default boolean default false,
  created_at timestamptz default now()
);

-- 确保只有一个默认 Key
create or replace function enforce_single_default_key()
returns trigger as $$
begin
  if NEW.is_default = true then
    update api_keys set is_default = false where id != NEW.id;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists single_default_key_trigger on api_keys;
create trigger single_default_key_trigger
  after insert or update on api_keys
  for each row
  execute function enforce_single_default_key();

-- 2. 应用配置表（管理员密码 + 游客配额）
create table if not exists app_config (
  id int primary key default 1 check (id = 1),
  admin_password_hash text not null default '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqhmM6JGKpS4G3R1G2JH8YpfB0Bqy',  -- 默认密码 'admin'（bcrypt）
  daily_summary_limit int not null default 10,
  daily_qa_rounds int not null default 20,
  updated_at timestamptz default now()
);

-- 初始化默认配置
insert into app_config (id, admin_password_hash, daily_summary_limit, daily_qa_rounds)
values (1, '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqhmM6JGKpS4G3R1G2JH8YpfB0Bqy', 10, 20)
on conflict (id) do nothing;

-- 3. 游客配额表（按 visitor_id + 自然日）
create table if not exists visitor_quotas (
  id uuid default gen_random_uuid() primary key,
  visitor_id text not null,
  ip_hash text,
  date date not null,
  summary_used int not null default 0,
  qa_used int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(visitor_id, date)
);

-- 4. RLS 策略（禁用，让后端用 service role key 操作更灵活）
alter table api_keys disable row level security;
alter table app_config disable row level security;
alter table visitor_quotas disable row level security;

-- 5. 初始化默认 API Key（把现有的 Kimi Key 迁移进来，需手动替换加密值）
-- 注意：以下 INSERT 中的 api_key 是明文示例，实际部署前请用加密后的值替换
-- insert into api_keys (name, api_key, base_url, is_active, is_default)
-- values ('Kimi 默认', 'ENCRYPTED_VALUE_HERE', 'https://api.moonshot.cn/v1', true, true)
-- on conflict do nothing;
