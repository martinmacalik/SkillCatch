# Next session — restructure form + admin delete preview

## What's done
- `RestructureForm.tsx` — fully rewritten:
  - `deleted?: boolean` on `BuilderNode`
  - **Load branch children** button (violet dashed): pick any node → auto-loads all direct children as pre-populated builder nodes
  - **Trash icon** on each node → marks it `deleted: true` (red strikethrough, "undo" button to reverse)
  - `serialize()` outputs `{ deleted: true }` for deleted nodes, no children/newNodes
  - Always submits as `'move'` proposal type (simpler, consistent)
  - `isRoot` prop on `TreeItem` hides the X button on the root so user can't accidentally empty the tree
- Migration `20260417001_rpc_move_support.sql` — handles `rename`, `new nodes`, `path` fix, `is_leaf` fix

## What still needs to be done

### 1. HelpPage (`apps/web/src/pages/HelpPage.tsx`)
Update the `SkillFeedbackLink` component to explain:
- **Child vs sibling**: clicking "+ Add child" on a node creates a child OF that node. To add a sibling, use "Add sibling" at the root level or "Load branch children" on the parent.
- **Load branch**: picks a parent branch → shows all its children so you can bulk-rename, delete, or add siblings.
- **Delete**: trash icon marks a node for deletion (cascade-deletes all descendants on approval).

### 2. ProposalDiff (`apps/admin/src/components/ProposalDiff.tsx`)
- Add `deleted?: boolean` to `TreeNode` interface
- `TreeDiffNode`: show deleted nodes with red strikethrough + `DELETE` label (rose colour, similar to amber for rename)
- `hasAnyChange`: return true if `node.deleted`
- Add legend entry for "delete" (rose colour)
- **Cascade preview**: 
  - `collectDeletedIds(tree)` — walk tree, collect IDs of nodes with `deleted: true`
  - `useEffect` → for each deleted ID call `supabase.rpc('get_node_descendants', { p_node_id: id })`
  - Import supabase from `../lib/supabaseClient`
  - Render a rose warning box listing all descendant names that will also be deleted

### 3. Migration (`supabase/migrations/20260417001_rpc_move_support.sql`)
Add two things and re-run in Supabase SQL editor:

**a) `get_node_descendants` RPC** (for admin cascade preview):
```sql
CREATE OR REPLACE FUNCTION get_node_descendants(p_node_id uuid)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT sn2.id, sn2.name
  FROM skill_nodes sn1
  JOIN skill_nodes sn2 ON sn2.path <@ sn1.path AND sn2.id != sn1.id
  WHERE sn1.id = p_node_id
  ORDER BY sn2.path;
$$;
```

**b) Delete handling in `_apply_move_tree`** — add this block at the TOP of the loop (before the rename check):
```sql
-- Delete node + all descendants if marked deleted
IF (v_node->>'deleted') = 'true' THEN
  DELETE FROM user_skill_attributes
    WHERE skill_node_id IN (SELECT sn.id FROM skill_nodes sn JOIN skill_nodes p ON sn.path <@ p.path WHERE p.id = v_node_id);
  DELETE FROM user_skills
    WHERE skill_node_id IN (SELECT sn.id FROM skill_nodes sn JOIN skill_nodes p ON sn.path <@ p.path WHERE p.id = v_node_id);
  DELETE FROM teaching_offers
    WHERE skill_node_id IN (SELECT sn.id FROM skill_nodes sn JOIN skill_nodes p ON sn.path <@ p.path WHERE p.id = v_node_id);
  DELETE FROM skill_resources
    WHERE skill_node_id IN (SELECT sn.id FROM skill_nodes sn JOIN skill_nodes p ON sn.path <@ p.path WHERE p.id = v_node_id);
  DELETE FROM skill_stats
    WHERE skill_node_id IN (SELECT sn.id FROM skill_nodes sn JOIN skill_nodes p ON sn.path <@ p.path WHERE p.id = v_node_id);
  DELETE FROM skill_attribute_defs
    WHERE skill_node_id IN (SELECT sn.id FROM skill_nodes sn JOIN skill_nodes p ON sn.path <@ p.path WHERE p.id = v_node_id);
  DELETE FROM skill_node_parents
    WHERE child_node_id IN (SELECT sn.id FROM skill_nodes sn JOIN skill_nodes p ON sn.path <@ p.path WHERE p.id = v_node_id)
       OR parent_node_id IN (SELECT sn.id FROM skill_nodes sn JOIN skill_nodes p ON sn.path <@ p.path WHERE p.id = v_node_id);
  DELETE FROM skill_nodes
    WHERE path <@ (SELECT path FROM skill_nodes WHERE id = v_node_id);
  CONTINUE;
END IF;
```

Note: `CONTINUE` skips the rest of the loop iteration (no rename/newNodes for deleted nodes).
The `skill_attribute_defs` table may not cascade cleanly — check if it has child rows in `user_skill_attributes` that need deleting first (the order above handles this).

### 4. Validation (`apps/admin-api/src/validation/proposal.ts`)
No change needed — `'move'` type already accepts `notes` field and handles all compound operations.

## How the full flow works after all changes

1. User opens skill feedback builder
2. Clicks **Load branch children** → searches for e.g. "Writing & Storytelling" → form auto-populates all its children
3. User can:
   - Rename any child (right panel input turns indigo)
   - Trash-icon any child → marked for deletion (red strikethrough)
   - Click "+ leaf" or "+ branch" on any node in right panel → add new siblings
4. User submits → creates a `'move'` proposal with `changes.notes` = serialized tree JSON
5. Admin sees the proposal diff:
   - Renames shown in amber
   - New nodes in emerald
   - Deleted nodes in rose with cascade count ("also deletes N descendants")
6. Admin approves → RPC atomically applies all changes and marks request approved
