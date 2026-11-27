# Learn Inline Block Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the JSON textarea on Learn pages with Notion-style inline editors for all 6 block types, plus drag-to-reorder.

**Architecture:** There is one editor component per block type and one `BlockEditor` dispatcher. `EditableBlockRow` becomes a sortable shell (grip + trash) around the editor. LearnPage wraps the edited list in a dnd-kit `SortableContext`. In direct mode it persists the new order with `reorderLearningBlocks`; in suggestion mode it reorders the local draft. The `content` shapes stay unchanged.

**Tech Stack:** React 19, TS, Tailwind v4, @dnd-kit/core + @dnd-kit/sortable (already installed), lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-27-learn-block-editor-design.md`

## Global Constraints

- **Do not commit or create branches.**
- There is no test framework. Verify with `npx tsc -b` (exit 0) and `npx eslint <changed files>` (clean) in `apps/web`.
- `content` shapes stay exactly as they are:
  - heading `{level:1|2|3,text}`
  - text `{text}`
  - callout `{tone:'tip'|'warning'|'note',text}`
  - resource_list `{items:[{title,url,description}]}`
  - checklist `{items:[{text,done}]}`
  - flashcards `{cards:[{front,back}]}`
- Text inputs save on blur. Toggles and row add/remove save immediately. Empty rows are kept while editing; renderers skip empty items.
- UI copy is in English.

## Review Focus

1. **Typing, then clicking another block's grip or trash before blur.** The text must not be lost: a blur fires before the click, so save on blur. Use local state per editor, seeded from `content` once.
2. **Suggestion mode.** Reordering and editing change only `draftBlocks`. Nothing is written to the DB until Submit.
3. **A direct-mode reorder fails** (RLS/network). Restore the previous order and show nothing broken (`alert` is acceptable, matching the page's existing error handling).
4. **An invalid URL in Resources** is kept as typed (no data loss) but marked red, and the renderer already ignores unsafe URLs. Check `ResourceListBlock` uses `normalizeUrl` for the href.
5. **Old blocks with the template text** "Section heading" / "Helpful tip…" still render and edit normally.

---

### Task 1: Editors

**Files (create in `apps/web/src/components/learn/editors/`):**
- `HeadingEditor.tsx`, `TextEditor.tsx`, `CalloutEditor.tsx`, `ResourceListEditor.tsx`, `ChecklistEditor.tsx`, `FlashcardsEditor.tsx`
- `BlockEditor.tsx`: `BlockEditor({ type, content, onChange, autoFocus }: { type: BlockType; content: Record<string, unknown>; onChange: (c: Record<string, unknown>) => void; autoFocus?: boolean })`, a switch over `type`.
- `AutoTextarea.tsx`: a textarea that grows with its content. It resizes to `scrollHeight` on input and on mount through a ref callback.

**Interfaces – Produces:** `BlockEditor` (above). Every editor takes `{ content, onChange, autoFocus? }`.

- [ ] Implement the editors per the spec:
  - Heading: H1/H2/H3 segmented control, input styled like the renderer sizes.
  - Callout: dark pill with tone buttons Tip/Warning/Note.
  - Checklist: Enter adds a row below and focuses it; Backspace in an empty row deletes it and focuses the previous one.
  - Resources: an invalid URL gets a red border via `normalizeUrl`.
  - Flashcards: Front/Back pairs.
  - Placeholders: "Heading", "Write something…", "Tip, warning or note…", "Title", "https://…", "Short description (optional)", "Step", "Front", "Back".
- [ ] `npx tsc -b`, then `npx eslint src/components/learn/editors`.

### Task 2: Row shell, reorder, templates, renderers

**Files:**
- Modify `apps/web/src/components/learn/EditableBlockRow.tsx`. Props become `{ block, onChange, onDelete, autoFocus }`. It uses `useSortable({ id: block.id })`, shows a grip and a trash button on hover, and renders `<BlockEditor>`. The JSON textarea is removed.
- Modify `apps/web/src/pages/LearnPage.tsx`:
  - `BLOCK_TEMPLATES` uses empty values (`heading {level:2,text:''}`, `callout {tone:'tip',text:''}`; the others are unchanged).
  - Add state `autoFocusId`, set to the new block's id when one is added.
  - Wrap the edited list in `DndContext` (PointerSensor, distance 4, `closestCenter`) and `SortableContext` (`verticalListSortingStrategy`).
  - `onDragEnd`:
    - direct: `arrayMove` on `data.blocks`, `setData`, then `reorderLearningBlocks(data.page.id, ids)`. On error, revert and `alert('Could not save the order.')`.
    - suggestion: `setDraftBlocks(arrayMove(...))`.
- Modify the renderers so they skip empty items:
  - `ChecklistBlock`: items without text.
  - `ResourceListBlock`: items without a url and a title. Use `normalizeUrl` for the href.
  - `FlashcardsBlock`: cards where both sides are empty.
  - `HeadingBlock`, `TextBlock`, `CalloutBlock`: return null when the text is empty.
- [ ] `npx tsc -b`, then `npx eslint src/pages/LearnPage.tsx src/components/learn`. Expect only the pre-existing LevelUpPage errors.

### Task 3: Learning note

- [ ] Write `docs/learning/22-learn-editor-bloku.md` in Czech. Cover only what is new:
  - `@dnd-kit/sortable` vs the hand-made drop zones in note 20
  - local state + save on blur
  - keyboard handling in a list (Enter/Backspace + focus via refs)
  - the auto-growing textarea
  - optimistic reorder with rollback
