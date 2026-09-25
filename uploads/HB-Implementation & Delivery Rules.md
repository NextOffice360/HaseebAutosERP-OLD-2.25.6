Implementation & Delivery Rules

Before every task: Read the latest plans, TODOs, requirements, worklogs, architecture docs, and relevant code. Never start implementation from assumptions.

Research when needed: For tools, dependencies, APIs, security, deployment, calculations, frameworks, and technical decisions, perform deep research using official documentation and authoritative guides. Record useful references and official links in the project documentation.

Plan first: Maintain a structured, prioritized Requirements + TODO + Worklog system. Identify dependencies and critical-path tasks first, especially anything affecting functionality, security, data integrity, deployment, or production readiness.

Implement systematically: Work task-by-task in small, manageable units. You are authorized to inspect, modify, refactor, debug, test, document, and validate the code without repeatedly asking for permission.

Protect existing functionality: Never delete or break existing features, business logic, calculations, workflows, APIs, permissions, data structures, or working UI. Improvements must be additive or safely refactored with equivalent behavior preserved.

Verification gate: A task is NOT complete until implementation, integration, regression tests, UI/UX checks, error handling, security checks, and deployment validation pass. Do not mark partially implemented or unverified work as complete.

Task tracking: Update TODOs, requirements, worklogs, implementation plans, and documentation continuously. Mark a task Complete only after all acceptance criteria and verification gates pass; otherwise keep it In Progress or Blocked with the exact reason.

Resumeability: Keep all work traceable and resumable so the next session can immediately determine what was completed, what remains, dependencies, failures, and the correct next task—without rediscovering the project state.

Testing discipline: After every meaningful change, run the relevant tests and regression checks. Fix failures before moving to dependent tasks. Never leave known errors, warnings, broken flows, orphaned code, dead UI controls, or incomplete integrations.

Production readiness: Continuously validate configuration, dependencies, database/API contracts, permissions, security, responsiveness, PWA behavior, Responsive UI/UX, deployment, caching, and environment-specific behavior.

Git discipline: Keep the Git repository continuously updated with verified changes. Use clear, meaningful commits and ensure the repository reflects the current tested implementation.

Deliverables: Keep the release/build ZIP and all deployment artifacts synchronized with the verified implementation. Never deliver stale, partially updated, or mismatched artifacts.

Documentation: Maintain beginner-friendly, user-friendly documentation covering architecture, features, configuration, setup, dependencies, troubleshooting, deployment, security, workflows, and recovery. Include official documentation/reference links wherever applicable.

No shortcuts: Do not skip tests, documentation, migration steps, dependency checks, deployment checks, or integration work merely to finish faster.

Final rule: No task is finished, no feature is delivered, and no release is produced until the implementation is complete, verified, documented, deployable, and reflected consistently across code, tests, Git, worklogs, and deliverables.