BEGIN;

-- RLS controls row eligibility. This trigger provides the column-level guard:
-- QA-level users can update product_codes rows only when verified is the sole
-- client-changed field. Admins keep full update access.
CREATE OR REPLACE FUNCTION public.enforce_product_codes_verified_only_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_level int := public.current_user_hierarchy_level();
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF actor_level >= 80 THEN
    RETURN NEW;
  END IF;

  IF actor_level >= 50
     AND (to_jsonb(NEW) - 'verified') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'verified') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'QA users can only update product_codes.verified'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS aaa_enforce_product_codes_verified_only_update ON public.product_codes;
CREATE TRIGGER aaa_enforce_product_codes_verified_only_update
  BEFORE UPDATE ON public.product_codes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_codes_verified_only_update();

DROP POLICY IF EXISTS "QA can toggle verified field only" ON public.product_codes;

CREATE POLICY "QA can toggle verified field only"
  ON public.product_codes FOR UPDATE
  TO authenticated
  USING (
    public.current_user_hierarchy_level() >= 50
    AND public.current_user_hierarchy_level() < 80
  )
  WITH CHECK (
    public.current_user_hierarchy_level() >= 50
    AND public.current_user_hierarchy_level() < 80
  );

COMMIT;
