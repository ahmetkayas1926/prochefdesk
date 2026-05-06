-- ProChefDesk migration: pcd_purge_workspace function
-- Permanently and atomically deletes a single workspace and all its data.
--
-- USED BY
--   Frontend Trash UI's "Delete forever" button (v2.7.6 frontend).
--   Called via supabase.rpc('pcd_purge_workspace', {p_workspace_id, p_user_id}).
--
-- BEHAVIOR
--   1. DELETE rows from 16 ws-scoped tables WHERE workspace_id = ws AND user_id = u.
--   2. DELETE row from workspaces WHERE id = ws AND user_id = u.
--   3. DELETE row from workspace_tombstones WHERE workspace_id = ws AND user_id = u.
--      Step 3 fires trg_reverse_cascade_workspace_tombstone (AFTER DELETE) which
--      in turn calls cascade_restore_workspace_data — a no-op here because steps
--      1 and 2 have already removed the target rows (the cascade restore's
--      WHERE deleted_at IS NOT NULL filter matches 0 rows). The trigger overhead
--      is ~17 empty UPDATEs (~1ms), accepted for code simplicity over disabling
--      the trigger inline.
--
-- WHY A FUNCTION INSTEAD OF FRONTEND DELETES
--   18 separate DELETE round trips from frontend would not be atomic. Network
--   interruption mid-purge could leave partial state (some tables purged, others
--   not — orphan recipes pointing to deleted workspace). A SECURITY DEFINER
--   function runs inside a single transaction: all-or-nothing.
--
-- SECURITY
--   SECURITY DEFINER + explicit user_id WHERE clause. RLS would block direct
--   table access in some configurations but the function bypasses RLS by design.
--   The user_id parameter must match the authenticated user's id (caller's
--   responsibility — frontend supplies auth.uid() before calling).
--
-- IDEMPOTENT
--   CREATE OR REPLACE — safe to re-run.

CREATE OR REPLACE FUNCTION public.pcd_purge_workspace(
  p_workspace_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  ws_tables text[] := ARRAY[
    'recipes', 'ingredients', 'menus', 'events', 'suppliers',
    'canvases', 'shopping_lists', 'checklist_templates', 'inventory',
    'waste', 'checklist_sessions', 'stock_count_history',
    'haccp_logs', 'haccp_units', 'haccp_readings', 'haccp_cook_cool'
  ];
  t text;
BEGIN
  -- 1) Delete all rows from 16 ws-scoped tables
  FOREACH t IN ARRAY ws_tables LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE workspace_id = $1 AND user_id = $2',
      t
    ) USING p_workspace_id, p_user_id;
  END LOOP;

  -- 2) Delete the workspace meta row
  DELETE FROM workspaces
  WHERE id = p_workspace_id AND user_id = p_user_id;

  -- 3) Delete the tombstone (reverse cascade trigger fires, but target rows
  --    are already gone — no-op UPDATEs)
  DELETE FROM workspace_tombstones
  WHERE workspace_id = p_workspace_id AND user_id = p_user_id;
END;
$function$;
