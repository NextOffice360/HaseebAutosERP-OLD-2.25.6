Resume the previous work first. Inspect the current workspace/code and determine what has already been completed, what remains incomplete, and what is broken. Continue from the current state—do not restart or unnecessarily rebuild working features.

Please execute this task using a rigorous, multi-phase approach. Do not attempt to provide a rapid or summarized response; instead, divide the work into distinct, sequential stages. Complete each phase entirely before proceeding to the next. After completing each stage, perform a thorough cross-check and verification of all logic, mathematical formulas, and reasoning to ensure absolute accuracy. Do not skip any steps or take shortcuts.

This is a Google Apps Script Web App + Google Sheets database + HTML/CSS/JavaScript application. Act as a senior full-stack engineer, UI/UX/product designer, ERP/POS architect and performance engineer.

CORE RULE

Investigate first → identify root causes → implement fixes → integrate with real Sheets/Apps Script data → test end-to-end → mark complete → continue with remaining incomplete work.

Do not merely describe issues. Fix and verify them. Preserve existing business logic/data unless a verified correction is required.

1. Global UI/UX + Performance

Upgrade the entire application to a premium, modern, fast, intuitive, responsive, PWA-ready ERP/POS experience.

Audit every page, dashboard, tab, sub-tab, card, field, table, modal, offcanvas, chart and control.
Fix typography, spacing, alignment, overflow, clipping, wrapping and inconsistent sizing.
Automatically adapt text/layout to available space; never allow overlap/truncation.
Responsive desktop/tablet/mobile + sidebar expanded/collapsed states.
Optimize Apps Script calls, Sheets operations, rendering, caching and async loading.
Eliminate preloader/UI flickering and unnecessary reloads.
Add clear loading/progress states with meaningful titles.
Use modern error handling: Toast, Snackbar, Banner, Notification/Push, Tooltip/Popover and Modal/Dialog where appropriate.
Support useful links/tabs opening in new tabs.
Make all modals/offcanvas appropriately wide for their actual content.
Make every dedicated app full-featured, data-aware, practical and easy enough for non-technical users, adding genuinely useful modern ERP/POS capabilities where missing—without unnecessary feature bloat.
2. Global Navigation + State Persistence

Critical global rule: after Save/Update/Delete/Refresh operations, remain on the same active page, tab, sub-tab and working section. Never unexpectedly return to the first tab/page.

Buttons must show appropriate Saving / Loading / Processing / Success / Failed states.

3. Financial Display

Replace ambiguous abbreviations such as 20.67 L with clear formats such as Rs. 20.67 Lakhs and consistently format Crores/Rupees throughout the application.

Example:
Potential Margin: Rs. 20.67 Lakhs
Retail Value: Rs. 1.03 Crore (Rs. 10,328,802)

4. Charts / Cards / Tables

Fix every chart/card text collision, especially values such as:

Udhaar Recovery Rs. 2,500 / Rs. 2,828

Use responsive sizing, wrapping, ellipsis and intelligent font scaling based on available space. Audit all tables so headers and row data align correctly vertically/horizontally with consistent column widths, spacing and responsive behavior.

5. Sales / Credit / Invoice Logic

Correct Sale Invoice behavior:

Paid Now means Cash Paid, never “Credit/Udhaar Paid”.
Example: Previous Balance Rs.2,490 + Invoice Rs.338 − Cash Paid Rs.10 = Closing Balance Rs.2,818.
Allow a sale without entering Paid Now when the customer's available credit limit permits it.
Block the sale only when the resulting outstanding balance exceeds the customer's credit limit.
Clearly show Cash Paid, Current Due, Previous Balance and Closing Balance.
Verify all related formulas, customer balances and transaction history against the real database.

Fix responsive Wada kiya gaya date / promised date field and remove excessive block height.

6. Products / Quick View / Favorites
Add Category after Product Code in product cards.
Product image: click to enlarge.
Upgrade Product Quick View Modal with useful missing information such as SKU/code, category, brand, stock, units/conversion, retail/wholesale price, cost, margin, supplier, sales history, stock status and relevant actions—based on available data.
Favorites must visibly change icon + badge/status styling.
7. Product Selection

Upgrade all relevant dropdown/search lists:

Multi-select products with checkboxes.
Quantity input per selected product.
Keep dropdown open until clicking outside.
Allow both typing/searching and a dedicated Product List icon/button.
Auto-fetch and populate related information based on selection.
Hide irrelevant empty information and show populated data contextually.
8. Purchase Orders / GRN / Inventory

Fix missing supplier lists and real database integration.

Support:

Supplier selection.
Retail Price.
Wholesale Price.
Purchase Price.
Conversion Unit.
Automatic conversion calculations.

Example: 1 PCS = Rs.250; 1 BOX = 12 PCS → Box Price = Rs.3,000 automatically.

Apply this consistently across PO, GRN, Inventory and every relevant business workflow.

Audit and fix all toggles/switches: every toggle must have a clear label, correct state, accessible styling and working logic. Use simple, understandable English for labels, titles, descriptions and hints.

9. Auto Reorder + AI Monitoring

Fix Auto Reorder so it actually reads live inventory data and detects:

Low/out-of-stock products
Reorder requirements
Stock trends
Suggested quantities
Relevant alerts

Connect AI monitoring to real data so the AI Assistant can detect and explain actionable inventory/supplier signals.

10. AI Agent / AI Assistant

Completely simplify and polish AI Agent/Assistant configuration.

It must be easy to understand, easy to configure and functional, with sensible presets for major providers/services.

Fix:

Missing provider/model lists.
Gemini, OpenAI, OpenRouter, Local/Ollama, Mock and other supported integrations.
Dynamic/current model discovery where supported + sensible manual model fallback.
API-key saving/loading and secure Apps Script configuration/storage.
Provider connection testing.
Clear status/error messages.
Useful defaults/presets.
Actual AI Agent/Assistant execution and data access.

Do not make users configure unnecessary technical fields. Expose only settings required for the selected provider/use case.

11. Customers / Suppliers / History

Add complete data-aware history sections:

Customers: sales, invoices, payments, dues, balances, payment history, totals.

Suppliers: purchase history, invoices/GRNs, quantities, purchase prices and product-level supplier price comparisons.

Show Total Sales/Purchases and Amount in relevant customer/supplier listings and portals.

Add useful alerts and AI analysis for supplier price variation and purchasing signals. Where supported by real historical data, provide supplier comparison and purchasing recommendations based on price/history—not fabricated data.

12. Salesman Stock / Udhaar Wasooli

Use clear labels such as ISSUE STOCK and RETURN STOCK.

Add salesman route creation/assignment/management.

For Udhaar Wasooli, fetch live customer lists and outstanding balances from the real Customers DB. Show previous payments, dates, amounts and complete payment history so the salesman can understand the customer's account while collecting dues.

13. Insights & Dashboards

Rename “Insights & Shop” to a clear, self-explanatory “Insights & Dashboards”.

Expand it with genuinely useful dashboard information/KPIs, trends, sales, purchases, profit/margin, receivables, inventory, low-stock/reorder signals, supplier/customer insights and other relevant operational intelligence using real data.

14. Automation & AI Bottom Bar

Fix and redesign the broken/messy bottom control bar currently appearing like:

Save AI assistant ↺ Reset tab { } Keys 24 settings

Make it clean, aligned, responsive, understandable and fully functional.

15. Backend / Integration Audit

Perform a global wiring audit:

Every tab, sub-tab, button, form, field, calculation, formula, navigation, modal, dropdown, Apps Script function, API call, Sheet read/write, relationship and business rule must be traced and verified.

No mock UI pretending to work. Dedicated apps must connect to the real Sheets/database and execute real business logic.

16. Final QA + Deliverables

After each completed task, verify it and mark it complete, then continue with the remaining incomplete tasks.

Before finalizing:

Test complete application flows end-to-end.
Recheck formulas, calculations, relationships and business logic.
Test responsive layouts and PWA behavior.
Test loading/error/empty/success states.
Check browser console/runtime errors.
Verify frontend ↔ Apps Script ↔ Sheets integration.
Perform regression testing so existing functionality is not broken.

When creating the ZIP/package, actually generate it in the workspace with a clear version number and ensure all updated files are included. Verify that the ZIP exists and contains the final updated application before reporting completion.

Goal: a fast, premium, responsive, PWA-ready, full-featured, data-aware and production-ready ERP/POS application with modern UI/UX, reliable backend integration and significantly better usability than the current implementation.