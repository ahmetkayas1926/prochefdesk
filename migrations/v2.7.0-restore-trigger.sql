-- =====================================================
-- v2.7.0 — Workspace restore trigger (reverse cascade)
-- =====================================================
-- A5 trigger (v2.6.99-cascade-trigger.sql) workspace_tombstones'a
-- INSERT olunca 16 tablo + workspaces'i soft-delete yapar.
-- Bu sürümde tersi: workspace_tombstones'tan DELETE olunca
-- (UNDO toast'a basıldığında frontend tombstone'u siler) tüm
-- soft-deleted veri restore edilir (deleted_at = NULL).
--
-- Frontend akışı:
--   1) Kullanıcı workspace siler → tombstone INSERT → cascade soft-delete
--   2) Toast 5sn UNDO penceresi gösterir
--   3) Kullanıcı UNDO'ya basarsa frontend tombstone'u DELETE eder
--   4) Bu trigger çalışır → tüm veri restore (deleted_at = NULL)
--   5) Frontend reload yapar → cloud'dan diri veri pull edilir

-- 1) Reverse cascade function (idempotent: zaten NULL olanları atlar)
CREATE OR REPLACE FUNCTION public.cascade_restore_workspace_data(
  p_workspace_id text,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  ws_tables text[] := ARRAY[
    'recipes', 'ingredients', 'menus', 'events', 'suppliers',
    'canvases', 'shopping_lists', 'checklist_templates', 'inventory',
    'waste', 'checklist_sessions', 'stock_count_history',
    'haccp_logs', 'haccp_units', 'haccp_readings', 'haccp_cook_cool'
  ];
  t text;
BEGIN
  -- workspaces.deleted_at NULL
  UPDATE workspaces
  SET deleted_at = NULL, updated_at = NOW()
  WHERE id = p_workspace_id
    AND user_id = p_user_id
    AND deleted_at IS NOT NULL;

  -- 16 ws-scoped tables
  FOREACH t IN ARRAY ws_tables LOOP
    EXECUTE format(
      'UPDATE %I SET deleted_at = NULL, updated_at = NOW()
       WHERE workspace_id = $1 AND user_id = $2 AND deleted_at IS NOT NULL',
      t
    ) USING p_workspace_id, p_user_id;
  END LOOP;
END;
$$;

-- 2) Trigger function for DELETE on workspace_tombstones
CREATE OR REPLACE FUNCTION public.trg_reverse_cascade_workspace_tombstone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.cascade_restore_workspace_data(
    OLD.workspace_id, OLD.user_id
  );
  RETURN OLD;
END;
$$;

-- 3) Trigger
DROP TRIGGER IF EXISTS trg_reverse_cascade_workspace_tombstone ON workspace_tombstones;
CREATE TRIGGER trg_reverse_cascade_workspace_tombstone
  AFTER DELETE ON workspace_tombstones
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_reverse_cascade_workspace_tombstone();
