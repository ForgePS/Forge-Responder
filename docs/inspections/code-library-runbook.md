# IFC Code Library — Import & Adoption Runbook

## Licensing posture

- Import **only** the owner-supplied ICC IFC Code and Commentary Combo file.
- Do **not** hardcode 2024 IFC as the only available fire code.
- Creator controls **library availability** per department.
- Tenant admins control **adopted-code profiles** from publications the Creator enabled.
- Violation citations store a **frozen text snapshot** so later adoption changes do not rewrite history.

## Collections

| Collection | Scope | Purpose |
|---|---|---|
| `codePublications` | Platform | Publication metadata |
| `codeNodes` | Platform | Hierarchy + body text |
| `codeImportBatches` | Platform | Immutable import audit |
| `departmentCodeLibraryAccess` | Platform | Per-department enablement |
| `departments/{id}/adoptedCodeProfiles` | Department | Adoption config + history |
| `departments/{id}/codeSavedSections` | Department | Saved / frequent sections |
| `departments/{id}/codeSearchHistory` | Department | Recent searches |

Existing tenant-authored summaries remain in `codeSets` / `codeSections`.

## Parse DOCX

```bash
# From extract (already produced):
npm run ifc:parse -- --from-extract _tmp_ifc_extract.txt --out scripts/ifc/out --max-sections 500

# Or from original DOCX (jszip is a dependency):
npm run ifc:parse -- --input "C:/Users/jerem/OneDrive/Documents/2024_ifc_comm_combo section 1.docx" --out scripts/ifc/out
```

Outputs:
- `scripts/ifc/out/ifc-2024-preview.json`
- `scripts/ifc/out/ifc-2024-nodes.jsonl`
- `scripts/ifc/out/ifc-2024-stats.json`

## Publish to Firestore

```bash
# Uses Application Default Credentials
npm run ifc:publish -- --in scripts/ifc/out/ifc-2024-preview.json
```

In-app alternative: Prevention → Code Library → **Code Administration** → “Publish preview seed” or upload parsed JSON (Creator).

## Enable for a department

1. Creator opens **Code Administration**
2. Enable Code Library module for the department
3. Enable publication `ifc-2024`
4. Tenant Admin opens **Adopted Codes**, sets primary publication, ordinance/dates/appendices, Save

## Inspector use

1. **Search Codes** / **Browse Codes**
2. Open section → Create violation / Add to inspection / Save section / Copy citation
3. Citation snapshot is written onto the violation record (code text only by default)
4. Report extraction issues from the Actions panel when body text looks wrong

## Dual catalog note

- **Platform library** (`codePublications` / `codeNodes`) = adopted IFC (+ commentary)
- **Tenant summaries** (`codeSets` / `codeSections`) = short inspector summaries; remain the fallback when the library module is disabled
