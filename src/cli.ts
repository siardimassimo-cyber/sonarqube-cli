#!/usr/bin/env node

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { program } from 'commander';
import chalk from 'chalk';
import { findSonarLintPaths, spawnServer } from './server.js';
import {
  initializeClient,
  analyzeFiles,
  shutdownServer,
  severityToString,
  type DiagnosticResult,
} from './client.js';
import { DiagnosticSeverity } from 'vscode-languageserver-protocol/node.js';

program
  .name('sonarlint-cli')
  .description('Run SonarLint analysis from the command line using the LSP server')
  .version('0.1.0')
  .argument('<files...>', 'Files or glob patterns to analyze')
  .option('-w, --workspace <dir>', 'Workspace root directory', process.cwd())
  .option('-t, --timeout <ms>', 'Analysis timeout in milliseconds', '30000')
  .option('--json', 'Output results as JSON')
  .option('-v, --verbose', 'Show verbose output')
  .action(async (files: string[], opts) => {
    const workspace = resolve(opts.workspace);

    // Resolve file paths
    const resolvedFiles = files.map((f: string) => resolve(f));
    const missingFiles = resolvedFiles.filter((f: string) => !existsSync(f));
    if (missingFiles.length > 0) {
      console.error(chalk.red(`Files not found: ${missingFiles.join(', ')}`));
      process.exit(1);
    }

    if (opts.verbose) {
      process.env.SONARLINT_DEBUG = '1';
    }

    try {
      // 1. Find SonarLint server
      if (opts.verbose) console.error(chalk.gray('Finding SonarLint language server...'));
      const paths = findSonarLintPaths();
      if (opts.verbose) {
        console.error(chalk.gray(`  Java: ${paths.javaPath}`));
        console.error(chalk.gray(`  Server: ${paths.serverJar}`));
        console.error(chalk.gray(`  Analyzers: ${paths.analyzerJars.length} JARs`));
      }

      // 2. Spawn server
      if (opts.verbose) console.error(chalk.gray('Starting language server...'));
      const server = spawnServer(paths);
      const { connection } = server;

      connection.listen();

      // Handle server crash
      server.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          console.error(chalk.red(`Language server exited with code ${code}`));
        }
      });

      // 3. Initialize LSP
      if (opts.verbose) console.error(chalk.gray('Initializing LSP session...'));
      await initializeClient(connection, workspace, paths.vendorPath);

      // 4. Analyze
      if (opts.verbose) console.error(chalk.gray(`Analyzing ${resolvedFiles.length} file(s)...`));
      const results = await analyzeFiles(connection, {
        files: resolvedFiles,
        workspaceFolder: workspace,
        vendorPath: paths.vendorPath,
        verbose: opts.verbose,
        timeout: parseInt(opts.timeout, 10),
      });

      // 5. Shutdown
      await shutdownServer(connection);
      server.process.kill();

      // 6. Output
      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        printResults(results);
      }

      // Exit with error code if issues found
      const hasIssues = results.some((r) => r.diagnostics.length > 0);
      process.exit(hasIssues ? 1 : 0);
    } catch (err) {
      console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`));
      process.exit(2);
    }
  });

function printResults(results: DiagnosticResult[]) {
  let totalIssues = 0;

  for (const result of results) {
    if (result.diagnostics.length === 0) continue;

    console.log(chalk.underline(result.filePath));

    for (const diag of result.diagnostics) {
      totalIssues++;
      const line = diag.range.start.line + 1;
      const col = diag.range.start.character + 1;
      const severity = severityToString(diag.severity);
      const ruleId = diag.code ?? '';

      const severityColor =
        diag.severity === DiagnosticSeverity.Error
          ? chalk.red
          : diag.severity === DiagnosticSeverity.Warning
            ? chalk.yellow
            : chalk.blue;

      console.log(
        `  ${chalk.gray(`${line}:${col}`)}  ${severityColor(severity.padEnd(7))}  ${diag.message}  ${chalk.gray(String(ruleId))}`
      );
    }

    console.log();
  }

  if (totalIssues === 0) {
    console.log(chalk.green('No issues found.'));
  } else {
    console.log(chalk.bold(`${totalIssues} issue(s) found.`));
  }
}

program.parse();
