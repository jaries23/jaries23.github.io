begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create type public.site_role as enum ('user', 'admin');
create type public.gallery_visibility as enum ('public', 'restricted', 'private');
create type public.member_role as enum ('member', 'moderator', 'owner');
create type public.membership_status as enum ('active', 'pending', 'banned');
create type public.post_type as enum ('text', 'link', 'image', 'poll');
create type public.content_status as enum ('published', 'removed', 'deleted');
create type public.report_reason as enum ('spam', 'abuse', 'harassment', 'nsfw', 'off_topic', 'other');
create type public.report_status as enum ('open', 'reviewed', 'resolved', 'dismissed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext unique,
  display_name text not null default 'New user',
  bio text not null default '',
  avatar_url text,
  role public.site_role not null default 'user',
  reputation integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_check
    check (username is null or username::text ~ '^[a-z0-9_]{3,24}$')
);

create table public.galleries (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null,
  description text not null default '',
  visibility public.gallery_visibility not null default 'public',
  creator_id uuid not null references public.profiles (id) on delete restrict,
  is_nsfw boolean not null default false,
  member_count integer not null default 1,
  post_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint galleries_slug_check
    check (slug::text ~ '^[a-z0-9_]{3,32}$'),
  constraint galleries_name_check
    check (char_length(name) between 2 and 80)
);

create table public.gallery_rules (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  position integer not null default 1,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gallery_id, position)
);

create table public.gallery_members (
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (gallery_id, user_id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  type public.post_type not null default 'text',
  status public.content_status not null default 'published',
  title text not null,
  body text not null default '',
  url text,
  media jsonb not null default '[]'::jsonb,
  is_nsfw boolean not null default false,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  upvote_count integer not null default 0,
  downvote_count integer not null default 0,
  score integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_title_check
    check (char_length(title) between 3 and 300),
  constraint posts_link_check
    check (type <> 'link' or url is not null)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  parent_id uuid references public.comments (id) on delete cascade,
  body text not null,
  status public.content_status not null default 'published',
  depth integer not null default 0,
  upvote_count integer not null default 0,
  downvote_count integer not null default 0,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_body_check
    check (char_length(body) between 1 and 10000),
  constraint comments_depth_check
    check (depth between 0 and 8)
);

create table public.post_votes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.comment_votes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create table public.saved_posts (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  reason public.report_reason not null,
  details text not null default '',
  status public.report_status not null default 'open',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_target_check
    check (num_nonnulls(post_id, comment_id) = 1)
);

create table public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  target_user_id uuid references public.profiles (id) on delete set null,
  post_id uuid references public.posts (id) on delete set null,
  comment_id uuid references public.comments (id) on delete set null,
  action text not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  constraint moderation_logs_target_check
    check (num_nonnulls(target_user_id, post_id, comment_id) >= 1)
);

create index galleries_creator_idx on public.galleries (creator_id);
create index galleries_created_idx on public.galleries (created_at desc);
create index gallery_members_user_idx on public.gallery_members (user_id, status);
create index posts_gallery_feed_idx on public.posts (gallery_id, is_pinned desc, score desc, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index comments_post_idx on public.comments (post_id, created_at asc);
create index comments_parent_idx on public.comments (parent_id, created_at asc);
create index reports_gallery_idx on public.reports (gallery_id, created_at desc);

create or replace function public.is_site_admin(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = coalesce(target_user, auth.uid())
      and p.role = 'admin'
  );
$$;

create or replace function public.is_gallery_staff(target_gallery uuid, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.gallery_members gm
    where gm.gallery_id = target_gallery
      and gm.user_id = coalesce(target_user, auth.uid())
      and gm.status = 'active'
      and gm.role in ('owner', 'moderator')
  );
$$;

create or replace function public.can_read_gallery(target_gallery uuid, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.galleries g
    where g.id = target_gallery
      and (
        g.visibility = 'public'
        or public.is_site_admin(target_user)
        or exists (
          select 1
          from public.gallery_members gm
          where gm.gallery_id = g.id
            and gm.user_id = coalesce(target_user, auth.uid())
            and gm.status = 'active'
        )
      )
  );
$$;

create or replace function public.can_write_gallery(target_gallery uuid, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.galleries g
    where g.id = target_gallery
      and (
        g.visibility = 'public'
        or public.is_site_admin(target_user)
        or exists (
          select 1
          from public.gallery_members gm
          where gm.gallery_id = g.id
            and gm.user_id = coalesce(target_user, auth.uid())
            and gm.status = 'active'
        )
      )
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      'New user'
    ),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.handle_new_gallery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gallery_members (gallery_id, user_id, role, status)
  values (new.id, new.creator_id, 'owner', 'active')
  on conflict (gallery_id, user_id) do update
    set role = 'owner',
        status = 'active',
        updated_at = now();

  return new;
end;
$$;

create or replace function public.sync_comment_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_post uuid;
  parent_depth integer;
  target_gallery uuid;
begin
  select p.gallery_id into target_gallery
  from public.posts p
  where p.id = new.post_id;

  if target_gallery is null then
    raise exception 'Post not found for comment';
  end if;

  new.gallery_id = target_gallery;

  if new.parent_id is null then
    new.depth = 0;
    return new;
  end if;

  select c.post_id, c.depth into parent_post, parent_depth
  from public.comments c
  where c.id = new.parent_id;

  if parent_post is null then
    raise exception 'Parent comment not found';
  end if;

  if parent_post <> new.post_id then
    raise exception 'Parent comment must belong to the same post';
  end if;

  if parent_depth >= 8 then
    raise exception 'Maximum comment depth reached';
  end if;

  new.depth = parent_depth + 1;
  return new;
end;
$$;

create or replace function public.sync_report_gallery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.post_id is not null then
    select p.gallery_id into new.gallery_id
    from public.posts p
    where p.id = new.post_id;
  else
    select c.gallery_id into new.gallery_id
    from public.comments c
    where c.id = new.comment_id;
  end if;

  if new.gallery_id is null then
    raise exception 'Report target not found';
  end if;

  return new;
end;
$$;

create or replace function public.recalculate_post_votes(target_post uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posts p
  set upvote_count = (
        select count(*)
        from public.post_votes pv
        where pv.post_id = target_post
          and pv.value = 1
      ),
      downvote_count = (
        select count(*)
        from public.post_votes pv
        where pv.post_id = target_post
          and pv.value = -1
      ),
      score = (
        select coalesce(sum(pv.value), 0)
        from public.post_votes pv
        where pv.post_id = target_post
      )
  where p.id = target_post;
$$;

create or replace function public.recalculate_comment_votes(target_comment uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.comments c
  set upvote_count = (
        select count(*)
        from public.comment_votes cv
        where cv.comment_id = target_comment
          and cv.value = 1
      ),
      downvote_count = (
        select count(*)
        from public.comment_votes cv
        where cv.comment_id = target_comment
          and cv.value = -1
      ),
      score = (
        select coalesce(sum(cv.value), 0)
        from public.comment_votes cv
        where cv.comment_id = target_comment
      )
  where c.id = target_comment;
$$;

create or replace function public.recalculate_post_comments(target_post uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posts p
  set comment_count = (
    select count(*)
    from public.comments c
    where c.post_id = target_post
      and c.status <> 'deleted'
  )
  where p.id = target_post;
$$;

create or replace function public.recalculate_gallery_posts(target_gallery uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.galleries g
  set post_count = (
    select count(*)
    from public.posts p
    where p.gallery_id = target_gallery
      and p.status <> 'deleted'
  )
  where g.id = target_gallery;
$$;

create or replace function public.recalculate_gallery_members(target_gallery uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.galleries g
  set member_count = (
    select count(*)
    from public.gallery_members gm
    where gm.gallery_id = target_gallery
      and gm.status = 'active'
  )
  where g.id = target_gallery;
$$;

create or replace function public.handle_post_vote_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_post_votes(coalesce(new.post_id, old.post_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.handle_comment_vote_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_comment_votes(coalesce(new.comment_id, old.comment_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.handle_comment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_post_comments(coalesce(new.post_id, old.post_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.handle_post_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_gallery_posts(coalesce(new.gallery_id, old.gallery_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.handle_gallery_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_gallery_members(coalesce(new.gallery_id, old.gallery_id));
  return coalesce(new, old);
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger galleries_set_updated_at
before update on public.galleries
for each row execute function public.set_updated_at();

create trigger gallery_rules_set_updated_at
before update on public.gallery_rules
for each row execute function public.set_updated_at();

create trigger gallery_members_set_updated_at
before update on public.gallery_members
for each row execute function public.set_updated_at();

create trigger posts_set_updated_at
before update on public.posts
for each row execute function public.set_updated_at();

create trigger comments_set_updated_at
before update on public.comments
for each row execute function public.set_updated_at();

create trigger post_votes_set_updated_at
before update on public.post_votes
for each row execute function public.set_updated_at();

create trigger comment_votes_set_updated_at
before update on public.comment_votes
for each row execute function public.set_updated_at();

create trigger reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

create trigger galleries_after_insert
after insert on public.galleries
for each row execute function public.handle_new_gallery();

create trigger comments_before_write
before insert or update on public.comments
for each row execute function public.sync_comment_fields();

create trigger reports_before_write
before insert or update on public.reports
for each row execute function public.sync_report_gallery();

create trigger post_votes_after_write
after insert or update or delete on public.post_votes
for each row execute function public.handle_post_vote_change();

create trigger comment_votes_after_write
after insert or update or delete on public.comment_votes
for each row execute function public.handle_comment_vote_change();

create trigger comments_after_write
after insert or update or delete on public.comments
for each row execute function public.handle_comment_change();

create trigger posts_after_write
after insert or update or delete on public.posts
for each row execute function public.handle_post_change();

create trigger gallery_members_after_write
after insert or update or delete on public.gallery_members
for each row execute function public.handle_gallery_member_change();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.galleries enable row level security;
alter table public.gallery_rules enable row level security;
alter table public.gallery_members enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_votes enable row level security;
alter table public.comment_votes enable row level security;
alter table public.saved_posts enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_logs enable row level security;

create policy profiles_read on public.profiles
for select to anon, authenticated
using (true);

create policy profiles_insert on public.profiles
for insert to authenticated
with check (auth.uid() = id or public.is_site_admin());

create policy profiles_update on public.profiles
for update to authenticated
using (auth.uid() = id or public.is_site_admin())
with check (auth.uid() = id or public.is_site_admin());

create policy galleries_read on public.galleries
for select to anon, authenticated
using (public.can_read_gallery(id));

create policy galleries_insert on public.galleries
for insert to authenticated
with check (creator_id = auth.uid());

create policy galleries_update on public.galleries
for update to authenticated
using (creator_id = auth.uid() or public.is_gallery_staff(id) or public.is_site_admin())
with check (creator_id = auth.uid() or public.is_gallery_staff(id) or public.is_site_admin());

create policy galleries_delete on public.galleries
for delete to authenticated
using (creator_id = auth.uid() or public.is_site_admin());

create policy gallery_rules_read on public.gallery_rules
for select to anon, authenticated
using (public.can_read_gallery(gallery_id));

create policy gallery_rules_write on public.gallery_rules
for all to authenticated
using (public.is_gallery_staff(gallery_id) or public.is_site_admin())
with check (public.is_gallery_staff(gallery_id) or public.is_site_admin());

create policy gallery_members_read on public.gallery_members
for select to anon, authenticated
using (public.can_read_gallery(gallery_id) or auth.uid() = user_id or public.is_site_admin());

create policy gallery_members_insert on public.gallery_members
for insert to authenticated
with check (
  public.is_site_admin()
  or public.is_gallery_staff(gallery_id)
  or (
    auth.uid() = user_id
    and role = 'member'
    and (
      (
        exists (
          select 1
          from public.galleries g
          where g.id = gallery_id
            and g.visibility = 'public'
        )
        and status = 'active'
      )
      or (
        exists (
          select 1
          from public.galleries g
          where g.id = gallery_id
            and g.visibility in ('restricted', 'private')
        )
        and status = 'pending'
      )
    )
  )
);

create policy gallery_members_update on public.gallery_members
for update to authenticated
using (public.is_gallery_staff(gallery_id) or public.is_site_admin())
with check (public.is_gallery_staff(gallery_id) or public.is_site_admin());

create policy gallery_members_delete on public.gallery_members
for delete to authenticated
using (auth.uid() = user_id or public.is_gallery_staff(gallery_id) or public.is_site_admin());

create policy posts_read on public.posts
for select to anon, authenticated
using (
  public.can_read_gallery(gallery_id)
  and (
    status = 'published'
    or auth.uid() = author_id
    or public.is_gallery_staff(gallery_id)
    or public.is_site_admin()
  )
);

create policy posts_insert on public.posts
for insert to authenticated
with check (author_id = auth.uid() and public.can_write_gallery(gallery_id));

create policy posts_update on public.posts
for update to authenticated
using (author_id = auth.uid() or public.is_gallery_staff(gallery_id) or public.is_site_admin())
with check (author_id = auth.uid() or public.is_gallery_staff(gallery_id) or public.is_site_admin());

create policy posts_delete on public.posts
for delete to authenticated
using (author_id = auth.uid() or public.is_gallery_staff(gallery_id) or public.is_site_admin());

create policy comments_read on public.comments
for select to anon, authenticated
using (
  public.can_read_gallery(gallery_id)
  and (
    status = 'published'
    or auth.uid() = author_id
    or public.is_gallery_staff(gallery_id)
    or public.is_site_admin()
  )
);

create policy comments_insert on public.comments
for insert to authenticated
with check (author_id = auth.uid() and public.can_write_gallery(gallery_id));

create policy comments_update on public.comments
for update to authenticated
using (author_id = auth.uid() or public.is_gallery_staff(gallery_id) or public.is_site_admin())
with check (author_id = auth.uid() or public.is_gallery_staff(gallery_id) or public.is_site_admin());

create policy comments_delete on public.comments
for delete to authenticated
using (author_id = auth.uid() or public.is_gallery_staff(gallery_id) or public.is_site_admin());

create policy post_votes_read on public.post_votes
for select to authenticated
using (auth.uid() = user_id or public.is_site_admin());

create policy post_votes_insert on public.post_votes
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.posts p
    where p.id = post_id
      and p.status = 'published'
      and public.can_read_gallery(p.gallery_id)
  )
);

create policy post_votes_update on public.post_votes
for update to authenticated
using (auth.uid() = user_id or public.is_site_admin())
with check (auth.uid() = user_id or public.is_site_admin());

create policy post_votes_delete on public.post_votes
for delete to authenticated
using (auth.uid() = user_id or public.is_site_admin());

create policy comment_votes_read on public.comment_votes
for select to authenticated
using (auth.uid() = user_id or public.is_site_admin());

create policy comment_votes_insert on public.comment_votes
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.comments c
    where c.id = comment_id
      and c.status = 'published'
      and public.can_read_gallery(c.gallery_id)
  )
);

create policy comment_votes_update on public.comment_votes
for update to authenticated
using (auth.uid() = user_id or public.is_site_admin())
with check (auth.uid() = user_id or public.is_site_admin());

create policy comment_votes_delete on public.comment_votes
for delete to authenticated
using (auth.uid() = user_id or public.is_site_admin());

create policy saved_posts_read on public.saved_posts
for select to authenticated
using (auth.uid() = user_id or public.is_site_admin());

create policy saved_posts_insert on public.saved_posts
for insert to authenticated
with check (auth.uid() = user_id);

create policy saved_posts_delete on public.saved_posts
for delete to authenticated
using (auth.uid() = user_id or public.is_site_admin());

create policy reports_read on public.reports
for select to authenticated
using (auth.uid() = reporter_id or public.is_gallery_staff(gallery_id) or public.is_site_admin());

create policy reports_insert on public.reports
for insert to authenticated
with check (auth.uid() = reporter_id);

create policy reports_update on public.reports
for update to authenticated
using (public.is_gallery_staff(gallery_id) or public.is_site_admin())
with check (public.is_gallery_staff(gallery_id) or public.is_site_admin());

create policy moderation_logs_read on public.moderation_logs
for select to authenticated
using (public.is_gallery_staff(gallery_id) or public.is_site_admin());

create policy moderation_logs_insert on public.moderation_logs
for insert to authenticated
with check (
  auth.uid() = actor_id
  and (public.is_gallery_staff(gallery_id) or public.is_site_admin())
);

grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on function public.is_site_admin(uuid) to anon, authenticated;
grant execute on function public.is_gallery_staff(uuid, uuid) to anon, authenticated;
grant execute on function public.can_read_gallery(uuid, uuid) to anon, authenticated;
grant execute on function public.can_write_gallery(uuid, uuid) to anon, authenticated;

commit;
