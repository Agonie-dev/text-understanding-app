-- 管理员系统表结构（纯净版，无触发器）

-- 1. API Key 存储表
create table if not exists api_keys (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  api_key text not null,
  base_url text default 'https://api.moonshot.cn/v1',
  is_active boolean default false,
  is_default boolean default false,
  created_at timestamptz default now()
);

-- 2. 应用配置表（管理员密码 + 游客配额）
create table if not exists app_config (
  id int primary key default 1 check (id = 1),
  admin_password_hash text not null default '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqhmM6JGKpS4G3R1G2JH8YpfB0Bqy',
  daily_summary_limit int not null default 10,
  daily_qa_rounds int not null default 20,
  updated_at timestamptz default now()
);

insert into app_config (id, admin_password_hash, daily_summary_limit, daily_qa_rounds)
values (1, '$2a$10$N9qo8uLOickgx2ZMRZoMy.MqrqhmM6JGKpS4G3R1G2JH8YpfB0Bqy', 10, 20)
on conflict (id) do nothing;

-- 3. 游客配额表
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

-- 关闭 RLS（后端直接操作）
alter table api_keys disable row level security;
alter table app_config disable row level security;
alter table visitor_quotas disable row level security;
