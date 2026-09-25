ERP DOCUMENT INTELLIGENCE + QR/BARCODE + DRIVE + UX ENHANCEMENT

Continue from the existing Enterprise ERP Enhancement Master Plan.

STRICT RULE: Everything below is additive. Never delete, break, replace or regress existing features, business logic, calculations, APIs, workflows, permissions or working UI. Reuse and extend existing architecture wherever possible.

1. DOCUMENT INTELLIGENCE HUB — NEW CORE FEATURE

We generate QR codes/barcodes across invoices, receipts, PDFs, reports, ledgers, labels and other documents, but currently lack a complete way to scan, resolve and manage those documents.

Build a dedicated Document Management / Document Intelligence Hub.

It must provide:

QR scanner.

Barcode scanner.

Camera scanning + manual code entry fallback.

Universal document/code lookup.

Document history and audit trail.

Related entity/transaction navigation.

Document status and metadata.

Search/filter/sort.

Preview/view.

Download.

Print.

Share.

WhatsApp.

Copy generated text for manual sharing.

Open Google Drive location.

File explorer/file manager.

Document lifecycle/history.

Every QR/barcode generated anywhere in the application must be resolvable by the scanner and lead to the correct record/document/context.

Do not implement QR/barcodes as decorative output only. Make them bidirectional navigation keys into the ERP.

2. DOCUMENT REGISTRY

Create a central document registry/index containing, where applicable:

documentId · documentType · entityType · entityId · module · action · version · createdBy · createdAt · status · fileId · folderId · QR payload · barcode value · related documents · audit/history

The scanner should resolve:

QR/barcode → document registry → entity → correct module/screen → document/history/context

Support version/history tracking rather than treating every generated file as an unrelated file.

3. DOCUMENT MANAGEMENT UI

Create a dedicated Documents area with:

Dashboard.

Search.

Scanner.

File explorer.

Recent documents.

Documents by module.

Documents by entity.

Reports.

Invoices.

Receipts.

Ledgers.

PDFs.

Images.

Labels.

QR/barcodes.

Drive location.

History/audit.

Use enterprise file-manager UX, breadcrumbs, filters, metadata panels, preview panes, contextual actions and responsive layouts.

4. WHATSAPP / SHARING

Where relevant, add WhatsApp / Share / Copy Text actions to appropriate document-related screens, modals and previews.

WhatsApp content must be professionally structured.

Provide:

Well-formatted message.

Document/entity summary.

Important totals/status/details.

Appropriate document reference.

Share/download link where supported.

Copy Text fallback when PDF/file is too large or the user wants to send text manually.

Do not place WhatsApp actions indiscriminately; make them context-aware to the module/document type.

5. GOOGLE DRIVE DOCUMENT STORAGE

Implement automatic Google Drive organization.

During initial setup/deployment, create a single application root folder using a clear application/version naming convention, then create structured subfolders for application data and generated assets.

Example:

<Application Name>/
├── Project/
│   ├── Versions/
│   ├── Backups/
│   └── Deployment/
├── Documents/
│   ├── Invoices/
│   ├── Receipts/
│   ├── Reports/
│   ├── Ledgers/
│   ├── Quotations/
│   └── Other/
├── Media/
│   ├── Images/
│   ├── QR/
│   └── Barcodes/
├── Exports/
├── Imports/
└── Archive/


Create module/action-specific folders automatically where useful.

Never create duplicate folders on every deployment. Detect existing folders by stable configuration/IDs and reuse them.

Persist folder/file IDs in application configuration so Drive operations remain deterministic.

Use official Google Apps Script/Drive APIs and minimum required OAuth scopes. Google documents DriveApp folder creation and Drive API file/folder management for this purpose. {"fallbackMarkdown":"(Google for Developers
)","reference":{"matched_text":"","prefix":null,"start_idx":4767,"end_idx":4814,"safe_urls":["https://developers.google.com/apps-script/advanced/drive","https://developers.google.com/apps-script/advanced/drive?utm_source=chatgpt.com","https://developers.google.com/apps-script/samples/automations/import-csv-sheets","https://developers.google.com/apps-script/samples/automations/import-csv-sheets?utm_source=chatgpt.com","https://developers.google.com/workspace/drive/api/guides/folder","https://developers.google.com/workspace/drive/api/guides/folder?utm_source=chatgpt.com"],"refs":[],"alt":"(Google for Developers
)","prompt_text":null,"type":"grouped_webpages","status":"done","fallback_items":null,"style":null,"items":[{"title":"Import CSV data to a spreadsheet  |  Apps Script  |  Google for Developers","url":"https://developers.google.com/apps-script/samples/automations/import-csv-sheets?utm_source=chatgpt.com","attribution":"Google for Developers","pub_date":null,"snippet":"","attribution_segments":null,"supporting_websites":[{"title":"Create and populate folders  |  Google Drive  |  Google for Developers","url":"https://developers.google.com/workspace/drive/api/guides/folder?utm_source=chatgpt.com","pub_date":null,"snippet":"","attribution":"Google for Developers"},{"title":"Advanced Drive Service  |  Apps Script  |  Google for Developers","url":"https://developers.google.com/apps-script/advanced/drive?utm_source=chatgpt.com","pub_date":null,"snippet":"","attribution":"Google for Developers"}],"refs":[{"turn_index":0,"ref_type":"search","ref_index":5},{"turn_index":0,"ref_type":"search","ref_index":12},{"turn_index":0,"ref_type":"search","ref_index":16}],"hue":null,"attributions":null}],"error":null},"showLoginRequiredCard":false}

6. APPS SCRIPT SETUP / DEPLOYMENT

Add a first-run/bootstrap process that:

Determines the application root.

Creates/reuses the root Drive folder.

Creates/reuses required subfolders.

Creates/initializes required application resources.

Stores their IDs.

Verifies authorization.

Verifies Drive access.

Verifies document generation/storage.

Reports setup failures clearly.

Is safe to run repeatedly without duplicating resources.

Document all required OAuth scopes, deployment settings and permissions.

For web apps, explicitly account for whether execution is as the deploying user or accessing user, because that determines whose Drive permissions are used. {"fallbackMarkdown":"(Google for Developers
)","reference":{"matched_text":"","prefix":null,"start_idx":5517,"end_idx":5549,"safe_urls":["https://developers.google.com/apps-script/guides/web?authuser=31","https://developers.google.com/apps-script/guides/web?authuser=31&utm_source=chatgpt.com","https://developers.google.com/apps-script/manifest/web-app-api-executable?authuser=2","https://developers.google.com/apps-script/manifest/web-app-api-executable?authuser=2&utm_source=chatgpt.com"],"refs":[],"alt":"(Google for Developers
)","prompt_text":null,"type":"grouped_webpages","status":"done","fallback_items":null,"style":null,"items":[{"title":"Web Apps  |  Apps Script  |  Google for Developers","url":"https://developers.google.com/apps-script/guides/web?authuser=31&utm_source=chatgpt.com","attribution":"Google for Developers","pub_date":null,"snippet":"","attribution_segments":null,"supporting_websites":[{"title":"Web apps and API executables manifest resource  |  Apps Script  |  Google for Developers","url":"https://developers.google.com/apps-script/manifest/web-app-api-executable?authuser=2&utm_source=chatgpt.com","pub_date":null,"snippet":"","attribution":"Google for Developers"}],"refs":[{"turn_index":0,"ref_type":"search","ref_index":0},{"turn_index":0,"ref_type":"search","ref_index":1}],"hue":null,"attributions":null}],"error":null},"showLoginRequiredCard":false}

Never expose OAuth tokens or privileged Drive credentials to the frontend. {"fallbackMarkdown":"(Google for Developers
)","reference":{"matched_text":"","prefix":null,"start_idx":5630,"end_idx":5649,"safe_urls":["https://developers.google.com/apps-script/guides/web?authuser=31","https://developers.google.com/apps-script/guides/web?authuser=31&utm_source=chatgpt.com"],"refs":[],"alt":"(Google for Developers
)","prompt_text":null,"type":"grouped_webpages","status":"done","fallback_items":null,"style":null,"items":[{"title":"Web Apps  |  Apps Script  |  Google for Developers","url":"https://developers.google.com/apps-script/guides/web?authuser=31&utm_source=chatgpt.com","attribution":"Google for Developers","pub_date":null,"snippet":"","attribution_segments":null,"supporting_websites":[],"refs":[{"turn_index":0,"ref_type":"search","ref_index":0}],"hue":null,"attributions":null}],"error":null},"showLoginRequiredCard":false}

7. LOCALIZATION — FIX CURRENT BUG

There is currently a localization defect: Roman Urdu appears even when English-only is selected.

Implement a centralized localization policy with three explicit modes:

English

Pure, simple professional English across:

titles · headings · labels · descriptions · hints · buttons · tooltips · messages · errors · notifications · reports · documents

Urdu

Pure Urdu for normal language, while retaining necessary technical/product terms in English.

English + Roman Urdu

English technical terms/UI terminology with concise Roman Urdu descriptions/hints where appropriate.

STRICT RULE

If English is selected:

ZERO Roman Urdu and ZERO Urdu may appear anywhere in the UI or generated documents.

No hard-coded language strings may bypass the localization system.

Audit the entire application for hard-coded text.

Localization must cover UI + modals + toasts + validation + help + reports + invoices + receipts + PDFs + templates + WhatsApp messages + generated documents.

Persist the selected language and correctly restore it after refresh/re-login.

8. DOCUMENT / RECEIPT / PDF RESPONSIVENESS

Audit every generated document and preview.

Fix:

QR/barcode overflow.

Broken alignment.

Incorrect scaling.

Content leaving printable boundaries.

Small-paper receipt layout.

Label layout.

Invoice layout.

PDF layout.

Mobile/PWA preview.

Print preview.

Barcode/QR positioning.

Generated documents must respect their actual paper size, printable area, margins and content dimensions.

Nothing may overlap, clip, overflow or disappear.

9. TEMPLATE / DOCUMENT DESIGNER

Upgrade the template designer into a professional visual editor.

Increase desktop workspace/modal width where necessary.

Provide:

Structured layout.

Sections.

Rows/columns.

Fields.

Blocks.

Alignment tools.

Spacing controls.

QR/barcode controls.

Typography controls.

Visibility rules.

Data-aware fields.

Paper-size configuration.

Live preview.

Print preview.

Responsive preview.

LIVE PREVIEW — CRITICAL

Every designer control must update the preview immediately.

Changing:

field → size → position → font → alignment → spacing → visibility → QR/barcode → paper size → columns → rows

must visibly update the preview without requiring manual refresh.

The preview must represent the expected final output as accurately as possible.

10. QR / BARCODE DESIGN WORKSPACE

Create dedicated QR/barcode preview functionality.

Provide two modes:

Standard Preview

Show the selected QR/barcode at its standard configured size using the current template.

Sheet / Print Preview

Show the actual selected paper size, label dimensions, margins, columns/rows and the exact number of generated labels/barcodes/QR codes that will print.

Also provide a large inspection view/modal so users can zoom/read and accurately design QR/barcodes.

Show actual encoded/value data where appropriate.

Validate scannability before printing.

11. DATA-AWARE REPORTS & TABLES

Improve all reports/tables application-wide.

Requirements:

Correct column alignment.

Header/data alignment must match.

Numeric values use appropriate numeric alignment.

Consistent widths.

Clear borders/grid structure where useful.

Data-aware row styling.

Semantic color coding.

Summary/footer totals.

Appropriate grouping.

Expand/collapse rows where hierarchical data exists.

Clicking expand reveals related/detail data inside the table context.

Sorting/filtering/pagination remain usable.

Desktop density without sacrificing readability.

Mobile/tablet adaptive presentation.

Do not use arbitrary colors; color must communicate meaningful data/status.

12. CONTENT-AWARE UI

Everything should adapt to the type and state of the data.

Examples:

money → currency formatting

dates → consistent date formatting

status → semantic status indicator

inventory → stock state

financial rows → appropriate numeric alignment

documents → document-specific actions

permissions → contextual actions

empty data → useful empty state

Do not force one generic layout onto every data type.

13. FINAL ARCHITECTURAL REQUIREMENT

Prefer reusable centralized systems:

Document Registry → QR/Barcode Resolver → Document Manager → Drive Storage → Preview/Designer → Print/Export → Share/WhatsApp

and

Localization Service → UI → Documents → Reports → WhatsApp

Do not implement isolated QR scanners, localization logic, document storage or preview systems separately in every module.

Build reusable infrastructure and integrate existing modules into it.

ACCEPTANCE CRITERIA

A document generated anywhere in the ERP must be:

Generated → Stored → Indexed → QR/Barcode identified → Searchable → Scannable → Resolvable → Viewable → Trackable → Downloadable → Printable → Shareable

and its complete history/context must remain accessible.

The final system must be:

Enterprise-grade · Data-aware · Context-aware · Responsive · PWA-ready · Localization-safe · QR/Barcode-enabled · Drive-organized · Print-accurate · Regression-safe

Preserve existing functionality at every stage. New capabilities are additive only.