-- 아이디(이메일) 찾기: 가입할 때 적은 이름으로, 가려진 이메일만 돌려준다 (예: hs****@gmail.com)
-- 로그인 전에 부르므로 anon 에게 실행 권한을 준다. 표(auth.users, profiles)는 직접 열지 않고 이 함수로만 읽는다.
-- 같은 이름이 여러 명이면 가입 순서대로 최대 5개. 이름은 2~30자만 받는다.

create or replace function public.find_login_emails(p_name text)
returns table (email text)
language sql stable security definer set search_path = '' as $$
  select left(split_part(u.email, '@', 1), 2)
         || repeat('*', greatest(char_length(split_part(u.email, '@', 1)) - 2, 3))
         || '@' || split_part(u.email, '@', 2)
  from public.profiles p
  join auth.users u on u.id = p.id
  where char_length(trim(p_name)) between 2 and 30
    and p.name = trim(p_name)
    and u.email is not null
  order by u.created_at
  limit 5;
$$;

revoke all on function public.find_login_emails(text) from public;
grant execute on function public.find_login_emails(text) to anon, authenticated;
