# Components

All files are in `src/components/`. `App.tsx` holds the state and passes it down as props. Types are in [data model](data-model.md). Data flow is in [architecture](architecture.md).

## App (`src/App.tsx`)

- Holds one `Session`: origin, source, raster stage, edits and output.
- `open()` loads a sample or file, runs `rasterStage()` then `finish()`, and sets a status line.
- `applyEdits()` runs `finish()` after a label edit, and `rasterStage()` first when the drawing changes.
- Draws the page sections: picker, result with the Compare and Edit switch, rule report, key and export, AI step.
- Draws the first sample when the page opens.

## SourcePicker

Lets the teacher pick one of four samples or drop or choose a PNG, JPG or SVG file.

- `activeSample: string | null`: id of the sample on screen.
- `busy: boolean`: disables input while the pipeline runs.
- `error: string | null`: load error message to show.
- `onSample(id)`: the teacher picked a sample.
- `onFile(file)`: the teacher chose or dropped a file.

## Workbench

Shows the original and the tactile draft. Exports the type `WorkbenchMode` (`'compare' | 'edit'`).

- `source: LoadedSource`: the original picture and its frame.
- `output: PipelineOutput`: the draft to draw.
- `mode`: Compare shows a slider between original and draft. Edit lets the teacher change the draft.
- `highlight: Box | null`: area to mark, set from the rule report.
- `selectedLabel`, `onSelectLabel(id | null)`: the selected label.
- `onMoveLabel(id, x, y)`: drag or arrow keys move a label (mm).
- `onDeleteLabel(id)`: the Delete key removes a label.
- `onToggleElement(id)`: click a part to remove it or restore it.
- `erased: readonly Box[]`, `onErase(box)`: the rub-out tool erases a rectangle.

## EditorPanel

Side panel for the Edit mode. Lists labels and removed parts.

- `labels`, `unread`, `deletedCount`: labels on the graphic, ids of words not yet typed, and the number of edited labels.
- `elements`: all parts, for the removed list.
- `selectedLabel`, `onSelectLabel`: the selected label.
- `onEditLabel(id, edit)`: change text, form (word or key) or key letters.
- `onResetLabels()`, `onAddLabel()`: reset all label edits, or add a label by hand.
- `onToggleElement(id)`: restore a removed part.
- `erased`, `onRestoreErased(index)`: list rubbed-out areas and restore one.

## RuleReport

Lists the 17 rule results with section, status (Review, Fixed or Pass), the summary and the findings.

- `results: readonly RuleResult[]`.
- `onLocate(box)`: shows a finding on the drawing.

## KeyExport

Shows the braille key page and the draft transcriber's note. Offers the page size choice and the downloads: PDF, graphic SVG and key SVG.

- `name: string`: diagram name, used for file names.
- `output: PipelineOutput`: source of the sheets.
- `page: PageSpec`, `onPage(page)`: page size. A change reloads the source at the new size.
- `reviewCount: number`: number of flagged rules, shown near the download.

## AiPanel

The optional AI step. Takes an API key in a password field and asks for label proposals. The teacher accepts or ignores each one.

- `pictureUrl: string`: the original picture.
- `spots: readonly LabelSpot[]`: label positions as fractions of the picture.
- `onApply(id, edit)`: applies an accepted proposal as a label edit. A proposal marked not essential deletes the label.

## ui/button

`Button`: the shadcn style button from `@base-ui/react`, with variants from `class-variance-authority`.
