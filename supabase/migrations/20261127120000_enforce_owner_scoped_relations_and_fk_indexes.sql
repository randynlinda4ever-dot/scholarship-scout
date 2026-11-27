-- Prevent authenticated users from attaching their own rows to another
-- account's scholarship/source records. The subqueries run under the caller's
-- RLS policies, so only rows owned by auth.uid() can satisfy the checks.

DROP POLICY IF EXISTS "Users manage their own scholarships" ON public.scholarships;
CREATE POLICY "Users manage their own scholarships"
  ON public.scholarships
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND (
      source_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.scholarship_sources AS source
        WHERE source.id = source_id
          AND source.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users manage their own eligibility checks" ON public.eligibility_checks;
CREATE POLICY "Users manage their own eligibility checks"
  ON public.eligibility_checks
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.scholarships AS scholarship
      WHERE scholarship.id = scholarship_id
        AND scholarship.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.scholarships AS scholarship
      WHERE scholarship.id = scholarship_id
        AND scholarship.owner_id = auth.uid()
    )
  );

-- Support source and scholarship cascade/set-null checks as these tables grow.
CREATE INDEX IF NOT EXISTS scholarships_source_id_idx
  ON public.scholarships (source_id);

CREATE INDEX IF NOT EXISTS eligibility_checks_scholarship_id_idx
  ON public.eligibility_checks (scholarship_id);
