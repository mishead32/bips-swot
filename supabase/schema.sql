-- =====================================================================
--  BIPS SWOT SYSTEM  —  DATABASE SCHEMA v2  (Supabase / PostgreSQL)
--  Bhupindra International Public School, Patiala
--  Covers all 22 headings of the SWOT sheet.
--  Safe to run more than once (it never deletes your entered data).
-- =====================================================================

create extension if not exists pgcrypto;

-- Remove tables of the first trial version (v1) if they exist. They held no real data.
drop table if exists public.skill_ratings cascade;
drop table if exists public.skill_parameters cascade;
drop table if exists public.skill_sections cascade;
drop table if exists public.marks cascade;
drop table if exists public.assessment_topics cascade;
drop table if exists public.assessments cascade;
drop table if exists public.entry_locks cascade;
drop function if exists public.is_locked(text, text, text, text, text);
drop function if exists public.assessment_session(int);

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- Staff who can log in (one row per Supabase Auth user)
create table if not exists public.teachers (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null unique,
  name             text not null,
  role             text not null default 'teacher' check (role in ('admin','teacher')),
  assigned_classes text[] not null default '{}',
  phone            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists public.classes (
  id          text primary key,              -- e.g. 'I-Sunflower'
  grade       text not null,
  section     text not null,
  wing        text,
  sort_order  int  not null default 999,
  is_active   boolean not null default true
);

create table if not exists public.students (
  id                uuid primary key default gen_random_uuid(),
  admission_number  text not null unique,
  roll_number       int,
  name              text not null,
  class_id          text references public.classes(id) on update cascade,
  father_name       text,
  mother_name       text,
  gender            text,
  dob               date,
  admission_date    date,
  parent_contact    text,
  house             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);
create index if not exists students_class_idx on public.students(class_id);

-- The 22 headings of the SWOT sheet (ACADEMIC RECORD has its own tables below)
create table if not exists public.swot_headings (
  code        text primary key,
  name        text not null,
  sort_order  int  not null,
  scale_note  text,
  is_active   boolean not null default true
);

-- Sub-types under each heading.
--   input_type: score10 (0-10 or NA) | level10 (1-10, talent level) | sports (level name)
--               video (caption + link) | attendance (present / working days)
--               fee (Paid/Pending/NA) | ptm (P/A/NA)
create table if not exists public.swot_items (
  id            serial primary key,
  heading_code  text not null references public.swot_headings(code) on update cascade,
  name          text not null,
  input_type    text not null default 'score10'
                check (input_type in ('score10','level10','sports','video','attendance','fee','ptm')),
  group_name    text,
  sort_order    int  not null default 999,
  is_active     boolean not null default true,
  unique (heading_code, name)
);

-- One box of the sheet = one row: student x sub-type x month
create table if not exists public.swot_values (
  id           bigserial primary key,
  session      text not null,                 -- '2026-27'
  month        smallint not null check (month between 1 and 12),
  student_id   uuid not null references public.students(id) on delete cascade,
  item_id      int  not null references public.swot_items(id) on delete cascade,
  class_id     text,                          -- filled automatically
  value_num    numeric(6,2),                  -- score / level / present days
  value_num2   numeric(6,2),                  -- working days (attendance)
  value_text   text,                          -- NA / Paid / P / sports level / video link
  value_text2  text,                          -- video caption
  entry_date   date,
  entered_by   uuid,
  entered_name text,
  entered_at   timestamptz not null default now(),
  unique (session, month, student_id, item_id)
);
create index if not exists swot_values_lookup on public.swot_values(session, month, class_id);
create index if not exists swot_values_student on public.swot_values(student_id, session);

create table if not exists public.subjects (
  id          serial primary key,
  name        text not null unique,
  grade_based boolean not null default false,   -- true = A/B grades (e.g. Computer/IT)
  sort_order  int not null default 999,
  is_active   boolean not null default true
);

-- ACADEMIC RECORD: a test taken on a date (weekly test, PT, half yearly ...)
create table if not exists public.academic_tests (
  id            bigserial primary key,
  session       text not null,
  month         smallint not null check (month between 1 and 12),
  class_id      text not null references public.classes(id) on update cascade,
  subject_id    int  not null references public.subjects(id) on delete cascade,
  test_date     date not null,
  test_type     text not null default 'Weekly Test',
  topic         text,
  max_marks     numeric(6,2),
  teacher_name  text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (class_id, subject_id, test_date, test_type)
);
create index if not exists academic_tests_lookup on public.academic_tests(session, class_id, month);

create table if not exists public.academic_marks (
  id           bigserial primary key,
  test_id      bigint not null references public.academic_tests(id) on delete cascade,
  student_id   uuid   not null references public.students(id) on delete cascade,
  class_id     text,
  marks        numeric(6,2),
  grade        text,
  status       text not null default 'P' check (status in ('P','Ab','NA','ML')),
  entered_by   uuid,
  entered_name text,
  entered_at   timestamptz not null default now(),
  unique (test_id, student_id)
);

-- ---------------------------------------------------------------------
-- 2. HELPER FUNCTIONS
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teachers where id = auth.uid() and role = 'admin' and is_active);
$$;

create or replace function public.can_access_class(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teachers t
                 where t.id = auth.uid() and t.is_active
                   and (t.role = 'admin' or cid = any(t.assigned_classes)));
$$;

create or replace function public.my_name() returns text
language sql stable security definer set search_path = public as $$
  select name from teachers where id = auth.uid();
$$;

-- Fill class / who / when and check the value matches the sub-type
create or replace function public.trg_swot_values() returns trigger
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if tg_op = 'INSERT' then
    select class_id into new.class_id from students where id = new.student_id;
    new.entered_by := auth.uid();
    new.entered_name := my_name();
    new.entered_at := now();
  end if;
  select input_type into t from swot_items where id = new.item_id;
  if t = 'score10' and not (new.value_text = 'NA' or (new.value_num between 0 and 10)) then
    raise exception 'Rating must be 0 to 10 or NA';
  elsif t = 'level10' and not (new.value_num between 1 and 10) then
    raise exception 'Talent level must be 1 to 10';
  elsif t = 'fee' and coalesce(new.value_text,'') not in ('Paid','Pending','NA') then
    raise exception 'Fee must be Paid, Pending or NA';
  elsif t = 'ptm' and coalesce(new.value_text,'') not in ('P','A','NA') then
    raise exception 'PTM must be P, A or NA';
  elsif t = 'attendance' and (new.value_num is null or new.value_num < 0 or (new.value_num2 is not null and new.value_num > new.value_num2)) then
    raise exception 'Present days cannot be more than working days';
  end if;
  return new;
end $$;
drop trigger if exists swot_values_fill on public.swot_values;
create trigger swot_values_fill before insert or update on public.swot_values
  for each row execute function public.trg_swot_values();

create or replace function public.trg_academic_marks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select class_id into new.class_id from academic_tests where id = new.test_id;
    new.entered_by := auth.uid();
    new.entered_name := my_name();
    new.entered_at := now();
  end if;
  return new;
end $$;
drop trigger if exists academic_marks_fill on public.academic_marks;
create trigger academic_marks_fill before insert or update on public.academic_marks
  for each row execute function public.trg_academic_marks();

-- Dashboard: how many boxes are filled per class & heading for a month
create or replace function public.swot_progress(p_session text, p_month int)
returns table (class_id text, heading_code text, filled bigint)
language sql stable security definer set search_path = public as $$
  select v.class_id, i.heading_code || case when i.input_type = 'video' then ':video' else '' end, count(*)
    from swot_values v join swot_items i on i.id = v.item_id
   where v.session = p_session and v.month = p_month and can_access_class(v.class_id)
   group by 1, 2
  union all
  select t.class_id, 'academic', count(*)
    from academic_tests t
   where t.session = p_session and t.month = p_month and can_access_class(t.class_id)
   group by 1;
$$;

-- Run once in SQL Editor after creating your login:  select make_admin('mis.gcs1@gmail.com', 'Raj Singh');
create or replace function public.make_admin(p_email text, p_name text) returns text
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then return 'NOT FOUND: first create this user in Authentication > Users'; end if;
  insert into public.teachers (id, email, name, role, assigned_classes, is_active)
  values (uid, lower(p_email), p_name, 'admin', '{}', true)
  on conflict (id) do update set role = 'admin', name = excluded.name, is_active = true;
  return 'OK: ' || p_email || ' is now ADMIN';
end $$;
revoke all on function public.make_admin(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. SECURITY (Row Level Security)
--    Teachers: see & ADD entries only for their classes. Once saved, an
--    entry cannot be changed or deleted by a teacher. Admin can do all.
-- ---------------------------------------------------------------------
alter table public.teachers       enable row level security;
alter table public.classes        enable row level security;
alter table public.students       enable row level security;
alter table public.swot_headings  enable row level security;
alter table public.swot_items     enable row level security;
alter table public.swot_values    enable row level security;
alter table public.subjects       enable row level security;
alter table public.academic_tests enable row level security;
alter table public.academic_marks enable row level security;

drop policy if exists teachers_read  on public.teachers;
drop policy if exists teachers_admin on public.teachers;
create policy teachers_read  on public.teachers for select to authenticated using (id = auth.uid() or public.is_admin());
create policy teachers_admin on public.teachers for all    to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['classes','swot_headings','swot_items','subjects'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('drop policy if exists %1$s_admin on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (true)', t);
    execute format('create policy %1$s_admin on public.%1$s for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
  foreach t in array array['swot_values','academic_tests','academic_marks'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('drop policy if exists %1$s_add on public.%1$s', t);
    execute format('drop policy if exists %1$s_edit on public.%1$s', t);
    execute format('drop policy if exists %1$s_del on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.can_access_class(class_id))', t);
    execute format('create policy %1$s_add  on public.%1$s for insert to authenticated with check (public.can_access_class(class_id))', t);
    execute format('create policy %1$s_edit on public.%1$s for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy %1$s_del  on public.%1$s for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists students_read  on public.students;
drop policy if exists students_admin on public.students;
create policy students_read  on public.students for select to authenticated using (public.can_access_class(class_id));
create policy students_admin on public.students for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. STARTING DATA
-- ---------------------------------------------------------------------
-- 4a. Classes (taken from the school's student list)
insert into public.classes (id, grade, section, wing, sort_order) values
  ('M I-Lilies','M I','Lilies','Montessori',1),
  ('M I-Orchid','M I','Orchid','Montessori',2),
  ('M II-Lilies','M II','Lilies','Montessori',3),
  ('M II-Orchid','M II','Orchid','Montessori',4),
  ('M III-Carnation','M III','Carnation','Montessori',5),
  ('M III-Daisies','M III','Daisies','Montessori',6),
  ('M III-Jasmine','M III','Jasmine','Montessori',7),
  ('M III-Rose','M III','Rose','Montessori',8),
  ('M IV-Carnation','M IV','Carnation','Montessori',9),
  ('M IV-Daisies','M IV','Daisies','Montessori',10),
  ('M IV-Jasmine','M IV','Jasmine','Montessori',11),
  ('M IV-Rose','M IV','Rose','Montessori',12),
  ('I-Lantana','I','Lantana','Primary',13),
  ('I-Sunflower','I','Sunflower','Primary',14),
  ('I-Tulip','I','Tulip','Primary',15),
  ('II-Arctic','II','Arctic','Primary',16),
  ('II-Atlantic','II','Atlantic','Primary',17),
  ('II-Pacific','II','Pacific','Primary',18),
  ('III-Keats','III','Keats','Primary',19),
  ('III-Tagore','III','Tagore','Primary',20),
  ('III-Wordsworth','III','Wordsworth','Primary',21),
  ('IV-Kalpana','IV','Kalpana','Primary',22),
  ('IV-Rakesh','IV','Rakesh','Primary',23),
  ('IV-William','IV','William','Primary',24),
  ('V-Earth','V','Earth','Primary',25),
  ('V-Mercury','V','Mercury','Primary',26),
  ('V-Saturn','V','Saturn','Primary',27),
  ('VI-Chanakya','VI','Chanakya','Middle',28),
  ('VI-Kabir','VI','Kabir','Middle',29),
  ('VI-Vivekananda','VI','Vivekananda','Middle',30),
  ('VII-Einstein','VII','Einstein','Middle',31),
  ('VII-Galileo','VII','Galileo','Middle',32),
  ('VII-Kalam','VII','Kalam','Middle',33),
  ('VII-Maxwell','VII','Maxwell','Middle',34),
  ('VIII-Darwin','VIII','Darwin','Middle',35),
  ('VIII-Hooke','VIII','Hooke','Middle',36),
  ('VIII-Watson','VIII','Watson','Middle',37),
  ('IX-Hutton','IX','Hutton','Senior',38),
  ('IX-Powell','IX','Powell','Senior',39),
  ('IX-Smith','IX','Smith','Senior',40),
  ('X-Aryabhata','X','Aryabhata','Senior',41),
  ('X-Newton','X','Newton','Senior',42),
  ('X-Ramanujam','X','Ramanujam','Senior',43),
  ('XI-Arts','XI','Arts','Senior',44),
  ('XI-Commerce','XI','Commerce','Senior',45),
  ('XI-Medical','XI','Medical','Senior',46),
  ('XI-N.Med','XI','N.Med','Senior',47),
  ('XII-Arts','XII','Arts','Senior',48),
  ('XII-Commerce','XII','Commerce','Senior',49),
  ('XII-Medical','XII','Medical','Senior',50),
  ('XII-Non-Medical','XII','Non-Medical','Senior',51)
on conflict (id) do nothing;
-- 4b. The 22 headings (same order as the SWOT sheet)
insert into public.swot_headings (code, name, sort_order, scale_note) values
  ('life_skills',     'Crucial Life Skills',                                   1,  'Max. Marks: 10 each area. Insert minimum 2 video links of the child exhibiting his/her skill per month. Remember not to repeat the videos.'),
  ('academic',        'ACADEMIC RECORD',                                       2,  'Weekly tests every week; Periodic Tests; Half Yearly (Sep); Revision Tests; Final Exam.'),
  ('spoken_english',  'Communication skill - Spoken English',                  3,  '1-4 Hesitant, fearful, memorised only, very limited, unclear, broken | 5-7 Moderate confidence, partial originality, adequate, mostly clear | 8-10 Fearless, confident, fully original thoughts, rich & age-appropriate, clear & logical, smooth & fluent'),
  ('values',          'Values ''Sanskaars''',                                  4,  'Emerging (1 - 3); Developing (4 - 6); Well-Established (7 - 10)'),
  ('public_speaking', 'Public Speaking',                                       5,  'Morning Assembly / Intra-class / Inter-house / Inter School / Functions / Celebrations'),
  ('personality',     'Personality',                                           6,  'Max. Marks: 10 each area'),
  ('manners',         'Manners, Etiquette inclusive - Dining Etiquette',       7,  'Needs Practice (1 - 3); Good (4 - 6); Brilliant Consistently (7 - 10)'),
  ('english_asl',     'English (ASL)',                                         8,  'Max. Marks: 10 each area'),
  ('mathematics',     'Mathematics',                                           9,  'Max. Marks: 10 each area'),
  ('science',         'Science',                                               10, 'Max. Marks: 10 each area'),
  ('hindi',           'Hindi',                                                 11, 'Max. Marks: 10 each area'),
  ('punjabi',         'Punjabi',                                               12, 'Max. Marks: 10 each area'),
  ('performing_arts', 'Performing Arts',                                       13, 'Max. Marks: 10'),
  ('gk',              'GK',                                                    14, 'Max. Marks: 10'),
  ('hidden_talent',   'Hidden Talent',                                         15, 'Class teachers in coordination with Music, Dance, Sports teachers to identify hidden talent. Insert 1 video link exhibiting child''s talent once in 2 months. Avoid repetition.'),
  ('music',           'Music',                                                 16, 'Beginner 1-2 | Developing 3-4 | Partial Mastery 5-6 | Mastery / Exemplary 7-10'),
  ('dance',           'Dance',                                                 17, 'Beginner 1-2 | Developing 3-4 | Partial Mastery 5-6 | Mastery / Exemplary 7-10'),
  ('art_craft',       'Art & Craft',                                           18, 'Beginner 1-2 | Developing 3-4 | Partial Mastery 5-6 | Mastery / Exemplary 7-10'),
  ('sports',          'Sports',                                                19, 'Beginner (1-2) | Inter-house (3-4) | Inter-School (5-6) | Zonals | District (6-7) | Nationals (8-9) | International (10)'),
  ('attendance',      'Attendance of the month',                               20, 'Days present / working days'),
  ('fee',             'Fee Status (Paid/Pending)',                             21, 'Quarterly/Monthly (Q/M)'),
  ('ptm',             'Parents Attendance in PTM (A - Absent/ P - Present)',   22, 'P - Present | A - Absent | NA - no PTM this month')
on conflict (code) do nothing;

-- 4c. Sub-types of every heading
insert into public.swot_items (heading_code, name, input_type, group_name, sort_order)
select h, n, t, g, o from (values
  ('life_skills','Communication','score10',null,1), ('life_skills','Critical Thinking','score10',null,2),
  ('life_skills','Reasoning','score10',null,3), ('life_skills','Analytical Ability','score10',null,4),
  ('life_skills','Problem Solving/Creativity','score10',null,5), ('life_skills','Collaboration','score10',null,6),
  ('life_skills','Powerpoint Presentation','score10',null,7),
  ('life_skills','Skill Video 1','video','Video links',8), ('life_skills','Skill Video 2','video','Video links',9),

  ('spoken_english','Confidence','score10',null,1), ('spoken_english','Expression','score10',null,2),
  ('spoken_english','Vocabulary','score10',null,3), ('spoken_english','Clarity','score10',null,4),
  ('spoken_english','Fluency','score10',null,5), ('spoken_english','Precision','score10',null,6),

  ('values','Gratitude','score10',null,1), ('values','Responsibility','score10',null,2),
  ('values','Integrity','score10',null,3), ('values','Empathy','score10',null,4), ('values','Compassion','score10',null,5),

  ('public_speaking','Content','score10',null,1), ('public_speaking','Coherence','score10',null,2),
  ('public_speaking','Confidence','score10',null,3), ('public_speaking','Pronunciation','score10',null,4),
  ('public_speaking','Modulation','score10',null,5), ('public_speaking','Expression','score10',null,6),
  ('public_speaking','Clarity','score10',null,7),

  ('personality','Body Language','score10',null,1), ('personality','Emotional Quotient','score10',null,2),
  ('personality','Social Quotient','score10',null,3), ('personality','Spiritual Quotient','score10',null,4),
  ('personality','Character/Caring/Compassionate','score10',null,5),

  ('manners','Speaks Politely & Gently','score10',null,1), ('manners','Discipline & self-control','score10',null,2),
  ('manners','Appropriate body language','score10',null,3), ('manners','Greeting Routine','score10',null,4),
  ('manners','Gratitude Routine - Grateful','score10',null,5),

  ('english_asl','Listening','score10',null,1), ('english_asl','Speaking','score10',null,2),
  ('english_asl','Reading','score10',null,3), ('english_asl','Writing','score10',null,4),
  ('english_asl','Recitation','score10',null,5), ('english_asl','Comprehension','score10',null,6),
  ('english_asl','Application of Grammar','score10',null,7), ('english_asl','Composition writing','score10',null,8),
  ('english_asl','Spellathon/Dictation','score10',null,9), ('english_asl','Questioning Skill','score10',null,10),
  ('english_asl','Extrapolation','score10',null,11), ('english_asl','Quiz','score10',null,12),
  ('english_asl','Project Work','score10',null,13), ('english_asl','Multidisciplinary Project - Art Integration','score10',null,14),

  ('mathematics','Formation of Numbers','score10',null,1), ('mathematics','Reasoning','score10',null,2),
  ('mathematics','Application in real life','score10',null,3), ('mathematics','Creativity','score10',null,4),
  ('mathematics','Data Handling','score10',null,5), ('mathematics','Measurement','score10',null,6),
  ('mathematics','Finding volume','score10',null,7), ('mathematics','Finding area','score10',null,8),
  ('mathematics','Budgeting for picnic/Excursion/farewell','score10',null,9), ('mathematics','Spatial thinking','score10',null,10),
  ('mathematics','Problem solving ability','score10',null,11), ('mathematics','Project Work','score10',null,12),

  ('science','Critical Thinking','score10',null,1), ('science','Questioning/Interrogative sentences','score10',null,2),
  ('science','Reasoning & logic','score10',null,3), ('science','Analytical ability','score10',null,4),
  ('science','Creativity/Innovation','score10',null,5), ('science','Research','score10',null,6),
  ('science','Case Study','score10',null,7), ('science','Multidisciplinary Project - Art Integration','score10',null,8),
  ('science','Quiz','score10',null,9),

  ('hindi','Listening','score10',null,1), ('hindi','Speaking','score10',null,2), ('hindi','Reading','score10',null,3),
  ('hindi','Dictation','score10',null,4), ('hindi','Application of Grammar','score10',null,5), ('hindi','Handwriting','score10',null,6),

  ('punjabi','Listening','score10',null,1), ('punjabi','Speaking','score10',null,2), ('punjabi','Reading','score10',null,3),
  ('punjabi','Dictation','score10',null,4), ('punjabi','Application of Grammar','score10',null,5), ('punjabi','Handwriting','score10',null,6),
  ('punjabi','Multidisciplinary Project - Art Integration','score10',null,7),

  ('performing_arts','Performing Arts','score10',null,1),
  ('gk','GK','score10',null,1),

  ('hidden_talent','Talent Video','video',null,1),

  ('music','Guitar','level10','Instrumental',1), ('music','Tabla','level10','Instrumental',2),
  ('music','Harmonium','level10','Instrumental',3), ('music','Casio','level10','Instrumental',4),
  ('music','Drums','level10','Instrumental',5), ('music','Kongo','level10','Instrumental',6),
  ('music','Vocal/Singing','level10',null,7),

  ('dance','Classical','level10',null,1), ('dance','Semi Classical','level10',null,2), ('dance','Folk Dance','level10',null,3),
  ('dance','Western','level10',null,4), ('dance','Hip-Hop','level10',null,5), ('dance','Salsa','level10',null,6),
  ('dance','Tap Dance','level10',null,7), ('dance','Break Dance','level10',null,8),

  ('art_craft','Sketching','level10',null,1), ('art_craft','Shading','level10',null,2), ('art_craft','Water Painting','level10',null,3),
  ('art_craft','Fabric Painting','level10',null,4), ('art_craft','Acrylic Painting','level10',null,5), ('art_craft','Folder Making','level10',null,6),
  ('art_craft','Jute Art','level10',null,7), ('art_craft','Button Hole','level10',null,8), ('art_craft','Cotton Art','level10',null,9),
  ('art_craft','Card Making','level10',null,10), ('art_craft','Flower Making','level10',null,11), ('art_craft','Stone Art/Paint','level10',null,12),
  ('art_craft','Tile Painting','level10',null,13), ('art_craft','Table Mat Making','level10',null,14), ('art_craft','Photo Frame','level10',null,15),
  ('art_craft','T-Shirt Paint','level10',null,16), ('art_craft','Jewellery making','level10',null,17), ('art_craft','Pot Painting','level10',null,18),

  ('sports','Basketball','sports',null,1), ('sports','Volleyball','sports',null,2), ('sports','Table Tennis','sports',null,3),
  ('sports','Throw Ball','sports',null,4), ('sports','Lawn Tennis','sports',null,5), ('sports','Badminton','sports',null,6),
  ('sports','Athletics','sports',null,7), ('sports','Long Jump','sports',null,8), ('sports','Races','sports',null,9),
  ('sports','High Jump','sports',null,10), ('sports','Javelin Throw','sports',null,11), ('sports','Discus Throw','sports',null,12),
  ('sports','Shot-put','sports',null,13), ('sports','Swimming','sports',null,14), ('sports','Cycling','sports',null,15),
  ('sports','Weight Lifting','sports',null,16), ('sports','Fencing','sports',null,17), ('sports','Wushu','sports',null,18),
  ('sports','Cricket','sports',null,19), ('sports','Judo','sports',null,20), ('sports','Archery','sports',null,21),
  ('sports','Hockey','sports',null,22), ('sports','Shooting','sports',null,23), ('sports','Gymnastics','sports',null,24),
  ('sports','Running','sports',null,25),

  ('attendance','Attendance','attendance',null,1),
  ('fee','Quarterly/Monthly (Q/M)','fee',null,1),
  ('ptm','PTM','ptm',null,1)
) v(h, n, t, g, o)
on conflict (heading_code, name) do nothing;

-- 4d. Subjects for the ACADEMIC RECORD (add more in Admin Panel > Masters)
insert into public.subjects (name, grade_based, sort_order) values
  ('English', false, 1), ('Punjabi', false, 2), ('General Science', false, 3), ('Hindi', false, 4),
  ('Math', false, 5), ('Computer/IT', true, 6), ('Social Science', false, 7),
  ('Physics', false, 10), ('Chemistry', false, 11), ('Biology', false, 12),
  ('Accountancy', false, 13), ('Business Studies', false, 14), ('Economics', false, 15),
  ('Political Science', false, 16), ('History', false, 17), ('Geography', false, 18),
  ('Physical Education', false, 19)
on conflict (name) do nothing;



-- ---------------------------------------------------------------------
-- 5. REPORT FUNCTIONS (average marks per class / per student for a period)
-- ---------------------------------------------------------------------
create or replace function public.swot_avg(p_from date, p_to date, p_class text default null)
returns table (class_id text, student_id uuid, heading_code text,
               avg_score numeric, att_pct numeric, achieved numeric, planned numeric, entries bigint)
language sql stable security definer set search_path = public as $$
  with v as (
    select v.class_id, v.student_id, v.value_num, v.value_num2, i.heading_code, i.input_type,
           make_date(substr(v.session,1,4)::int + case when v.month < 4 then 1 else 0 end, v.month, 1) as d
      from swot_values v join swot_items i on i.id = v.item_id
     where (p_class is null or v.class_id = p_class) and can_access_class(v.class_id)
  )
  select v.class_id, case when p_class is null then null else v.student_id end, v.heading_code,
         round(avg(v.value_num) filter (where v.input_type in ('score10','level10')), 2),
         round(100 * sum(v.value_num) filter (where v.input_type = 'attendance')
               / nullif(sum(v.value_num2) filter (where v.input_type = 'attendance'), 0), 1),
         null::numeric, null::numeric, count(*)
    from v
   where v.d between date_trunc('month', p_from)::date and p_to
   group by 1, 2, 3
  union all
  select t.class_id, case when p_class is null then null else m.student_id end, 'academic',
         round(100 * sum(m.marks) / nullif(sum(t.max_marks), 0), 1), null,
         sum(m.marks), sum(t.max_marks), count(*)
    from academic_marks m join academic_tests t on t.id = m.test_id
   where m.marks is not null and t.max_marks > 0
     and t.test_date between p_from and p_to
     and (p_class is null or t.class_id = p_class) and can_access_class(t.class_id)
   group by 1, 2;
$$;

-- Remove duplicate subject names left from the first trial version (only if never used)
delete from public.subjects s
 where s.name in ('Mathematics', 'Computer / IT')
   and not exists (select 1 from public.academic_tests t where t.subject_id = s.id);

-- Done. You should see: "Success. No rows returned"
