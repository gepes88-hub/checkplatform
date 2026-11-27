-- CHECK 진단 플랫폼 — 기본 스키마
-- 실행: Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여 넣고 Run (그다음 02 시드 파일)

create extension if not exists pgcrypto;

-- =========================================================
-- 1. 사용자 · 고객사
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  is_hcg boolean not null default false,       -- HCG 컨설턴트 (검수·발행 권한)
  created_at timestamptz not null default now()
);

-- 가입 시 프로필 자동 생성. HCG 도메인(@e-hcg.com)은 컨설턴트로 표시 (메일 인증을 켜 둘 것)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, is_hcg)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          coalesce(lower(new.email) like '%@e-hcg.com', false))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  employee_count int,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id uuid references public.orgs(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','viewer')),
  primary key (org_id, user_id)
);

create or replace function public.is_hcg() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_hcg from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid())
$$;

-- =========================================================
-- 2. 방법론 DB (HCG 자산 — 읽기 전용, HCG만 수정)
-- =========================================================
create table if not exists public.domains (
  id text primary key,                 -- vision, structure, ... / m1.goal ...
  layer text not null,                 -- input | throughput | outcome | extra | module
  module text not null default 'core', -- core | m1 | m2 ...
  name text not null,
  key_question text,
  sort int not null default 0
);

create table if not exists public.items (
  id text primary key,                 -- H01, M1_01 ...
  domain_id text not null references public.domains(id),
  sub text,                            -- 인사제도 하위(평가·보상 등)
  text text not null,
  kind text not null default 'likert' check (kind in ('likert','choice','multi','text')),
  options jsonb,                       -- choice/multi 보기
  max_pick int,                        -- multi 최대 선택 수
  reverse boolean not null default false,
  is_short boolean not null default false, -- 모듈 딥진단에 붙는 헬스체크 축약판
  source text,                         -- 원천 (TMax 2022, LEM 2023 ...)
  diagnosis_id uuid,                   -- null = 표준 문항, 값 = 해당 진단 맞춤 문항
  sort int not null default 0
);

create table if not exists public.interview_guides (
  id serial primary key,
  module text not null default 'core',
  track text not null check (track in ('exec','leader','staff')),
  domain_id text references public.domains(id),
  question text not null,
  intent text,
  sort int not null default 0
);

create table if not exists public.maturity_areas (
  id text primary key,                  -- job, grade, promo, eval, reward, edu, hiring, talent
  name text not null,
  elements jsonb not null,              -- ["직무 분류 체계", ...]
  levels jsonb not null,                -- {"1":"…","2":"…","3":"…","4":"…"}
  sort int not null default 0
);

create table if not exists public.checkpoints (
  id text primary key,
  module text not null default 'core',
  area text not null,
  text text not null,
  why text,
  sort int not null default 0
);

create table if not exists public.issue_library (
  id text primary key,
  module text not null default 'core',
  domain_id text references public.domains(id),
  title text not null,
  signals text,                         -- 어떤 신호가 보이면 이 이슈로 판단하는지
  root_causes text,
  prescriptions text,                   -- 처방(개선 방향·설계 상품)
  source text
);

create table if not exists public.modules (
  id text primary key,                  -- m1 ...
  name text not null,
  summary text,
  ready boolean not null default false,
  sort int not null default 0
);

-- =========================================================
-- 3. 진단 실행
-- =========================================================
create table if not exists public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  code text not null unique default upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)), -- 보안 공간 세션 코드
  kind text not null check (kind in ('health','module')),
  modules text[] not null default '{}',
  title text not null,
  status text not null default 'setup' check (status in ('setup','collecting','analyzing','review','published','closed')),
  settings jsonb not null default '{}'::jsonb,   -- segments, 안내문, 마감일
  survey_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  survey_open boolean not null default false,
  due_date date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.diagnosis_items (
  diagnosis_id uuid references public.diagnoses(id) on delete cascade,
  item_id text references public.items(id) on delete cascade,
  sort int not null default 0,
  primary key (diagnosis_id, item_id)
);

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.diagnoses(id) on delete cascade,
  demo jsonb not null default '{}'::jsonb,       -- {unit, level, role, tenure, age}
  answers jsonb not null default '{}'::jsonb,    -- {item_id: 1~5 | "보기" | ["보기"] | "주관식"}
  excluded boolean not null default false,       -- 무성의 응답
  created_at timestamptz not null default now()
);
create index if not exists survey_responses_diag on public.survey_responses(diagnosis_id);

create table if not exists public.interview_invites (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.diagnoses(id) on delete cascade,
  track text not null check (track in ('exec','leader','staff')),
  label text not null,                            -- '영업본부장' 같은 표시 이름 (실명 불필요)
  token text not null unique default encode(gen_random_bytes(12), 'hex'),
  status text not null default 'invited' check (status in ('invited','started','done')),
  summary jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.interview_messages (
  id bigserial primary key,
  invite_id uuid not null references public.interview_invites(id) on delete cascade,
  role text not null check (role in ('assistant','user')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references public.diagnoses(id) on delete cascade,
  name text not null,
  path text not null,                    -- storage: diag-docs/{diagnosis_id}/...
  mime text,
  text_content text,                     -- 브라우저에서 뽑은 텍스트 (docx·txt)
  status text not null default 'uploaded' check (status in ('uploaded','extracting','done','failed')),
  extracted jsonb,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.maturity_scores (
  diagnosis_id uuid references public.diagnoses(id) on delete cascade,
  area_id text references public.maturity_areas(id),
  element text not null,
  level numeric(2,1) not null,
  evidence text,
  source text,                           -- document id 또는 'manual'
  primary key (diagnosis_id, area_id, element)
);

create table if not exists public.analyses (
  diagnosis_id uuid primary key references public.diagnoses(id) on delete cascade,
  result jsonb not null,
  computed_at timestamptz not null default now()
);

-- 주관식 원문 등 개별 식별 가능성이 있는 분석 재료 (HCG·서버 전용)
create table if not exists public.analyses_private (
  diagnosis_id uuid primary key references public.diagnoses(id) on delete cascade,
  texts jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now()
);

create table if not exists public.reports (
  diagnosis_id uuid primary key references public.diagnoses(id) on delete cascade,
  sections jsonb not null,
  status text not null default 'draft' check (status in ('draft','published')),
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references public.profiles(id)
);

create table if not exists public.access_log (
  id bigserial primary key,
  diagnosis_id uuid references public.diagnoses(id) on delete cascade,
  user_id uuid references public.profiles(id),
  action text not null,                  -- enter | exit | lock | unlock | export ...
  at timestamptz not null default now()
);

create table if not exists public.ai_ledger (
  id bigserial primary key,
  diagnosis_id uuid references public.diagnoses(id) on delete set null,
  feature text not null,
  model text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,5),
  created_at timestamptz not null default now()
);

-- =========================================================
-- 4. RLS
-- =========================================================
alter table public.profiles enable row level security;
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.domains enable row level security;
alter table public.items enable row level security;
alter table public.interview_guides enable row level security;
alter table public.maturity_areas enable row level security;
alter table public.checkpoints enable row level security;
alter table public.issue_library enable row level security;
alter table public.modules enable row level security;
alter table public.diagnoses enable row level security;
alter table public.diagnosis_items enable row level security;
alter table public.survey_responses enable row level security;
alter table public.interview_invites enable row level security;
alter table public.interview_messages enable row level security;
alter table public.documents enable row level security;
alter table public.maturity_scores enable row level security;
alter table public.analyses enable row level security;
alter table public.reports enable row level security;
alter table public.analyses_private enable row level security;
alter table public.access_log enable row level security;
alter table public.ai_ledger enable row level security;

-- 진단 접근: 고객사 구성원 또는 HCG
create or replace function public.can_access_diag(p_diag uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_hcg() or exists (
    select 1 from public.diagnoses d join public.org_members m on m.org_id = d.org_id
    where d.id = p_diag and m.user_id = auth.uid())
$$;

drop policy if exists p_profiles_self on public.profiles;
create policy p_profiles_self on public.profiles for select using (id = auth.uid() or public.is_hcg());
drop policy if exists p_orgs_read on public.orgs;
create policy p_orgs_read on public.orgs for select using (public.is_org_member(id) or public.is_hcg());
drop policy if exists p_orgs_upd on public.orgs;
create policy p_orgs_upd on public.orgs for update using (public.is_org_member(id) or public.is_hcg());

drop policy if exists p_members_read on public.org_members;
create policy p_members_read on public.org_members for select using (user_id = auth.uid() or public.is_hcg());

-- 방법론 DB: 로그인 사용자 읽기, HCG만 쓰기
do $$ declare t text; begin
  foreach t in array array['domains','items','interview_guides','maturity_areas','checkpoints','issue_library','modules'] loop
    execute format('drop policy if exists p_%1$s_read on public.%1$s', t);
    execute format('create policy p_%1$s_read on public.%1$s for select using (auth.uid() is not null)', t);
    execute format('drop policy if exists p_%1$s_hcg on public.%1$s', t);
    execute format('create policy p_%1$s_hcg on public.%1$s for all using (public.is_hcg()) with check (public.is_hcg())', t);
  end loop;
end $$;
-- 고객이 만든 진단 맞춤 문항
drop policy if exists p_items_custom on public.items;
create policy p_items_custom on public.items for all
  using (diagnosis_id is not null and public.can_access_diag(diagnosis_id))
  with check (diagnosis_id is not null and public.can_access_diag(diagnosis_id));

drop policy if exists p_diag_read on public.diagnoses;
create policy p_diag_read on public.diagnoses for select using (public.can_access_diag(id));
drop policy if exists p_diag_upd on public.diagnoses;
create policy p_diag_upd on public.diagnoses for update using (public.can_access_diag(id));

do $$ declare t text; begin
  foreach t in array array['diagnosis_items','interview_invites','documents','maturity_scores','analyses'] loop
    execute format('drop policy if exists p_%1$s_rw on public.%1$s', t);
    execute format('create policy p_%1$s_rw on public.%1$s for all using (public.can_access_diag(diagnosis_id)) with check (public.can_access_diag(diagnosis_id))', t);
  end loop;
end $$;

-- 접근 기록은 남기기·보기만 (고치거나 지울 수 없음)
drop policy if exists p_access_log_rw on public.access_log;
drop policy if exists p_log_read on public.access_log;
create policy p_log_read on public.access_log for select using (public.can_access_diag(diagnosis_id));
drop policy if exists p_log_insert on public.access_log;
create policy p_log_insert on public.access_log for insert with check (user_id = auth.uid() and public.can_access_diag(diagnosis_id));

-- 원응답(개별 설문)은 HCG만 본다. 고객사는 analyze 결과(집계)만.
drop policy if exists p_resp_hcg on public.survey_responses;
create policy p_resp_hcg on public.survey_responses for select using (public.is_hcg());
-- 인터뷰 원문도 HCG만. 고객사는 요약(interview_invites.summary)만.
drop policy if exists p_imsg_hcg on public.interview_messages;
create policy p_imsg_hcg on public.interview_messages for select using (public.is_hcg());

-- 리포트: HCG는 항상, 고객사는 발행된 것만
drop policy if exists p_report_read on public.reports;
create policy p_report_read on public.reports for select using (
  public.is_hcg() or (status = 'published' and public.can_access_diag(diagnosis_id)));
drop policy if exists p_report_hcg on public.reports;
create policy p_report_hcg on public.reports for all using (public.is_hcg()) with check (public.is_hcg());

drop policy if exists p_apriv_hcg on public.analyses_private;
create policy p_apriv_hcg on public.analyses_private for select using (public.is_hcg());

drop policy if exists p_ledger_hcg on public.ai_ledger;
create policy p_ledger_hcg on public.ai_ledger for select using (public.is_hcg());

create or replace function public.guard_diag_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_hcg() or auth.uid() is null then return new; end if;
  if new.org_id <> old.org_id or new.survey_token <> old.survey_token or new.code <> old.code then
    raise exception 'forbidden';
  end if;
  if new.status in ('published','closed') and new.status <> old.status then
    raise exception 'forbidden: 발행은 HCG 검수 후에만 할 수 있습니다';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_diag on public.diagnoses;
create trigger trg_guard_diag before update on public.diagnoses for each row execute function public.guard_diag_update();

-- =========================================================
-- 5. RPC
-- =========================================================
-- 진단 만들기: 고객사 + 진단 + 기본 문항 세트
create or replace function public.create_diagnosis(
  p_org_name text, p_industry text, p_employees int,
  p_kind text, p_modules text[], p_title text, p_org_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_diag uuid;
begin
  if auth.uid() is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_kind not in ('health','module') then raise exception 'BAD_KIND'; end if;
  if p_kind = 'module' and coalesce(array_length(p_modules,1),0) = 0 then raise exception 'NO_MODULE: 딥진단 모듈을 하나 이상 골라 주세요'; end if;

  if p_org_id is not null then
    if not (public.is_org_member(p_org_id) or public.is_hcg()) then raise exception 'forbidden'; end if;
    v_org := p_org_id;
  else
    insert into orgs (name, industry, employee_count, created_by) values (p_org_name, p_industry, p_employees, auth.uid()) returning id into v_org;
    insert into org_members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  end if;

  insert into diagnoses (org_id, kind, modules, title, created_by, settings)
  values (v_org, p_kind, coalesce(p_modules,'{}'), p_title, auth.uid(), jsonb_build_object(
    'segments', jsonb_build_object(
      'unit', '[]'::jsonb,
      'level', '["사원","대리","과장","차장","부장 이상"]'::jsonb,
      'role', '["팀원","팀장 이상(직책자)"]'::jsonb,
      'tenure', '["1년 미만","1~3년","3~5년","5~10년","10년 이상"]'::jsonb,
      'age', '["20대","30대","40대","50대 이상"]'::jsonb)))
  returning id into v_diag;

  -- 헬스체크: 표준 전체 / 모듈: 축약판 + 모듈 문항
  insert into diagnosis_items (diagnosis_id, item_id, sort)
  select v_diag, i.id, row_number() over (order by d.sort, i.sort)
  from items i join domains d on d.id = i.domain_id
  where i.diagnosis_id is null and (
    (p_kind = 'health' and d.module = 'core') or
    (p_kind = 'module' and ((d.module = 'core' and i.is_short) or d.module = any(p_modules))));

  insert into access_log (diagnosis_id, user_id, action) values (v_diag, auth.uid(), 'create');
  return v_diag;
end $$;
grant execute on function public.create_diagnosis(text,text,int,text,text[],text,uuid) to authenticated;

-- 응답 현황 (개별 응답을 노출하지 않고 숫자만)
create or replace function public.response_stats(p_diag uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.can_access_diag(p_diag) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'total', count(*),
    'valid', count(*) filter (where not excluded),
    'by_unit', coalesce((select jsonb_object_agg(u, n) from (
        select coalesce(demo->>'unit','(미응답)') u, count(*) n from survey_responses where diagnosis_id = p_diag group by 1) x), '{}'::jsonb),
    'last_at', max(created_at))
  into v from survey_responses where diagnosis_id = p_diag;
  return v;
end $$;
grant execute on function public.response_stats(uuid) to authenticated;

-- =========================================================
-- 6. Storage (제도 문서)
-- =========================================================
insert into storage.buckets (id, name, public) values ('diag-docs', 'diag-docs', false)
on conflict (id) do nothing;

drop policy if exists p_docs_rw on storage.objects;
create policy p_docs_rw on storage.objects for all
  using (bucket_id = 'diag-docs' and public.can_access_diag(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'diag-docs' and public.can_access_diag(((storage.foldername(name))[1])::uuid));
