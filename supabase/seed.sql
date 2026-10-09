-- Datos ficticios. Contraseña del usuario demo: Demo1234!
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change
) values (
  '00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000001',
  'authenticated','authenticated','demo@gestion.local',crypt('Demo1234!',gen_salt('bf')),now(),
  now(),now(),'','','',''
) on conflict(id) do nothing;

insert into public.profiles(user_id,display_name) values
('10000000-0000-0000-0000-000000000001','Usuario Demo');

insert into public.activity_categories(id,user_id,name,kind,color,icon) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Estudio','study','#2563EB','book'),
('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Entrenamiento','training','#16A34A','dumbbell'),
('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Personal','personal','#9333EA','user');

insert into public.activities(id,user_id,category_id,title,default_duration_minutes,default_reminder_minutes) values
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Estudiar matemáticas',90,15),
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','Entrenamiento de fuerza',60,30),
('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','Revisión del día',15,10);

insert into public.activity_schedules(id,user_id,activity_id,rrule,local_start_time,timezone,duration_minutes,starts_on) values
('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR','18:00','America/La_Paz',90,'2026-09-01'),
('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','FREQ=WEEKLY;BYDAY=MO,WE,FR','07:00','America/La_Paz',60,'2026-09-01');

insert into public.planned_blocks(id,user_id,activity_id,schedule_id,starts_at,ends_at,status) values
('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','2026-09-07 22:00Z','2026-09-07 23:30Z','completed'),
('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','2026-09-09 11:00Z','2026-09-09 12:00Z','planned'),
('50000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','2026-09-08 22:00Z','2026-09-08 23:30Z','partial');

insert into public.time_sessions(id,user_id,activity_id,planned_block_id,started_at,ended_at) values
('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','2026-09-07 22:03Z','2026-09-07 23:25Z'),
('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','2026-09-08 22:10Z','2026-09-08 23:00Z');

insert into public.activity_verifications(id,user_id,planned_block_id,result,completion_percent,reason) values
('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','completed',100,null),
('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','partial',60,'Interrupción familiar');

insert into public.accounts(id,user_id,name,account_type,currency_code,opening_balance) values
('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Efectivo','cash','BOB',500),
('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Cuenta bancaria','bank','BOB',3200);

insert into public.financial_categories(id,user_id,name,kind,color) values
('90000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Alimentación','expense','#EA580C'),
('90000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Transporte','expense','#0891B2'),
('90000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Salario','income','#16A34A');

insert into public.transactions(id,user_id,account_id,category_id,kind,amount,currency_code,occurred_at,merchant,note) values
('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000003','income',3500,'BOB','2026-09-01 13:00Z','Empleador','Ingreso mensual'),
('a0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','expense',28.50,'BOB','2026-09-07 16:30Z','Mercado','Almuerzo'),
('a0000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','expense',12,'BOB','2026-09-08 12:00Z','Minibús',null);

insert into public.budgets(id,user_id,category_id,period_start,period_end,amount,currency_code) values
('b0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','2026-09-01','2026-09-30',700,'BOB'),
('b0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','2026-09-01','2026-09-30',300,'BOB');

insert into public.goals(id,user_id,title,metric,target_value,period,starts_on) values
('c0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Estudiar 10 horas por semana','study_minutes',600,'weekly','2026-09-01'),
('c0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Entrenar tres veces por semana','completed_sessions',3,'weekly','2026-09-01');

insert into public.daily_reflections(id,user_id,local_date,energy,mood,note) values
('d0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-09-07',4,4,'Buen ritmo de estudio.'),
('d0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','2026-09-08',3,3,'Hubo una interrupción, conviene dejar margen.');

insert into public.reminders(id,user_id,planned_block_id,channel,remind_at,title,body) values
('e0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','local','2026-09-09 10:30Z','Entrenamiento en 30 minutos','Prepara tu rutina de fuerza');

-- Cuatro semanas adicionales para que los informes tengan patrones reales.
with days as (
  select d::date day, row_number() over(order by d) n
  from generate_series('2026-08-10'::date,'2026-09-04'::date,'1 day') d
  where extract(isodow from d) between 1 and 5
)
insert into public.planned_blocks(id,user_id,activity_id,schedule_id,starts_at,ends_at,status)
select md5('study-block-'||day)::uuid,'10000000-0000-0000-0000-000000000001',
 '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
 (day::timestamp+time '18:00') at time zone 'America/La_Paz',
 (day::timestamp+time '19:30') at time zone 'America/La_Paz',
 case when n%7=0 then 'skipped'::public.block_status when n%4=0 then 'partial'::public.block_status else 'completed'::public.block_status end
from days;

with blocks as (
 select id,user_id,activity_id,starts_at,status,row_number() over(order by starts_at) n
 from public.planned_blocks where starts_at>='2026-08-10' and starts_at<'2026-09-05'
)
insert into public.time_sessions(id,user_id,activity_id,planned_block_id,started_at,ended_at)
select md5('study-session-'||id)::uuid,user_id,activity_id,id,starts_at+interval '5 minutes',
 starts_at+case when status='partial' then interval '50 minutes' else interval '85 minutes' end
from blocks where status<>'skipped';

with blocks as (
 select id,user_id,status from public.planned_blocks where starts_at>='2026-08-10' and starts_at<'2026-09-05'
)
insert into public.activity_verifications(id,user_id,planned_block_id,result,completion_percent,reason)
select md5('verification-'||id)::uuid,user_id,id,
 case status when 'completed' then 'completed'::public.verification_result when 'partial' then 'partial'::public.verification_result else 'skipped'::public.verification_result end,
 case status when 'completed' then 100 when 'partial' then 55 else 0 end,
 case when status='skipped' then 'Imprevisto registrado' end from blocks;

insert into public.transactions(id,user_id,account_id,category_id,kind,amount,currency_code,occurred_at,merchant,note)
select md5('food-'||d)::uuid,'10000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001',
 '90000000-0000-0000-0000-000000000001','expense',18+(extract(day from d)::integer%5)*3,'BOB',
 d+time '12:30','Comercio demo','Dato histórico generado'
from generate_series('2026-08-10'::date,'2026-09-04'::date,'2 days') d;
