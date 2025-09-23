# Tasks: Documentation Improvement and Restructuring

**Input**: Design documents from `/specs/002-update-and-improve/`
**Prerequisites**: plan.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

## Execution Flow (main)

Based on analysis of available design documents:
- ✅ plan.md: Mintlify platform, MDX content, documentation structure
- ✅ data-model.md: Documentation pages, navigation, code examples, diagrams
- ✅ contracts/: documentation-validation.yaml for content quality assurance
- ✅ research.md: Mintlify best practices, IBM i enterprise patterns
- ✅ quickstart.md: 2-hour implementation guide with validation steps

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Documentation project structure: `docs/` at repository root

## Phase 3.1: Setup and Foundation

- [x] **T001** Backup existing docs directory and create new documentation structure
- [x] **T002** Create Mintlify configuration file `docs/docs.json` with navigation structure (Updated with IBM i MCP Server structure)
- [x] **T003** [P] Install Mintlify CLI and verify development environment setup
- [x] **T004** [P] Start Mintlify local development server (`mintlify dev`) for iterative testing
- [x] **T005** [P] Setup Playwright MCP server connection for automated browser testing

## Phase 3.2: Content Validation Framework (TDD) ⚠️ MUST COMPLETE BEFORE 3.3

**CRITICAL: These validation contracts MUST be implemented and MUST FAIL before ANY content creation**

- [x] **T006** [P] Content validation contract test for documentation pages in `docs/test/content-validation.test.js` (SKIPPED per user request)
- [x] **T007** [P] Link validation contract test for internal/external links in `docs/test/link-validation.test.js` (SKIPPED per user request)
- [x] **T008** [P] Code example validation contract test for syntax verification in `docs/test/code-validation.test.js` (SKIPPED per user request)
- [x] **T009** [P] Mermaid diagram validation contract test for rendering verification in `docs/test/diagram-validation.test.js` (SKIPPED per user request)
- [x] **T010** [P] Quickstart completion time validation test (≤15 minutes) in `docs/test/quickstart-validation.test.js` (SKIPPED per user request)
- [x] **T011** [P] Playwright browser automation test for live documentation validation via Mintlify dev server (SKIPPED per user request)

## Phase 3.3: Core Documentation Pages (ONLY after validation tests are failing)

### Foundation Pages
- [x] **T012** [P] Landing page content in `docs/index.mdx` with IBM i MCP Server introduction
- [ ] **T013** Playwright validation: Test landing page renders correctly with proper navigation
- [x] **T014** [P] Quickstart guide in `docs/quickstart.mdx` based on README.md content with ≤15 minute completion
- [ ] **T015** Playwright validation: Test quickstart guide navigation and code block rendering
- [ ] **T016** [P] Configuration reference in `docs/configuration.mdx` with all environment variables
- [ ] **T017** Playwright validation: Test configuration page layout and searchability

### Core Concepts
- [ ] **T018** [P] Server architecture documentation in `docs/concepts/architecture.mdx` with Mermaid diagrams
- [ ] **T019** Playwright validation: Test Mermaid diagram rendering and responsiveness in architecture page
- [ ] **T020** [P] MCP overview for newcomers in `docs/concepts/mcp-overview.mdx`
- [ ] **T021** Playwright validation: Test MCP overview page accessibility and content structure

### SQL Tools Documentation
- [ ] **T022** [P] SQL tools overview in `docs/sql-tools/overview.mdx` with YAML introduction
- [ ] **T023** Playwright validation: Test SQL tools overview navigation and code examples
- [ ] **T024** [P] Building SQL tools guide in `docs/sql-tools/building-tools.mdx` with complete examples
- [ ] **T025** Playwright validation: Test YAML code highlighting and copy-to-clipboard functionality
- [ ] **T026** [P] Testing and development guide in `docs/sql-tools/testing.mdx`
- [ ] **T027** Playwright validation: Test testing guide workflow and development examples
- [ ] **T028** [P] Use cases and examples in `docs/sql-tools/examples.mdx` with working scenarios
- [ ] **T029** Playwright validation: Test use cases examples and scenario walkthroughs

### Agent Development
- [ ] **T030** [P] Agent building guide in `docs/agents/building-agents.mdx` with MCP client patterns
- [ ] **T031** Playwright validation: Test agent guide code blocks and download links
- [ ] **T032** [P] Agent examples in `docs/agents/examples.mdx` with complete implementations
- [ ] **T033** Playwright validation: Test agent examples rendering and GitHub integration

### Deployment Documentation
- [ ] **T034** [P] Development environment setup in `docs/deployment/development.mdx`
- [ ] **T035** Playwright validation: Test development setup instructions and command blocks
- [ ] **T036** [P] Docker deployment guide in `docs/deployment/docker.mdx` with MCP Context Forge
- [ ] **T037** Playwright validation: Test Docker guide container visualization and setup flow
- [ ] **T038** [P] Production deployment in `docs/deployment/production.mdx` with security hardening
- [ ] **T039** Playwright validation: Test production guide security sections and checklists

### API Reference
- [ ] **T040** [P] MCP endpoints documentation in `docs/api/mcp-endpoints.mdx`
- [ ] **T041** Playwright validation: Test API documentation interactive elements and examples
- [ ] **T042** [P] Authentication endpoints in `docs/api/auth-endpoints.mdx` with IBM i HTTP auth flow
- [ ] **T043** Playwright validation: Test authentication flow diagrams and endpoint documentation

## Phase 3.4: Integration and Cross-References

- [ ] **T044** Integrate navigation cross-references between related documentation pages
- [ ] **T045** Playwright validation: Test cross-reference links and navigation flow between pages
- [ ] **T046** Add Mermaid architecture diagrams to concepts/architecture.mdx and relevant sections
- [ ] **T047** Playwright validation: Test all Mermaid diagrams render correctly across different screen sizes
- [ ] **T048** Implement code example syntax highlighting and validation across all pages
- [ ] **T049** Playwright validation: Test code block syntax highlighting and copy functionality
- [ ] **T050** Create IBM i authority and security context throughout documentation
- [ ] **T051** Playwright validation: Test security warning boxes and context-sensitive help

## Phase 3.5: Quality Assurance and Polish

- [ ] **T052** [P] Run content validation tests and fix all identified issues
- [ ] **T053** [P] Run link validation tests and update broken references
- [ ] **T054** [P] Verify code examples execute correctly against actual server implementation
- [ ] **T055** [P] Validate Mermaid diagrams render properly in Mintlify environment
- [ ] **T056** Test quickstart guide completion time with new user (target ≤15 minutes)
- [ ] **T057** Playwright validation: Simulate complete user journey through quickstart guide
- [ ] **T058** [P] SEO optimization: verify meta descriptions, titles, and keyword usage
- [ ] **T059** Playwright validation: Test search functionality and keyword relevance
- [ ] **T060** [P] Responsive design verification across desktop, tablet, and mobile
- [ ] **T061** Playwright validation: Test responsive breakpoints and mobile navigation
- [ ] **T062** Final content review for IBM i enterprise context and accuracy
- [ ] **T063** Playwright validation: Comprehensive site testing including performance and accessibility

## Dependencies

**Sequential Dependencies**:
- T001 → T002 → T003 → T004 → T005 (setup sequence)
- T006-T011 → All content creation tasks (validation framework before implementation)
- T012-T043 → T044-T051 (content before integration)
- T044-T051 → T052-T063 (integration before polish)

**Blocking Dependencies**:
- T002 blocks T012 (Mintlify config before landing page)
- T004 blocks all Playwright validations (Mintlify dev server must be running)
- T005 blocks all Playwright validations (Playwright MCP connection required)
- T044 blocks T052 (cross-references before content validation)
- T048 blocks T054 (syntax highlighting before code validation)

**Playwright Testing Dependencies**:
- Each content task (T012, T014, T016, etc.) must complete before its Playwright validation
- T004 (Mintlify dev server) must be running for all Playwright tasks
- T005 (Playwright MCP setup) enables automated browser testing throughout

## Parallel Execution Examples

**Setup Phase (Sequential then parallel)**:
```bash
# Sequential setup (T001-T005)
Task: "Backup existing docs directory and create new documentation structure"  # T001
Task: "Create Mintlify configuration file docs/docs.json with navigation structure"  # T002
Task: "Install Mintlify CLI and verify development environment setup"  # T003
Task: "Start Mintlify local development server (mintlify dev) for iterative testing"  # T004
Task: "Setup Playwright MCP server connection for automated browser testing"  # T005

# Content validation setup (T006-T011 in parallel after T005)
Task: "Content validation contract test for documentation pages in docs/test/content-validation.test.js"
Task: "Link validation contract test for internal/external links in docs/test/link-validation.test.js"
Task: "Code example validation contract test for syntax verification in docs/test/code-validation.test.js"
Task: "Mermaid diagram validation contract test for rendering verification in docs/test/diagram-validation.test.js"
Task: "Quickstart completion time validation test (≤15 minutes) in docs/test/quickstart-validation.test.js"
Task: "Playwright browser automation test for live documentation validation via Mintlify dev server"
```

**Iterative Content Creation (Content → Playwright validation pattern)**:
```bash
# Foundation pages with immediate validation
Task: "Landing page content in docs/index.mdx with IBM i MCP Server introduction"  # T012
Task: "Playwright validation: Test landing page renders correctly with proper navigation"  # T013

Task: "Quickstart guide in docs/quickstart.mdx based on README.md content"  # T014
Task: "Playwright validation: Test quickstart guide navigation and code block rendering"  # T015

# SQL Tools section with validation
Task: "SQL tools overview in docs/sql-tools/overview.mdx with YAML introduction"  # T022
Task: "Playwright validation: Test SQL tools overview navigation and code examples"  # T023

Task: "Building SQL tools guide in docs/sql-tools/building-tools.mdx with complete examples"  # T024
Task: "Playwright validation: Test YAML code highlighting and copy-to-clipboard functionality"  # T025
```

**Quality Assurance Phase (Comprehensive testing)**:
```bash
# Final validation with Playwright integration (T052-T063)
Task: "Run content validation tests and fix all identified issues"  # T052
Task: "Run link validation tests and update broken references"  # T053
Task: "Verify code examples execute correctly against actual server implementation"  # T054
Task: "Playwright validation: Simulate complete user journey through quickstart guide"  # T057
Task: "Playwright validation: Test search functionality and keyword relevance"  # T059
Task: "Playwright validation: Test responsive breakpoints and mobile navigation"  # T061
Task: "Playwright validation: Comprehensive site testing including performance and accessibility"  # T063
```

## Task Generation Rules Applied

**From Contracts** (documentation-validation.yaml):
- Content validation → T006 contract test
- Link validation → T007 contract test
- Code validation → T008 contract test
- Diagram validation → T009 contract test
- Quickstart validation → T010 contract test
- Playwright automation → T011 browser validation test

**From Data Model** (data-model.md entities):
- Documentation Page → T012-T043 content creation tasks with Playwright validation
- Navigation Structure → T002 configuration and T044 cross-references
- Code Example → T048 syntax highlighting and T054 validation
- Mermaid Diagram → T046 integration and T055 validation
- Configuration Reference → T016 environment variables

**From User Stories** (spec.md scenarios):
- 15-minute quickstart → T014 creation and T056-T057 validation
- SQL tool creation → T024 building guide with T025 Playwright validation
- Agent development → T030 building guide with T031 Playwright validation
- Deployment scenarios → T034-T038 deployment guides with Playwright validation
- Troubleshooting support → T062 enterprise context review

**Playwright Integration Pattern**:
- Each content creation task followed by immediate Playwright validation
- Iterative testing enables real-time quality assurance
- Browser automation ensures consistent user experience
- Performance and accessibility testing throughout development

## Validation Checklist

_GATE: Checked before task execution_

- [x] All contracts have corresponding tests (T006-T011)
- [x] All entities have content creation tasks (T012-T043)
- [x] All tests come before implementation (T006-T011 → T012-T043)
- [x] Parallel tasks truly independent (different file paths)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] All requirements from specification addressed
- [x] Enterprise IBM i context maintained throughout
- [x] Quality assurance and validation included
- [x] Playwright integration provides iterative browser testing
- [x] Local Mintlify development server enables real-time validation

## Notes

- **[P] tasks** = different files, no shared dependencies
- **Iterative validation**: Each content creation task followed by immediate Playwright testing
- **Content validation first**: All validation tests must fail before content creation
- **Code accuracy**: All examples must be verified against actual server implementation
- **Enterprise focus**: IBM i authority requirements and enterprise context throughout
- **Quality gates**: Each phase includes validation before proceeding
- **Time target**: Quickstart guide must complete in ≤15 minutes
- **Fresh content**: No migration from existing docs, start completely fresh
- **Browser automation**: Playwright MCP server enables automated UI/UX validation
- **Real-time feedback**: Local Mintlify dev server provides immediate visual feedback