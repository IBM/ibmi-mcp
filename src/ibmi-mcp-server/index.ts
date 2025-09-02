import { config } from "@/config/index.js";
import { YamlToolsLoader } from "./utils/yaml/yamlToolsLoader.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Lazy initialization of YAML tools dependencies
 * Only loads when YAML tools are actually needed
 */
async function initializeYamlDependencies() {
  const { SourceManager } = await import(
    "../ibmi-mcp-server/services/sourceManager.js"
  );
  const { ToolsetManager } = await import(
    "@/ibmi-mcp-server/utils/yaml/toolsetManager.js"
  );
  const { YamlToolFactory } = await import(
    "@/ibmi-mcp-server/utils/yaml/yamlToolFactory.js"
  );

  return {
    sourceManager: SourceManager.getInstance(),
    toolsetManager: ToolsetManager.getInstance(),
    toolFactory: YamlToolFactory.getInstance(),
  };
}

export const registerSQLTools = async (server: McpServer): Promise<void> => {
  // Load YAML tools if configured
  if (config.toolsYamlPath) {
    // Import required dependencies
    const dependencies = await initializeYamlDependencies();

    // Create loader with dependencies
    const yamlLoader = YamlToolsLoader.createInstance({
      sourceManager: dependencies.sourceManager,
      toolsetManager: dependencies.toolsetManager,
      toolFactory: dependencies.toolFactory,
    });

    await yamlLoader.loadAndRegisterTools(
      server
    );
  }
};
