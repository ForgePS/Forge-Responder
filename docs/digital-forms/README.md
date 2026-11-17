# Digital Forms: convert a paper form into a form members fill in

A department uploads an existing form (a PDF, or a PNG/JPG photo or scan of a paper form). FORGE reads it
into a list of fields, a form manager checks and corrects them, and once published, members fill the form in
and save it in FORGE Responder.

Nav: **Documents → Digital Forms** (`?page=digital-forms`). Tabs: **Forms**, **Submissions**, and, for form
managers, **Convert a form** and **Manage**.

## What existed, and what this reuses

| Existing piece | Where | Used for |
|---|---|---|
| Inspection template format: `sections[].fields[]` with `key, type, label, helpText, placeholder, required, options` | `src/lib/inspections/inspectionConfigService.js` (`normalizeInspectionTemplate`), `src/lib/inspections/configDefaults.js` (`TEMPLATE_FIELD_TYPES`) | The definition format. Digital forms use the same shape and a subset of its field types. |
| Answer rules (`answers[field.key]`, required-field check) | `src/lib/inspections/checklistFields.js` | Fill-in validation in the browser. The server mirrors it in `functions/lib/digitalForms/schema.js`. |
| Field renderer | `src/components/inspections/ChecklistFieldInput.jsx` | Every field input, in both fill-in and the review Preview. |
| Draft → publish → immutable version → submission keeps a `templateSnapshot` | Inspection templates and the fleet checklist builder | The same lifecycle: `formTemplates` + `formTemplateVersions`, and each submission stores its snapshot. |
| Checklist builder Preview (PR #47) | `src/pages/ApparatusCheckSetupPage.jsx` | The review screen's Edit/Preview toggle. |
| Claude integration and `ANTHROPIC_API_KEY` secret | `functions/lib/nerisNarrative.js`, `functions/lib/forgeAi/model.js` | The conversion call: same SDK, JSON-schema output, server-side refusal fallback, and the same secret. |
| Daily AI cap (`platformAiUsage/{dept}_{day}`) | `functions/lib/nerisNarrative.js` | A per-department daily conversion limit (`formConversions`, 25 per day). |

Not used:
* **Jotform.** It was removed in PR #61; only labels for old damage-form records remain.
* **The IFC scripts** (`scripts/ifc/`). They parse one DOCX (the IFC code book) with jszip and regex, and there
  is no PDF parser in the repo. Claude reads PDFs and images directly, which also covers photos and scans
  where text extraction alone would fail.
* **Fleet checklists.** They have no `options`, date, select or signature types, and their renderer is tied to
  apparatus, defects and readiness.

## Flow

1. **Upload.** `digitalFormsCreateImport` checks the type (PDF/PNG/JPEG) and size (≤ 20 MB). It creates
   `departments/{d}/formImports/{importId}` with `status: "awaiting_upload"` and returns the upload path
   `formImports/{d}/{importId}/source.{pdf|png|jpg}`. The browser uploads the file there.
2. **Convert.** `digitalFormsConvert` claims the import in a transaction, so a double click can't convert or
   bill it twice. It then:
   * re-builds the file path from the verified department;
   * checks the stored file's size, content type and first bytes (`%PDF-`, PNG and JPEG signatures);
   * reserves the daily allowance and sends the file to Claude (`claude-opus-5-5`, structured JSON output).
   
   The result is cleaned by `normalizeDefinition`: known types only, unique answer keys, options kept only for
   select fields, and size limits. It is saved as `draft` with `status: "review"`, together with the model's
   warnings (unreadable parts, guessed types, simplified tables).
3. **Review.** The form manager edits the name, sections and fields: label, type, required, help text and
   choices. They can reorder fields and move them between sections, preview the form, and open the original
   file. `digitalFormsSaveDraft` re-cleans every save. **Nothing is visible to members until Publish.**
4. **Publish.** `digitalFormsPublish` refuses a definition with problems (no name, no answerable field, a
   select field with fewer than two choices). Otherwise it writes `formTemplates/{id}` and
   `formTemplateVersions/{id}-v1`, and marks the import `published`.
   * `digitalFormsRevise` publishes edits to a live form as the next version.
   * `digitalFormsSetStatus` archives or restores a form.
   * `digitalFormsDiscardImport` deletes an unwanted upload and its file.
5. **Fill in.** Members open **Forms → Fill in**. `digitalFormsSubmit` loads the published version and checks
   every answer against it (types, choices, dates, required fields), dropping unknown keys and stamping
   signature times on the server. It then saves `formSubmissions/{id}` with `templateVersionId` and the
   `templateSnapshot`. If the form changed while the member was filling it in, the save is refused with
   "reload".

## Linking a form to platform records

On **Convert a form**, the manager picks what each submission is for: nothing, an **apparatus**, an
**occupancy**, a **station** or a **member** (personnel). They can change it while reviewing, and it is
published with the form (`linkType` on the definition, template and version snapshot). When a member fills
in a linked form, they must choose the record first.

* `digitalFormsLinkOptions` lists the records of that type, from the caller's verified department only:
  * apparatus: `fleetAssets` (decommissioned ones left out), plus units that are only on the classic
    Apparatus list;
  * occupancy: `occupancies`;
  * station: the station names in `profile/main`;
  * personnel: the personnel list (name and rank only).
* `digitalFormsSubmit` looks the chosen id up again in the same department and saves
  `linkedRecord { type, id, label, detail }`, plus flat `linkedType` and `linkedId` copies for querying.
  The label always comes from the server; a label sent by the browser is ignored. An id from another
  department, or a removed record, is refused.

## Remarks and photos on No / Fail

Any Yes/No, Pass/Fail or Pass/Fail/N/A item answered **No** or **Fail** opens a remarks box underneath it,
with a **Take or add photo** button (the phone camera opens directly; up to 6 photos per item, 40 per form).
Remarks are required; photos are optional.

* Photos are shrunk in the browser (2000 px, JPEG) and uploaded before submitting, to
  `formSubmissionPhotos/{departmentId}/{uid}/{random}.jpg`.
* On submit, the server keeps a photo only if it is under the caller's own folder in the verified
  department, exists, and is a JPEG/PNG/WebP image of 10 MB or less. Otherwise it refuses the submission.
* Saved as `details[field.key] = { remarks, photos: [path] }`, only for items still answered No/Fail.
* Readable by the member who took them, and by holders of `viewDigitalFormSubmissions` or
  `manageDigitalForms` (and department admins).
* Photos added and then removed before submitting stay in Storage, unreferenced. Browsers can't delete them.

## Using a form for inspections

In **Manage**, a published form has **Use for inspections** (needs `manageInspectionConfig`). It:

1. copies the form's published version into an inspection template (`inspectionTemplates`, same sections, keys
   and field types) marked `remarksOnFail` and `sourceDigitalFormId`;
2. publishes it as an immutable template version;
3. makes it the default template of the chosen inspection type, or of a new type named after the form.

New inspections of that type then use the form as their checklist. Inspections already created keep the
checklist they started with. Running it again after revising the form publishes the new version to the same
template.

In an inspection whose template has `remarksOnFail`, a Yes/No or Pass/Fail item answered No/Fail shows a
required remarks box and the inspection photo field. They are stored on the inspection under companion keys
`answers["<key>__remarks"]` and `answers["<key>__photos"]` (photos are inspection attachments, as with any
inspection photo). **Complete** is blocked until every No/Fail item has remarks. Templates without
`remarksOnFail` (all existing ones) are unchanged.

Code: `src/lib/digitalForms/inspectionTemplateFromForm.js`, `src/lib/digitalForms/inspectionTemplateMapping.js`,
`src/lib/inspections/inspectionFailDetails.js`.

## Data

All Firestore data is under `departments/{departmentId}/` and is written only by Cloud Functions.

| Path | Holds | Browser can read |
|---|---|---|
| `formImports/{importId}` | file name/type/size, `uploadPath`, `status` (`awaiting_upload`, `converting`, `review`, `failed`, `published`, `discarded`), `draft`, `warnings`, `error`, `templateId` | form managers |
| `formTemplates/{templateId}` | current `name, description, sections`, `lifecycleStatus` (`published`/`archived`), `currentVersion`, `publishedVersionId`, `sourceImportId` | members who fill in, manage or review forms |
| `formTemplateVersions/{templateId}-v{N}` | immutable `snapshot` of each published version | same as above |
| `formSubmissions/{id}` | `templateId, templateVersionId, templateName, templateSnapshot, answers, details` (remarks/photos), `linkedRecord, linkedType, linkedId, submittedBy, submittedByName, submittedAt` | the submitter; holders of `viewDigitalFormSubmissions` or `manageDigitalForms` |
| Storage `formImports/{d}/{importId}/source.*` | the uploaded original | form managers |
| Storage `formSubmissionPhotos/{d}/{uid}/*` | photos on No/Fail answers | the member who took them; submission reviewers |

Answers use the inspection checklist shapes: text and numbers as strings, dates as `YYYY-MM-DD`, checkboxes
as booleans, choices as strings, `multi_select` as a string list, and signatures as `{ name, signedAt }` (a
typed name).

## Permissions

| Key | Lets a member | Built-in roles |
|---|---|---|
| `manageDigitalForms` | upload, convert, review, publish, revise, archive; see all submissions | Creator, Fire Chief, IT Admin |
| `fillDigitalForms` | see published forms and fill them in; see their own submissions | all but Read Only |
| `viewDigitalFormSubmissions` | see everyone's submissions in the department | Creator, Fire Chief, Battalion Chief, Company Officer, IT Admin |

The keys are kept in sync in `src/data/creatorPermissions.js`, `src/data/adminRegistry.js` (labels, the
"Documents & prevention" group, nav module) and `src/data/defaultRoles.js`. `functions/lib/defaultRolePermissions.json`
is regenerated from them. The feature belongs to the **Documents** module: if a department's plan doesn't
include it, every callable refuses.

## Tenant security

* **Callables.** Every callable runs `resolveCaller()`. The request's `departmentId` only selects a department;
  `assertMemberPermission` checks active membership, subscription and permissions server-side. A forged id
  fails like a non-member.
* **Paths.** Every document and file path is built from the verified department. An import id from department
  A used with department B finds nothing. An import record in B that points at A's file is refused before
  anything is read or sent, because the server re-derives the path instead of trusting `uploadPath`.
* **Firestore rules.** All four collections are server-write-only, with reads as in the table above. They are
  listed in `hasExplicitTenantRule()`.
* **Storage rules.** Only a form manager of that department may upload, and only:
  * once, to an import they started that is still `awaiting_upload`;
  * at that import's exact path;
  * with the declared type, under 20 MB.
  
  No replace or delete from the browser. Originals are readable by that department's form managers only.
* **Cost and data control.**
  * Conversion is turned off in the public demo department (`forge-demo`) except for FORGE staff.
  * There is a per-department daily cap. A failed API call gives the allowance back.
  * The upload screen tells managers that the file is sent to Anthropic and not to upload forms that already
    contain patient or personal information.
* **Prompt injection.** The model gets no tools and returns only a JSON form description. Its system prompt
  says the file's text is data. A person reviews every field before anything is published.

## Setup and running locally

* **Production.** Conversion uses the existing `ANTHROPIC_API_KEY` Functions secret
  (`firebase functions:secrets:set ANTHROPIC_API_KEY`, already set if the NERIS AI narrative works). Deploy the
  functions, Firestore and Storage rules together. No index changes are needed.
* **Local emulators** (`npm run demo:offline`). `functions/.env.demo-forge-rms` sets
  `DIGITAL_FORMS_EXTRACTOR=sample`, so conversion returns a fixed sample form without an API key, and nothing
  is sent out. The flag only works when `FUNCTIONS_EMULATOR=true`. Sign in with the local creator login,
  because the demo login can't convert in `forge-demo`.

## Tests

* `tests/unit/digitalForms.test.mjs` covers:
  * definition cleaning, keys and limits;
  * publish checks;
  * answer validation;
  * file signatures;
  * the Claude request shape (a test double: nothing is sent).
* `tests/unit/digitalFormsEditor.test.mjs` covers the review editor helpers and nav access.
* `tests/functions/digitalForms.test.mjs` (Firestore + Storage emulators) covers:
  * the full upload → convert → review → publish → fill-in flow;
  * revisions and archiving;
  * tenant isolation (release blocking);
  * permissions, the Documents module and the demo guard;
  * bad files, double conversion, API failures and the daily cap.
* `tests/rules/firestore.rules.test.mjs` ("digital forms") covers Firestore reads and writes, and Storage
  uploads and reads, across departments and roles.

## Known limitations

* Repeating table rows (crew lists, inventories) come through as the first row only, with a warning. The
  reviewer can add fields by hand.
* There are no photo or file-attachment fields yet. The inspection photo input stores files under
  inspections, so it would need its own upload path first.
* Signatures are typed names, the same as inspections.
* Large PDFs may hit the model's request limits. The error suggests converting a smaller file or one page at
  a time.
* Submissions can't be edited or deleted after saving. There is no PDF print of a submission yet; the damage
  form PDF generator (`functions/lib/damageFormPdfGenerator.js`) is the pattern to follow.
