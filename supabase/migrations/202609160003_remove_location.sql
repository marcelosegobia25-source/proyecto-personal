-- Retira la funcionalidad de ubicación de bases ya desplegadas.
drop table if exists public.automated_expenses cascade;
drop table if exists public.activity_commute_charges cascade;
drop table if exists public.activity_commute_settings cascade;
drop table if exists public.activity_locations cascade;
drop table if exists public.block_arrivals cascade;
drop table if exists public.place_events cascade;
drop table if exists public.location_automation_rules cascade;
drop table if exists public.location_state cascade;
drop table if exists public.places cascade;
drop type if exists public.place_event_type cascade;
