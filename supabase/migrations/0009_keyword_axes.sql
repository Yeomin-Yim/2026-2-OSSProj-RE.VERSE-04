-- 키워드 → 공통 축(2층). 학생 키워드와 학과·직무 키워드를 잇는 고정된 다리 (Src/lib/core/keywords/axes.ts)
-- 축 코드는 규칙 사전 v0.5 의 태그 코드 + 보충 축(D19 정보보안, D20 네트워크·통신, D21 수학·이론).
-- 한 키워드의 축은 처음 정한 것을 계속 쓴다 (일관성). 비어 있을 때만 채운다.

alter table public.keywords add column axes text[] not null default '{}';

drop function if exists public.kw_learn(jsonb, jsonb);

-- p_keywords : [{canonical, category, embedding, origin, axes}]
-- p_aliases  : [{surface, decision, canonical, context_free}]
-- p_axes_for : [{canonical, axes}]  사전에 있지만 축이 비어 있던 키워드
create or replace function public.kw_learn(p_keywords jsonb, p_aliases jsonb, p_axes_for jsonb default '[]')
returns table (canonical text, id bigint) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if jsonb_array_length(p_keywords) > 100 or jsonb_array_length(p_aliases) > 300 or jsonb_array_length(p_axes_for) > 100 then
    raise exception 'too many items';
  end if;

  insert into keywords (canonical, category, embedding, origin, status, axes)
  select k->>'canonical', k->>'category', array(select jsonb_array_elements_text(k->'embedding')::real),
         coalesce(k->>'origin', 'student'),
         case when k->>'origin' = 'profile' then 'active' else 'candidate' end,
         coalesce(array(select left(x, 8) from jsonb_array_elements_text(coalesce(k->'axes', '[]'::jsonb)) x limit 3), '{}')
  from jsonb_array_elements(p_keywords) k
  where char_length(k->>'canonical') between 1 and 30
    and jsonb_array_length(k->'embedding') between 64 and 3072
  on conflict do nothing;

  update keywords w set axes = array(select left(x, 8) from jsonb_array_elements_text(f->'axes') x limit 3), updated_at = now()
  from jsonb_array_elements(p_axes_for) f
  where lower(w.canonical) = lower(f->>'canonical') and w.axes = '{}';

  insert into keyword_aliases (surface, decision, keyword_id, context_free, decided_by, updated_at)
  select left(a->>'surface', 40), a->>'decision',
         (select w.id from keywords w where lower(w.canonical) = lower(a->>'canonical')),
         coalesce((a->>'context_free')::boolean, true), 'ai', now()
  from jsonb_array_elements(p_aliases) a
  where char_length(a->>'surface') between 1 and 40 and a->>'decision' in ('keyword','stop')
  on conflict (surface) do update set
    decision = excluded.decision, keyword_id = excluded.keyword_id, context_free = excluded.context_free,
    decided_by = excluded.decided_by, updated_at = now()
  where keyword_aliases.decided_by is distinct from 'team';

  return query
    select w.canonical, w.id from keywords w
    where lower(w.canonical) in (select lower(k->>'canonical') from jsonb_array_elements(p_keywords) k);
end $$;

revoke all on function public.kw_learn(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.kw_learn(jsonb, jsonb, jsonb) to authenticated, service_role;
