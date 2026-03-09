import { readFileSync } from "node:fs";
import { resolve, basename, join } from "node:path";
import { platform, arch } from "node:os";
import { pathToFileURL } from "node:url";
import {
  InitializeRequest,
  InitializedNotification,
  DidOpenTextDocumentNotification,
  DidCloseTextDocumentNotification,
  ShutdownRequest,
  ExitNotification,
  PublishDiagnosticsNotification,
  type InitializeParams,
  type MessageConnection,
  type Diagnostic,
  NotificationType,
  RequestType,
  DiagnosticSeverity,
} from "vscode-languageserver-protocol/node.js";

export interface DiagnosticResult {
  uri: string;
  filePath: string;
  diagnostics: Diagnostic[];
}

export interface AnalysisOptions {
  files: string[];
  workspaceFolder: string;
  vendorPath: string;
  verbose?: boolean;
  timeout?: number;
}

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".php": "php",
  ".cs": "csharp",
  ".html": "html",
  ".htm": "html",
  ".xml": "xml",
  ".css": "css",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".json": "json",
  ".tf": "terraform",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
};

function getLanguageId(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf("."));
  return LANGUAGE_MAP[ext] ?? "plaintext";
}

/**
 * Register handlers for server-to-client requests that SonarLint expects.
 * The server will send these requests and if unhandled, errors occur.
 */
function registerClientHandlers(connection: MessageConnection) {
  // sonarlint/listFilesInFolder — server asks for files in a folder
  connection.onRequest(
    new RequestType<
      { folderUri: string },
      { foundFiles: Array<{ fileName: string; filePath: string }> },
      void
    >("sonarlint/listFilesInFolder"),
    (_params) => {
      return { foundFiles: [] };
    },
  );

  // sonarlint/getJavaConfig — server asks for Java project config
  connection.onRequest(
    new RequestType<{ fileUri: string }, null, void>("sonarlint/getJavaConfig"),
    (_params) => {
      return null;
    },
  );

  // sonarlint/isIgnoredByScm — server asks if file is gitignored
  connection.onRequest(
    new RequestType<{ fileUri: string }, boolean, void>(
      "sonarlint/isIgnoredByScm",
    ),
    (_params) => {
      return false;
    },
  );

  // sonarlint/shouldAnalyseFile — server asks if file should be analyzed
  connection.onRequest(
    new RequestType<{ uri: string }, boolean, void>(
      "sonarlint/shouldAnalyseFile",
    ),
    (_params) => {
      return true;
    },
  );

  // sonarlint/filterOutExcludedFiles — server asks to filter files
  connection.onRequest(
    new RequestType<{ fileUris: string[] }, { fileUris: string[] }, void>(
      "sonarlint/filterOutExcludedFiles",
    ),
    (params) => {
      return { fileUris: params.fileUris };
    },
  );

  // sonarlint/canShowMissingRequirementsNotification
  connection.onRequest(
    new RequestType<void, boolean, void>(
      "sonarlint/canShowMissingRequirementsNotification",
    ),
    () => false,
  );

  // sonarlint/getTokenForServer
  connection.onRequest(
    new RequestType<{ serverUrl: string }, string | null, void>(
      "sonarlint/getTokenForServer",
    ),
    () => null,
  );

  // sonarlint/isOpenInEditor
  connection.onRequest(
    new RequestType<{ fileUri: string }, boolean, void>(
      "sonarlint/isOpenInEditor",
    ),
    () => true,
  );

  // sonarlint/hasJoinedIdeLabs
  connection.onRequest(
    new RequestType<void, boolean, void>("sonarlint/hasJoinedIdeLabs"),
    () => false,
  );

  // workspace/configuration — server asks for settings
  connection.onRequest(
    new RequestType<
      { items: Array<{ section?: string; scopeUri?: string }> },
      unknown[],
      void
    >("workspace/configuration"),
    (params) => {
      return params.items.map(() => ({
        testFilePattern: "",
        analyzerProperties: {},
        disableTelemetry: true,
        rules: {},
        output: { showVerboseLogs: true },
      }));
    },
  );

  // Handle notifications from server (no-op, just prevent unhandled errors)
  const noopNotifications = [
    "sonarlint/showRuleDescription",
    "sonarlint/suggestBinding",
    "sonarlint/showNotificationForFirstSecretsIssue",
    "sonarlint/showSonarLintOutput",
    "sonarlint/openJavaHomeSettings",
    "sonarlint/openPathToNodeSettings",
    "sonarlint/browseTo",
    "sonarlint/openConnectionSettings",
    "sonarlint/setReferenceBranchNameForFolder",
    "sonarlint/needCompilationDatabase",
    "sonarlint/reportConnectionCheckResult",
    "sonarlint/doNotShowMissingRequirementsMessageAgain",
    "sonarlint/maybeShowWiderLanguageSupportNotification",
    "sonarlint/startProgressNotification",
    "sonarlint/endProgressNotification",
    "sonarlint/publishSecurityHotspots",
    "sonarlint/publishTaintVulnerabilities",
    "sonarlint/publishDependencyRisks",
    "sonarlint/showSoonUnsupportedVersionMessage",
    "sonarlint/submitNewCodeDefinition",
    "sonarlint/suggestConnection",
    "sonarlint/notifyInvalidToken",
    "sonarlint/embeddedServerStarted",
    "sonarlint/showFixSuggestion",
    "sonarlint/removeBindingsForDeletedConnections",
    "sonarlint/showHotspot",
    "sonarlint/showIssue",
    "sonarlint/showIssueOrHotspot",
  ];

  for (const method of noopNotifications) {
    connection.onNotification(new NotificationType(method), () => {});
  }

  connection.onNotification(
    new NotificationType<{ type: number; message: string }>(
      "window/showMessage",
    ),
    (params) => {
      if (process.env.SONARLINT_DEBUG) {
        process.stderr.write(`[server msg] ${params.message}\n`);
      }
    },
  );
}

export async function initializeClient(
  connection: MessageConnection,
  workspaceFolder: string,
  vendorPath: string,
): Promise<void> {
  const workspaceFolderUri = pathToFileURL(workspaceFolder).toString();

  registerClientHandlers(connection);

  const initParams: InitializeParams = {
    processId: process.pid,
    rootUri: workspaceFolderUri,
    capabilities: {
      textDocument: {
        publishDiagnostics: {
          relatedInformation: true,
          codeDescriptionSupport: true,
        },
        synchronization: {
          didSave: true,
          willSave: false,
          willSaveWaitUntil: false,
          dynamicRegistration: false,
        },
      },
      workspace: {
        workspaceFolders: true,
        didChangeConfiguration: {
          dynamicRegistration: false,
        },
      },
    },
    workspaceFolders: [
      {
        uri: workspaceFolderUri,
        name: basename(workspaceFolder),
      },
    ],
    initializationOptions: {
      productKey: "vscode",
      productName: "SonarLint CLI",
      productVersion: "0.1.0",
      firstSecretDetected: false,
      showVerboseLogs: true,
      enableNotebooks: false,
      platform: platform(),
      architecture: arch(),
      connections: {
        sonarqube: [],
        sonarcloud: [],
      },
      clientNodePath: process.execPath,
      eslintBridgeServerPath: join(vendorPath, "eslint-bridge"),
      omnisharpDirectory: join(vendorPath, "omnisharp"),
      rules: {},
      focusOnNewCode: false,
      automaticAnalysis: true,
    },
  };

  await connection.sendRequest(InitializeRequest.type, initParams);
  connection.sendNotification(InitializedNotification.type, {});
}

export async function analyzeFiles(
  connection: MessageConnection,
  options: AnalysisOptions,
): Promise<DiagnosticResult[]> {
  const results = new Map<string, DiagnosticResult>();
  const timeoutMs = options.timeout ?? 60_000;

  let analysisSettled: (() => void) | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let fileAnalysisStarted = false;
  let fileAnalysisFinished = false;

  // Build set of file URIs we're analyzing
  const targetUris = new Set(
    options.files.map((f) => pathToFileURL(resolve(f)).toString()),
  );

  const trySettle = () => {
    if (settleTimer) clearTimeout(settleTimer);
    // Don't settle until the file analysis has actually finished
    if (!fileAnalysisFinished) return;

    settleTimer = setTimeout(() => {
      if (analysisSettled) analysisSettled();
    }, 1_000);
  };

  // Collect diagnostics as they arrive
  connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
    const filePath = new URL(params.uri).pathname;
    results.set(params.uri, {
      uri: params.uri,
      filePath,
      diagnostics: params.diagnostics,
    });
    if (options.verbose) {
      process.stderr.write(
        `  [diagnostics] ${filePath}: ${params.diagnostics.length} issue(s)\n`,
      );
    }
  });

  // Track analysis lifecycle via log messages
  connection.onNotification(
    new NotificationType<{ type: number; message: string }>(
      "window/logMessage",
    ),
    (params) => {
      // Only track analysis that includes our files (check for inputFiles in the log)
      if (params.message.includes("Starting analysis with configuration")) {
        fileAnalysisStarted = true;
        if (options.verbose) {
          process.stderr.write(`  [file analysis started]\n`);
        }
      }

      // Detect when the reporting of issues happens for our scope
      if (
        fileAnalysisStarted &&
        !fileAnalysisFinished &&
        params.message.includes("Reporting")
      ) {
        // "Reporting N issues over M files for configuration scope ..."
        const match = params.message.match(
          /Reporting (\d+) issues over (\d+) files/,
        );
        if (match) {
          fileAnalysisFinished = true;
          if (options.verbose) {
            process.stderr.write(
              `  [file analysis done] ${match[1]} issues over ${match[2]} files\n`,
            );
          }
          trySettle();
        }
      }

      if (process.env.SONARLINT_DEBUG) {
        process.stderr.write(`[server log] ${params.message}\n`);
      }
    },
  );

  // Create the settlement promise before opening files to avoid race conditions
  // where the server emits completion signals before the callback is registered.
  const analysisPromise = new Promise<void>((res) => {
    analysisSettled = res;

    // Hard timeout
    setTimeout(() => {
      if (settleTimer) clearTimeout(settleTimer);
      res();
    }, timeoutMs);
  });

  // Open all files for analysis
  for (const file of options.files) {
    const absPath = resolve(file);
    const uri = pathToFileURL(absPath).toString();
    const content = readFileSync(absPath, "utf-8");
    const languageId = getLanguageId(absPath);

    connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });
  }

  // Wait for analysis to complete
  await analysisPromise;

  // Close files
  for (const file of options.files) {
    const absPath = resolve(file);
    const uri = pathToFileURL(absPath).toString();
    connection.sendNotification(DidCloseTextDocumentNotification.type, {
      textDocument: { uri },
    });
  }

  return [...results.values()];
}

export async function shutdownServer(
  connection: MessageConnection,
): Promise<void> {
  try {
    await connection.sendRequest(ShutdownRequest.type);
    connection.sendNotification(ExitNotification.type);
  } catch {
    // Server may have already exited
  }
}

export function severityToString(
  severity: DiagnosticSeverity | undefined,
): string {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return "ERROR";
    case DiagnosticSeverity.Warning:
      return "WARNING";
    case DiagnosticSeverity.Information:
      return "INFO";
    case DiagnosticSeverity.Hint:
      return "HINT";
    default:
      return "UNKNOWN";
  }
}
