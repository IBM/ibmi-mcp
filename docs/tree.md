# mcp-ts-template - Directory Structure

Generated on: 2025-05-22 12:30:55

```
mcp-ts-template
├── .github
│   └── workflows
│       └── publish.yml
├── docs
│   ├── api-references
│   │   ├── jsdoc-standard-tags.md
│   │   └── typedoc-reference.md
│   └── tree.md
├── scripts
│   ├── clean.ts
│   ├── fetch-openapi-spec.ts
│   ├── make-executable.ts
│   └── tree.ts
├── src
│   ├── config
│   │   └── index.ts
│   ├── mcp-client
│   │   ├── client.ts
│   │   ├── configLoader.ts
│   │   ├── index.ts
│   │   ├── mcp-config.json
│   │   ├── mcp-config.json.example
│   │   └── transport.ts
│   ├── mcp-server
│   │   ├── resources
│   │   │   └── echoResource
│   │   │       ├── echoResourceLogic.ts
│   │   │       ├── index.ts
│   │   │       └── registration.ts
│   │   ├── tools
│   │   │   └── echoTool
│   │   │       ├── echoToolLogic.ts
│   │   │       ├── index.ts
│   │   │       └── registration.ts
│   │   ├── transports
│   │   │   ├── authentication
│   │   │   │   └── authMiddleware.ts
│   │   │   ├── httpTransport.ts
│   │   │   └── stdioTransport.ts
│   │   └── server.ts
│   ├── services
│   │   ├── llm-providers
│   │   │   ├── geminiAPI
│   │   │   │   ├── geminiService.ts
│   │   │   │   └── index.ts
│   │   │   ├── openRouter
│   │   │   │   ├── index.ts
│   │   │   │   └── openRouterProvider.ts
│   │   │   ├── index.ts
│   │   │   └── llmFactory.ts
│   │   └── index.ts
│   ├── types-global
│   │   └── errors.ts
│   ├── utils
│   │   ├── internal
│   │   │   ├── errorHandler.ts
│   │   │   ├── index.ts
│   │   │   ├── logger.ts
│   │   │   └── requestContext.ts
│   │   ├── metrics
│   │   │   ├── index.ts
│   │   │   └── tokenCounter.ts
│   │   ├── parsing
│   │   │   ├── dateParser.ts
│   │   │   ├── index.ts
│   │   │   └── jsonParser.ts
│   │   ├── security
│   │   │   ├── idGenerator.ts
│   │   │   ├── index.ts
│   │   │   ├── rateLimiter.ts
│   │   │   └── sanitization.ts
│   │   └── index.ts
│   └── index.ts
├── .clinerules
├── .dockerignore
├── .gitignore
├── CHANGELOG.md
├── Dockerfile
├── LICENSE
├── mcp.json
├── package-lock.json
├── package.json
├── README.md
├── repomix.config.json
├── smithery.yaml
├── tsconfig.json
├── tsconfig.typedoc.json
├── tsdoc.json
└── typedoc.json
```

_Note: This tree excludes files and directories matched by .gitignore and default patterns._
