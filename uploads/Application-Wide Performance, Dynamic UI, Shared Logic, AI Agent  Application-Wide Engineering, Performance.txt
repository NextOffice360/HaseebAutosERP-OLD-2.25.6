 AI Agent — Application-Wide Engineering, Performance & UX Master Requirements

# AI AGENT — APPLICATION-WIDE ENGINEERING & UX REQUIREMENTS

 ## 1\. Core Execution Rule

 Before changing, installing, integrating, configuring, deploying, or debugging anything:

 1. Inspect the existing codebase, architecture, dependencies, configuration, database, APIs, integrations, deployment setup, and UI patterns.
2. Identify the root cause before applying fixes.
3. Reuse existing architecture where appropriate; do not create duplicate systems.
4. Build reusable, application-wide logic instead of page-specific patches.
5. Preserve existing working functionality unless a change is explicitly required.
6. After every major change, test the affected flows and verify that existing functionality still works.

 **Do not guess technical behavior. Verify it.**

---

 # 2\. Official Documentation & Research Policy

 Whenever a technology, framework, API, platform, dependency, service, integration, deployment method, or external tool is used, modified, installed, or configured:

 ### Always research first

 Use the most authoritative sources available, prioritizing:

1. Official documentation.
2. Official developer guides.
3. Official API documentation/reference.
4. Official installation/configuration/deployment guides.
5. Official GitHub repositories.
6. Official technical blogs/changelogs.
7. Trusted tutorials, guides, Stack Overflow, community documentation, and YouTube only as supplementary sources.

 Do not rely on outdated, copied, unofficial, or unverifiable instructions when official documentation exists.

 ### This applies to everything used by the project, including but not limited to:

 - Frontend frameworks.
- Backend frameworks.
- UI/design systems.
- APIs.
- Database systems such as MySQL.
- Google Apps Script.
- Google Sheets.
- Authentication/authorization.
- Payment gateways.
- Cloud services.
- Hosting/deployment.
- AI providers and AI agents.
- SDKs.
- Libraries/packages.
- Build tools.
- Integrations.
- Webhooks.
- Third-party services.
- Repositories and dependencies.

 Record the relevant official documentation/reference links in the project documentation where useful.

---

 # 3\. Beginner-Friendly Documentation Requirement

 Every important implementation must be documented so that a beginner can understand and reproduce it without expert assistance.

 For each tool/integration/service, document:

 - What it does.
- Why the application uses it.
- Required account/setup.
- Installation.
- Configuration.
- Environment variables.
- API keys/credentials.
- Required permissions/scopes.
- Database setup/migrations.
- Integration/wiring steps.
- Local development setup.
- Testing procedure.
- Deployment procedure.
- Production configuration.
- Troubleshooting.
- Common errors and fixes.
- Rollback/recovery procedure.
- Official documentation links.

 Use clear, simple English and exact step-by-step procedures.

 Never document secrets, API keys, passwords, or private credentials.

---

 # 4\. Application-Wide Performance — CRITICAL

 The application currently has severe data-loading delays.

 Even with a 1 Gbps connection, many button actions can take approximately one minute to return data. Sometimes requests stop and display **Retry**.

 This occurs in both:

 - Local environment.
- Self-hosted environment.

 ### Investigate the complete request chain

 **UI → frontend state → API → backend → database/external service → response → frontend processing → rendering**

 Identify the actual bottleneck before fixing it.

 Check for:

 - Slow database queries.
- Missing indexes.
- N+1 queries.
- Excessive API requests.
- Duplicate requests.
- Blocking operations.
- Inefficient data transformation.
- Large payloads.
- Excessive frontend rendering.
- Bad caching.
- Timeouts.
- Retry loops.
- Network problems.
- Backend bottlenecks.
- External API latency.

 ### Required UX

 Every asynchronous action must have:

 - Action-specific loading state.
- Spinner/progress indicator.
- Disabled duplicate submission/click protection.
- Success state.
- Clear error state.
- Appropriate retry action.
- Progress/status information for long operations.

 Never leave the user guessing whether the application is frozen.

---

 # 5\. GLOBAL REUSABLE DATA-AWARE UI SYSTEM

 Create/fix a reusable application-wide dependency system for:

 **Field → Value → Dependency → Data → UI**

 All relevant:

 - Fields.
- Forms.
- Rows.
- Cells.
- Tables.
- Sections.
- Blocks.
- Dropdowns.
- Actions.

 must respond dynamically to related data.

 ### Example

 **Country selected → Region/State → City → Postal Code → related sections/options**

 Automatically:

 - Fetch dependent data.
- Populate fields.
- Update options.
- Show relevant sections.
- Hide irrelevant sections.
- Update validation.
- Update available actions.

 No manual refresh should be required.

---

 # 6\. Conditional UI

 Use reusable conditional rendering/data rules.

 **Data exists/applicable → show related UI.**

 **Data empty/not applicable → hide related UI.**

 Do not leave unnecessary empty cards, sections, fields, or containers.

---

 # 7\. Dynamic Provider/Configuration Forms

 Selection fields must control their dependent configuration UI.

 Example:

 **AI Provider → Gemini**

 must automatically display Gemini-specific:

 - Models.
- Credentials/configuration.
- Parameters.
- Options.
- Validation.
- Documentation/help.

 Changing provider must automatically switch the configuration UI.

 Implement this through reusable configuration/dependency logic, not hard-coded page-by-page conditions.

---

 # 8\. Global Date & Timestamp System

 Implement a reusable date/time system.

 Support:

 - Created date/time.
- Updated date/time.
- Event timestamps.
- Configurable date format.
- 12/24-hour format.
- Seconds on/off.
- Timezone handling.
- Date-only/time-only/date+time.
- Global timestamp visibility on/off.

 Use one consistent system throughout the application.

---

 # 9\. Global Field Visibility & Permissions

 Create reusable field-level visibility rules supporting:

 **Role → Scope → Module → Section → Field → Permission**

 Apply where required to:

 - POS.
- GRN.
- PO.
- Sales.
- Customers.
- Products.
- Suppliers.
- Other modules.

 Examples:

 - Cost price.
- Profit/margin.
- Customer contact information.
- Supplier information.
- Internal notes.
- Financial/internal data.

 Sensitive fields must be protected at the **backend/API authorization level**, not merely hidden with frontend CSS.

---

 # 10\. Sidebar — MUST FIX

 The existing sidebar behavior is still incorrect.

 Implement a clear responsive state model:

 **Expanded → Partially Collapsed → Mobile/Off-Canvas**

 ### Desktop

 Expanded:

 **Icon + Text**

 Partially collapsed:

 **Icon only**

 The current incorrect behavior where collapsed mode still displays icon + text must be fixed.

 ### Off-canvas

 Provide clear:

 - Open.
- Close.
- Collapse.
- Expand.

 behavior without conflicting with desktop sidebar state.

 Persist the user's sidebar state where appropriate.

 Verify behavior on:

 - Desktop.
- Laptop.
- Tablet.
- Mobile.

---

 # 11\. UX / Design-System Requirements

 Use the application's existing design system consistently.

 Create reusable components/patterns for:

 - Loading states.
- Empty states.
- Error states.
- Retry states.
- Form validation.
- Tooltips.
- Help text.
- Confirmation dialogs.
- Notifications.
- Tables.
- Filters.
- Pagination.
- Buttons.
- Dropdowns.
- Modals.
- Sidebar/navigation.

 Do not create visually inconsistent one-off components.

---

 # 12\. Simple, Self-Descriptive UX

 Every important field, setting, action, integration, and configuration should be understandable without expert knowledge.

 Where useful, provide:

 - Short descriptions.
- Simple hints.
- Tooltips.
- Examples.
- Units.
- Required/optional indicators.
- Validation messages.
- Safe defaults.
- Links to official documentation.

 Use simple English.

 Avoid unnecessary technical terminology.

 Example:

 **API Key**

 > Used to securely connect this service to your account.

 **Webhook URL**

 > Copy this URL into your payment provider's webhook settings.

---

 # 13\. Documentation Links Inside the Application

 Where an external configuration is required, provide a relevant **official documentation/setup link** directly in the UI.

 Examples:

 - API setup.
- API key creation.
- OAuth configuration.
- Webhook configuration.
- Deployment.
- Database setup.
- Google Apps Script.
- Google Sheets.
- Payment gateway setup.

 Links must point to authentic/official sources whenever available.

---

 # 14\. Naming & Architecture

 Use consistent:

 - Component naming.
- File naming.
- Database naming.
- API naming.
- Variables.
- Functions.
- Routes.
- Services.
- Hooks.
- Types/interfaces.
- Configuration keys.
- Environment variables.

 Follow the conventions recommended by the technology/framework being used.

 Do not introduce arbitrary naming styles.

---

 # 15\. Installation, Configuration & Deployment

 Whenever installing or configuring a dependency/service:

 1. Verify official requirements.
2. Install the correct supported version.
3. Configure it using environment/configuration management.
4. Document required variables.
5. Configure local development.
6. Configure production.
7. Test integration.
8. Verify deployment.
9. Document rollback/recovery.
10. Record official references.

 Never hard-code credentials or secrets.

---

 # 16\. Debugging & Verification

 For every bug:

 **Reproduce → Inspect → Isolate → Identify root cause → Fix → Test → Regression test → Document**

 Do not mark an issue as fixed simply because the UI appears correct.

 Verify the complete data flow and relevant backend/API/database behavior.

---

 # 17\. Required Testing

 Test at minimum:

 - Normal operation.
- Empty data.
- Large datasets.
- Slow network/API.
- Failed API request.
- Timeout.
- Retry.
- Duplicate click/submission.
- Permission restrictions.
- Different roles.
- Different scopes.
- Dependent fields.
- Dynamic dropdowns.
- Mobile/responsive UI.
- Desktop sidebar states.
- Local environment.
- Production/self-hosted environment.

---

 # 18\. Execution Priority

 Work in this order:

 1. **Audit existing architecture and implementation.**
2. **Identify root causes and missing shared systems.**
3. **Fix critical performance/request handling.**
4. **Fix global reusable data-aware UI logic.**
5. **Fix global permissions/field visibility.**
6. **Implement global date/time/timestamp system.**
7. **Fix sidebar/responsive navigation.**
8. **Apply shared systems across all modules.**
9. **Improve UX/help/tooltips/documentation links.**
10. **Test locally and in deployment.**
11. **Document implementation, configuration, deployment, and troubleshooting.**

---

 # FINAL AGENT RULE

 **Do not blindly start coding.**

 First inspect the project and create a concise implementation plan identifying:

 - Existing architecture.
- Relevant files/modules.
- Current behavior.
- Root causes.
- Missing shared logic.
- Dependencies/integrations involved.
- Official documentation required.
- Proposed reusable solution.
- Risks/dependencies.
- Test plan.

 Then implement the solution.

 **Prefer one correct reusable system over many isolated fixes.**

 **Do not guess. Research official documentation, inspect the actual implementation, verify assumptions, implement, test, and document.**

 The final result must be:

 **Fast + reliable + reusable + data-aware + secure + responsive + beginner-friendly + properly documented + production-ready.**


********************


Application-Wide Performance, Dynamic UI, Shared Logic & Responsive Navigation Requirements

Application-Wide Performance, Shared Logic & UI Requirements





Critical Issue: Website Performance, Data Fetching & Loading States

The application is currently extremely slow when loading or fetching data.

Even with a 1 Gbps internet connection, clicking almost any button that triggers a data fetch can take close to one minute before the UI responds or displays the requested data.

This issue occurs in both environments:





Self-hosted version running on the hosting/server.



Local version running directly from my PC.

Problems observed





Very slow API/data fetching and UI response.



Buttons can remain apparently inactive for a long time after being clicked.



There is no clear loading indicator on the specific button/action being executed.



There is no visible progress or status indicating that the system is still processing.



Sometimes the request appears to stop completely and the UI shows "Retry Again".



It is unclear whether the problem is:





API response time.



Database queries.



Backend processing.



Frontend state management.



Network requests.



Excessive/repeated API calls.



Request timeouts.



Data transformation.



Rendering large datasets.



Blocking JavaScript operations.



Incorrect caching.



N+1 queries or inefficient database access.



Any combination of the above.

Required action

First, investigate and identify the actual root causes of the performance problems before making assumptions or applying superficial fixes.

Audit the complete request lifecycle:

UI action → frontend state → API request → backend processing → database/query → response → frontend processing → UI rendering

Identify which part is creating the delay and fix the underlying issue.

Loading UX requirements

Every asynchronous operation must provide clear feedback.

For example:





Button-specific loading state.



Spinner/progress indicator.



Button should visually indicate that the action is being processed.



Prevent accidental duplicate submissions/clicks while the same request is running.



Show appropriate success/error state.



Show retry functionality only when a retry is actually appropriate.



Long-running operations should provide meaningful progress/status information where possible.



The user should never be left wondering whether the application is frozen or still processing.

The loading state must be specific to the action being executed, rather than displaying a generic application-wide spinner for everything.





GLOBAL REUSABLE SHARED LOGIC — APPLICATION WIDE

This needs to be treated as a core application architecture requirement, not implemented separately for each page.

Identify common logic that should be reusable throughout the entire application and implement it centrally so that the same behavior is consistently available everywhere.

The objective is to avoid repeatedly implementing the same logic independently in POS, GRN, PO, customers, products, settings, forms, tables, etc.





Dynamic, Data-Aware Fields, Rows, Forms, Tables & UI

All fields, rows, forms, tables, sections, blocks and related UI components must be data-aware and context-aware.

The UI should dynamically respond to the user's selections and entered data.

General principle

When a user selects or enters something, all dependent UI elements should automatically update based on that selection/value.

For example:

Parent selection → dependent data → dependent fields → dependent sections → dependent actions/options

This logic should be reusable application-wide.

Example: Country Selection

If the user selects a country:

Country → Region/State → City → Postal/ZIP Code → related fields/options

The system should automatically:





Identify fields related to the selected country.



Populate available regions/states.



Populate cities where applicable.



Apply the appropriate postal-code behavior.



Display relevant sections/blocks.



Hide fields that are not applicable.



Populate available options dynamically.



Update validation rules where necessary.

The user should not have to manually refresh the page or trigger another action to make dependent UI elements appear.





Dynamic Sections and Conditional UI

The UI should automatically determine whether a field has meaningful data or a relevant configuration section.

Rules

If a field/value has related information:





Automatically display the relevant section/block.



Populate it with the appropriate data/options.

If the field is empty or not applicable:





Hide the related section/block where appropriate.



Do not leave empty containers, blank cards, or irrelevant UI elements visible.

For example:

If a field has data → show its related UI.

If a field has no data → hide its related UI.

This should be handled through reusable conditional rendering logic rather than manually coded separately on every screen.





Dynamic Dropdown / Provider / Configuration Logic

Dropdowns and selection fields must drive the rest of the UI dynamically.

For example, suppose there is an:

AI Assistant Settings

section with multiple providers:





Gemini



OpenAI



Anthropic



Other providers

If the user selects Gemini, the UI should automatically display the configuration fields relevant to Gemini.

For example:





Gemini API configuration.



Gemini-specific model options.



Gemini-specific parameters.



Gemini-specific settings.



Any other fields supported by that provider.

If the user changes the selection to another provider, the UI should automatically:





Remove/hide irrelevant Gemini-specific settings.



Load the selected provider's settings.



Display the relevant fields/options.



Apply the correct validation.



Preserve or manage previously entered values appropriately.

This should be implemented as a reusable dependency/configuration system, not as isolated hard-coded logic for each dropdown.





Identify Existing Missing Shared Logic First

Before adding more features, perform an application-wide audit.

First identify all places where this type of shared/dynamic logic is currently missing or implemented inconsistently.

Look for:





Duplicate implementations.



Hard-coded dropdown behavior.



Hard-coded conditional fields.



Repeated API calls.



Repeated data-fetching logic.



Fields that do not respond to parent selections.



Sections that should dynamically appear/disappear.



Tables that do not update when related data changes.



Forms that do not populate dependent fields.



Inconsistent validation.



Inconsistent loading states.



Components implementing the same logic differently.

Fix the shared architecture first, then apply it consistently across the application.

Do not simply patch individual screens one at a time if the underlying functionality should be shared.





Global Date & Timestamp System

I also noticed that the application currently displays dates in many places, but the time component/timestamp is missing.

The application needs a reusable global date/time system.

Required functionality

Where appropriate, records should support:





Created date.



Created time.



Updated date.



Updated time.



Full timestamp.



Other relevant event timestamps.

For example:

Created: 23 Sep 2026, 10:42:31

Updated: 23 Sep 2026, 11:18:07

The exact display format should be configurable.





Configurable Date/Time Display

Date and timestamp behavior should be configurable rather than hard-coded.

Provide global configuration options such as:





Date only.



Time only.



Date + time.



Full timestamp.



12-hour / 24-hour format.



Seconds on/off.



Timezone handling.



Configurable display format.



Configurable visibility.

There should also be a global on/off option for timestamp display where appropriate.

The same reusable date/time configuration should be available throughout the application.





Global Field & Data Visibility Controls

Add a reusable system for controlling which fields/data are visible in different areas of the application.

This should work across modules such as:





POS.



GRN.



Purchase Orders.



Sales Orders.



Invoices.



Customers.



Products.



Suppliers.



Other relevant modules.

Examples of fields that may need visibility control:





Cost price.



Selling price.



Margin/profit information.



Customer contact details.



Customer data.



Supplier information.



Internal notes.



Financial information.



Other sensitive/internal fields.





Role-Based and Scope-Based Visibility

Field visibility should support both user role and scope.

For example:

A user may be allowed to access the POS but should not be able to see:





Cost price.



Profit margin.



Internal supplier information.

Another role may be allowed to see those fields.

The system should therefore support rules such as:

Role → Module → Section → Field → Visibility/Permission

And where applicable:

User Scope → Location/Branch/Warehouse/Organization → Data Visibility

These controls should be reusable globally rather than independently implemented in every module.





Important: Visibility Must Apply to the UI and Data

If a field is configured as hidden for a particular role/scope, it should not merely be visually hidden with CSS while the sensitive data is still unnecessarily exposed to the frontend.

The permission/visibility system should be designed properly so that sensitive information is protected at the appropriate backend/API level as well as in the UI.





Left Sidebar / Navigation — Existing Issue Still Not Fixed

The left sidebar panel logic still needs to be fixed.

I have already discussed this requirement multiple times, but the current implementation does not behave as intended.

This needs specific attention rather than being overlooked while working on other features.

Desktop behavior

The desktop sidebar must properly support:

Expanded state

Display:

Icon + Text

Partially collapsed state

Display:

Icon only

The current behavior where the sidebar continues showing icon + text when it should be partially collapsed is incorrect.

The collapsed state must actually reduce the sidebar width and hide the text labels while retaining the icons.





Sidebar Responsive Behavior

The sidebar must behave correctly across:





Desktop.



Laptop.



Tablet.



Smaller screens.

The desktop implementation is particularly important.

The sidebar should have a predictable state model, for example:

Expanded → Partially Collapsed → Mobile/Off-Canvas

Each state should have clearly defined behavior.





Off-Canvas Sidebar

There also needs to be a proper option to hide/show the off-canvas sidebar where applicable.

The user should have clear controls for:





Opening the sidebar.



Closing the sidebar.



Expanding/collapsing it.



Returning to the appropriate responsive state.

The off-canvas behavior should not conflict with the desktop collapsed/expanded behavior.





Sidebar State Persistence

Where appropriate, remember the user's sidebar state.

For example:





Expanded.



Partially collapsed.



Mobile/off-canvas closed.

If the user selects a preferred desktop sidebar state, navigating between pages should not unexpectedly reset it.





Implementation Priority

Please approach these issues in the following order:

Priority 1 — Identify root causes

First audit the existing implementation and identify:





Performance bottlenecks.



Slow API/database operations.



Excessive requests.



Rendering problems.



Missing shared logic.



Duplicate logic.



Dynamic field/data dependency gaps.



Date/time/timestamp gaps.



Permission/visibility gaps.



Sidebar state/responsive logic problems.

Priority 2 — Fix shared architecture

Create/fix reusable application-wide systems for:





Data fetching.



Loading states.



Error/retry handling.



Dynamic dependencies.



Conditional fields/sections.



Date/time/timestamps.



Role/scope-based field visibility.



Sidebar state management.

Priority 3 — Apply shared systems throughout the application

After the shared logic is correct, apply it consistently to:





POS.



GRN.



PO.



Forms.



Tables.



Settings.



Customers.



Products.



Suppliers.



Other application modules.

Priority 4 — Verify

After implementation, verify the behavior across:





Local environment.



Self-hosted environment.



Desktop.



Laptop.



Tablet/mobile.



Different user roles/scopes.



Large datasets.



Dropdowns with many options.



Forms with dependent fields.



Slow/failed API requests.

Final Requirement

Do not just patch the visible symptoms.

First identify the underlying architectural/shared logic problems, fix them at the reusable application-wide level, and then make sure the affected modules consume that shared logic consistently.

The most important immediate issues are:





Extremely slow data fetching and UI response.



Missing action-specific loading/progress states.



Requests sometimes hanging/failing and showing retry.



Missing application-wide dynamic/data-aware field and UI logic.



Missing configurable timestamps/time display.



Missing global field/data visibility controls.



Role/scope-based protection of sensitive fields such as cost price and customer information.



Sidebar collapse/expand behavior still incorrect.



Desktop partial-collapse state must show icons only, not icon + text.



Off-canvas sidebar needs proper show/hide behavior.

Please identify these issues first, fix the shared/core logic, and then apply the fixes application-wide rather than implementing isolated fixes on individual pages.



create todos, divide in small tests, tasks . to avoid long wait, to avoid sandbox hang time out etc.