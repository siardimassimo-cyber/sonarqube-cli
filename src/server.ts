import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from "vscode-languageserver-protocol/node.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ServerPaths {
  vendorPath: string;
  javaPath: string;
  serverJar: string;
  analyzerJars: string[];
}

export function findSonarLintPaths(): ServerPaths {
  // Resolve vendor/ relative to the project root (one level up from dist/)
  const vendorPath = join(__dirname, "..", "vendor");

  if (!existsSync(vendorPath)) {
    throw new Error(
      `Vendor directory not found: ${vendorPath}. Run the setup to copy SonarLint JARs.`,
    );
  }

  // Find bundled JRE
  const jreDir = join(vendorPath, "jre");
  let javaPath = "java"; // fallback to system java

  if (existsSync(jreDir)) {
    const jreEntries = readdirSync(jreDir, { encoding: "utf-8" });
    const jrePlatformDir = jreEntries[0];
    if (jrePlatformDir) {
      const candidateJava = join(jreDir, jrePlatformDir, "bin", "java");
      if (existsSync(candidateJava)) {
        javaPath = candidateJava;
      }
    }
  }

  // Server JAR
  const serverJar = join(vendorPath, "server", "sonarlint-ls.jar");
  if (!existsSync(serverJar)) {
    throw new Error(`SonarLint language server JAR not found: ${serverJar}`);
  }

  // Analyzer JARs
  const analyzersDir = join(vendorPath, "analyzers");
  const analyzerJars: string[] = [];
  if (existsSync(analyzersDir)) {
    for (const f of readdirSync(analyzersDir, { encoding: "utf-8" })) {
      if (f.endsWith(".jar")) {
        analyzerJars.push(join(analyzersDir, f));
      }
    }
  }

  return { vendorPath, javaPath, serverJar, analyzerJars };
}

export interface SpawnedServer {
  process: ChildProcess;
  connection: MessageConnection;
}

export function spawnServer(paths: ServerPaths): SpawnedServer {
  const args = [
    "-jar",
    paths.serverJar,
    "-stdio",
    "-analyzers",
    ...paths.analyzerJars,
  ];

  const serverProcess = spawn(paths.javaPath, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  serverProcess.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg && process.env.SONARLINT_DEBUG) {
      process.stderr.write(`[server] ${msg}\n`);
    }
  });

  const connection = createMessageConnection(
    new StreamMessageReader(serverProcess.stdout!),
    new StreamMessageWriter(serverProcess.stdin!),
  );

  return { process: serverProcess, connection };
}
