# IBM i MCP Server Constitution
Project goal: make it easy to build MCP tools and agents for IBM i systems.

## Core Principles

### Simplicity & Ergonomics
The IBM i MCP Server prioritizes ease of use and developer experience. Every change should simplify tool creation, expand IBM i coverage, or harden reliability for downstream agent builders.

### Thoughtful Customization
Configurations and extensions should be intuitive and well-documented, enabling users to tailor the server to their specific IBM i environments without unnecessary complexity.

### Security First
The IBM i MCP Server is designed with security as a top priority. All components must adhere to best practices for authentication, authorization, and data protection. This includes:

- Implementing robust authentication mechanisms (e.g., OAuth, API keys).
- Enforcing least privilege access controls for all users and services.
- Regularly auditing and updating dependencies to mitigate vulnerabilities.

### Testability & Reliability
The IBM i MCP Server must be thoroughly tested to ensure reliability and stability. Use `npm run test` for fast feedback, `npm run test:coverage` before merging, and `npm run lint`/`npm run format` to uphold Prettier + ESLint defaults. Place suites under `tests/mcp-server/` or service directories, and ensure integration specs cover logic/registration separation plus SQL security checks.

### Observability & Maintainability
The IBM i MCP Server should provide clear logging, monitoring, and diagnostic capabilities to facilitate maintenance and troubleshooting. This includes structured logging, metrics collection, and health checks.

### IBM i System Respect
The IBM i MCP Server operates within enterprise IBM i environments with unique characteristics. AI agents must understand that IBM i systems prioritize stability, security, and data integrity above rapid iteration.

### Enterprise-First Design
IBM i systems are mission-critical enterprise platforms. Every feature must be designed with enterprise operational requirements in mind:
- Assume multiple users with varying authority levels will use tools
- Design for auditability - all significant operations should be traceable
- Consider integration with existing enterprise change management processes
- Prioritize data consistency and transactional integrity over convenience
- Plan for regulated environments where compliance matters more than features

### Clarity Over Cleverness
Code written for this project will be maintained by IBM i professionals who value reliability and understandability:
- Choose explicit, verbose solutions over implicit, clever ones
- Favor established patterns over novel approaches
- Write code that clearly expresses its intent to future maintainers
- Document decisions that aren't obvious from the code itself
- IBM i professionals often work with decades-old systems - write code with that longevity mindset

### Composable Tool Architecture
MCP tools should enhance IBM i workflows by working together seamlessly:
- Each tool should solve a specific, well-defined problem
- Tools should produce outputs that naturally feed into other tools
- Avoid monolithic tools that try to solve multiple unrelated problems
- Design tools to complement existing IBM i tooling (RDi, Navigator, command line) rather than replace them
- Consider how tools will be used in automated workflows and scripting contexts


## Mapeire Compatibility
The IBM i MCP Server is built with Mapepire, a open source database access layer for IBM i. Ensure all features and extensions are compatible with Mapepire's architecture and design principles.
- Mapepire documentation: https://mapepire-ibmi.github.io/
- Mapepire GitHub: https://github.com/Mapepire-IBMi/mapepire-server
- JavaScript client: https://github.com/Mapepire-IBMi/mapepire-js

## Development Workflow

### AI Agent Contribution Process
When AI agents contribute code to this project, they must follow a structured workflow:

1. **Read Before Writing**: Always examine existing code patterns and architectural decisions before implementing new features
2. **Follow CLAUDE.md**: Reference the technical architectural standards for implementation details
3. **Test Integration First**: Prioritize integration tests that validate real system behavior over mocked unit tests
4. **Document Decisions**: Explain non-obvious implementation choices for future maintainers
5. **Enterprise Validation**: Consider how changes affect enterprise environments and regulatory compliance

### Quality Gates

All AI contributions must pass these quality gates before integration:

1. **Technical Standards**: Code must follow patterns established in CLAUDE.md architectural guidelines
2. **Security Review**: IBM i-specific security considerations must be addressed
3. **Integration Testing**: Changes must include integration tests that validate real system behavior
4. **Enterprise Impact**: Consider auditability, change management, and compliance requirements
5. **Mapepire Compatibility**: Ensure database interactions remain compatible with Mapepire architecture

## Governance
Constitution supersedes all other practices; Amendments require documentation, approval, migration plan.

All changes to this constitution must be documented, approved by the core maintainers, and include a migration plan if necessary.

**Version**: 0.1.0 | **Ratified**: 2025-09-16 | **Last Amended**: 2025-09-16