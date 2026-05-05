-- ProChefDesk migration: cascade soft-delete triggers for workspace_tombstones
-- Adds 4 functions + 2 triggers that implement cascade soft-delete and
-- restore when workspace_tombstones rows are inserted or deleted.
--
-- PATTERN
-- A row in workspace_tombstones acts as the "delete switch" for an entire
-- workspace. INSERT cascades deleted_at to workspaces + 16 ws-scoped tables.
-- DELETE (rare — only triggered by Trash UI restore) reverses it.
--
--   INSERT workspace_tombstones
--     -> trg_cascade_workspace_tombstone (trigger)
--       -> trg_cascade_workspace_tombstone() (wrapper)
--         -> cascade_soft_delete_workspace_data(ws_id, user_id, deleted_at)
--           -> workspaces.deleted_at SET
--           -> 16 ws-scoped tables: deleted_at SET WHERE workspace_id = $1
--
--   DELETE workspace_tombstones
--     -> trg_reverse_cascade_workspace_tombstone (trigger)
--       -> trg_reverse_cascade_workspace_tombstone() (wrapper)
--         -> cascade_restore_workspace_data(ws_id, user_id)
--           -> workspaces.deleted_at = NULL
--           -> 16 ws-scoped tables: deleted_at = NULL WHERE workspace_id = $1
--
-- 16 WS-SCOPED TABLES
--   recipes, ingredients, menus, events, suppliers,
--   canvases, shopping_lists, checklist_templates, inventory,
--   waste, checklist_sessions, stock_count_history,
--   haccp_logs, haccp_units, haccp_readings, haccp_cook_cool
--
-- IDEMPOTENT
--   CREATE OR REPLACE on functions, DROP IF EXISTS + CREATE on triggers.
--   Safe to re-run on any environment.
--
-- DEPENDENCIES
--   inventory.deleted_at column (added in v2.6.98-inventory-deleted-at.sql).
--   pg_cron job pcd-cleanup-old-deleted (v2.6.97-cleanup-cron.sql) physically
--   removes rows with deleted_at < NOW() - 30 days.

-- ============================================================
-- 1. Data function: cascade soft-delete
-- ============================================================
CREATE OR REPLACE FUNCTION public.cascade_soft_delete_workspace_data(
  p_workspace_id text,
  p_user_id uuid,
  p_deleted_at timestamp with time zone
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
  -- Mark the parent workspace as deleted (only if not already)
  UPDATE workspaces
  SET deleted_at = p_deleted_at, updated_at = NOW()
  WHERE id = p_workspace_id
    AND user_id = p_user_id
    AND deleted_at IS NULL;

  -- Cascade to every ws-scoped child table
  FOREACH t IN ARRAY ws_tables LOOP
    EXECUTE format(
      'UPDATE %I SET deleted_at = $1, updated_at = NOW()
       WHERE workspace_id = $2 AND user_id = $3 AND deleted_at IS NULL',
      t
    ) USING p_deleted_at, p_workspace_id, p_user_id;
  END LOOP;
END;
$function$;

-- ============================================================
-- 2. Data function: cascade restore (un-delete)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cascade_restore_workspace_data(
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
  -- Restore the parent workspace
  UPDATE workspaces
  SET deleted_at = NULL, updated_at = NOW()
  WHERE id = p_workspace_id
    AND user_id = p_user_id
    AND deleted_at IS NOT NULL;

  -- Restore every ws-scoped child row
  FOREACH t IN ARRAY ws_tables LOOP
    EXECUTE format(
      'UPDATE %I SET deleted_at = NULL, updated_at = NOW()
       WHERE workspace_id = $1 AND user_id = $2 AND deleted_at IS NOT NULL',
      t
    ) USING p_workspace_id, p_user_id;
  END LOOP;
END;
$function$;

-- ============================================================
-- 3. Trigger wrapper: cascade soft-delete (AFTER INSERT)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_cascade_workspace_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public.cascade_soft_delete_workspace_data(
    NEW.workspace_id, NEW.user_id, NEW.deleted_at
  );
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 4. Trigger wrapper: cascade restore (AFTER DELETE)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_reverse_cascade_workspace_tombstone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  PERFORM public.cascade_restore_workspace_data(
    OLD.workspace_id, OLD.user_id
  );
  RETURN OLD;
END;
$function$;

-- ============================================================
-- 5. Triggers on workspace_tombstones
-- ============================================================
-- INSERT trigger: fires when a workspace is soft-deleted via the Trash flow
DROP TRIGGER IF EXISTS trg_cascade_workspace_tombstone ON public.workspace_tombstones;
CREATE TRIGGER trg_cascade_workspace_tombstone
  AFTER INSERT ON public.workspace_tombstones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_cascade_workspace_tombstone();

-- DELETE trigger: fires when a tombstone is removed (Trash UI "Restore")
DROP TRIGGER IF EXISTS trg_reverse_cascade_workspace_tombstone ON public.workspace_tombstones;
CREATE TRIGGER trg_reverse_cascade_workspace_tombstone
  AFTER DELETE ON public.workspace_tombstones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reverse_cascade_workspace_tombstone();
