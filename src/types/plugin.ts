/**
 * Plugin-related type definitions.
 * Represents plugin manifests, load results, and component paths.
 */

/**
 * Plugin error types for categorizing failures.
 */
export type PluginErrorType =
  | "manifest_not_found"
  | "manifest_parse_error"
  | "manifest_validation"
  | "component_discovery"
  | "skill_parse_error"
  | "agent_parse_error"
  | "command_parse_error"
  | "hook_config_error"
  | "mcp_connection_failed"
  | "mcp_auth_required"
  | "mcp_timeout"
  | "timeout"
  | "permission_denied"
  | "unknown";

/**
 * Status of an MCP server connection.
 */
export interface McpServerStatus {
  name: string;
  status: "connected" | "failed" | "pending" | "needs-auth";
  tools: string[];
  error?: string;
}

/**
 * Diagnostic information about plugin loading.
 */
export interface PluginLoadDiagnostics {
  manifest_found: boolean;
  manifest_valid: boolean;
  components_discovered: {
    skills: number;
    agents: number;
    commands: number;
    hooks: boolean;
    mcp_servers: number;
  };
  load_duration_ms: number;
}

/**
 * Result of attempting to load a plugin.
 */
export interface PluginLoadResult {
  loaded: boolean;
  plugin_name: string | null;
  plugin_path: string;
  registered_tools: string[];
  registered_commands: string[];
  registered_skills: string[];
  registered_agents: string[];
  mcp_servers: McpServerStatus[];
  session_id: string;
  error?: string;
  error_type?: PluginErrorType;
  recovery_hint?: string;
  diagnostics?: PluginLoadDiagnostics;
}

/**
 * Plugin manifest (plugin.json) structure.
 */
export interface PluginManifest {
  name: string;
  version?: string;
  description?: string;
  commands?: string | string[];
  agents?: string | string[];
  hooks?: string;
  mcpServers?: string;
}

/**
 * Resolved component paths from plugin manifest.
 */
export interface ResolvedPaths {
  commands: string[];
  agents: string[];
  skills: string[];
  hooks: string | null;
  mcpServers: string | null;
}

/**
 * Preflight validation error.
 */
export interface PreflightError {
  code:
    | "PATH_NOT_FOUND"
    | "PATH_RESOLUTION_FAILED"
    | "MANIFEST_NOT_FOUND"
    | "MANIFEST_PARSE_ERROR"
    | "MANIFEST_INVALID";
  message: string;
  suggestion: string;
}

/**
 * Preflight validation warning.
 */
export interface PreflightWarning {
  code: string;
  message: string;
}

/**
 * Result of preflight validation.
 */
export interface PreflightResult {
  valid: boolean;
  pluginPath: string;
  resolvedPath: string;
  manifestPath: string;
  pluginName: string | null;
  errors: PreflightError[];
  warnings: PreflightWarning[];
}
