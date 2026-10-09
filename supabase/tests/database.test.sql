begin;
select plan(12);

select has_table('public','planned_blocks','planned_blocks exists');
select has_table('public','transactions','transactions exists');
select has_view('public','v_daily_activity_summary','daily report exists');
select has_view('public','v_budget_progress','budget report exists');
select has_index('public','time_sessions','one_open_session_per_user','open session index exists');
select col_type_is('public','transactions','amount','numeric(16,2)','money keeps decimal precision');
select col_not_null('public','planned_blocks','starts_at','block start required');
select col_has_default('public','planned_blocks','id','client or server can create UUID');
select policies_are('public','transactions',array['own_transactions'],'transactions has ownership policy');
select policies_are('public','planned_blocks',array['own_planned_blocks'],'blocks have ownership policy');
select triggers_are('public','transactions',array['audit_transactions','locked_transaction','set_metadata','transactions_owner'],'financial triggers installed');
select triggers_are('public','planned_blocks',array['block_transition','blocks_owner','set_metadata'],'block triggers installed');

select * from finish();
rollback;
