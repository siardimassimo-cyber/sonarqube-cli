# sonarlint-cli

A command-line tool that runs [SonarLint](https://www.sonarsource.com/products/sonarlint/) analysis on your code using the SonarLint Language Server Protocol (LSP) server. Get the same code quality feedback you'd see in your IDE, directly from the terminal.

## How It Works

`sonarlint-cli` reuses the SonarLint language server (the same one powering the VS Code extension) by:

1. Locating the SonarLint language server JAR and analyzer JARs from a local `vendor/` directory
2. Spawning the server as a child process communicating over stdio
3. Initializing an LSP session and opening the target files for analysis
4. Collecting diagnostics (issues) published by the server
5. Shutting down the server and reporting results

## Prerequisites

- **Node.js** >= 18
- **Java** runtime (bundled JRE in `vendor/jre/` is used automatically if present, otherwise falls back to system `java`)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Populate the `vendor/` directory

The tool expects SonarLint server and analyzer JARs in a `vendor/` directory at the project root. You can copy these from an existing SonarLint VS Code extension installation:

```
vendor/
├── jre/                    # (optional) Bundled JRE
│   └── <platform>/
│       └── bin/java
├── server/
│   └── sonarlint-ls.jar    # SonarLint language server
├── analyzers/
│   ├── sonarjs.jar          # JavaScript/TypeScript analyzer
│   ├── sonarpython.jar      # Python analyzer
│   └── ...                  # Other language analyzers
└── eslint-bridge/           # (optional) ESLint bridge for JS/TS
```

The typical source location for these files is:

```
~/.vscode/extensions/sonarsource.sonarlint-vscode-<version>/
```

### 3. Build

```bash
npm run build
```

## Usage

```bash
# Analyze specific files
node dist/cli.js src/foo.ts src/bar.ts

# Or during development
npm run dev -- src/foo.ts

# Analyze with verbose output
node dist/cli.js -v src/**/*.ts

# Output results as JSON
node dist/cli.js --json src/foo.ts

# Specify a different workspace root
node dist/cli.js -w /path/to/project src/foo.ts

# Set a custom timeout (default: 30s)
node dist/cli.js -t 60000 src/foo.ts
```

### Options

| Option | Description | Default |
|---|---|---|
| `-w, --workspace <dir>` | Workspace root directory | Current directory |
| `-t, --timeout <ms>` | Analysis timeout in milliseconds | `30000` |
| `--json` | Output results as JSON | Off |
| `-v, --verbose` | Show verbose/debug output | Off |

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | No issues found |
| `1` | Issues found |
| `2` | Error (server crash, missing files, etc.) |

## Supported Languages

The tool supports any language that the SonarLint analyzers support, including:

TypeScript, JavaScript, Python, Java, Go, PHP, C#, HTML, CSS, YAML, JSON, Terraform, C, C++, and more — as long as the corresponding analyzer JAR is present in `vendor/analyzers/`.

## Example Output

```
src/foo.ts
  12:5   WARNING  Remove this unused import of 'bar'.  typescript:S1128
  45:10  ERROR    Fix this invalid regular expression.  typescript:S5856

2 issue(s) found.
```

## Using in a Repository

You can integrate `sonarlint-cli` into any repo for local or CI analysis:

1. **Clone or copy** this tool alongside your project
2. **Populate `vendor/`** with the SonarLint JARs (see [Setup](#2-populate-the-vendor-directory))
3. **Run analysis** pointing to your source files:

   ```bash
   /path/to/sonarlint-cli/dist/cli.js src/**/*.ts
   ```

4. **CI integration** — add a step that runs the CLI and fails the build on issues (exit code `1`):

   ```yaml
   - name: SonarLint analysis
     run: node /path/to/sonarlint-cli/dist/cli.js --json src/**/*.ts > sonarlint-report.json
   ```

## Pre-commit Hook

You can run `sonarlint-cli` as a Git pre-commit hook to lint only the staged files before each commit. Since the CLI exits with code `1` when issues are found, the commit will be blocked automatically.

### Manual setup

Create `.git/hooks/pre-commit`:

```bash
#!/bin/sh

STAGED_FILES=$(git diff --cached --name-only --diff-filter=d)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

node /path/to/sonarlint-cli/dist/cli.js $STAGED_FILES
```

Then make it executable:

```bash
chmod +x .git/hooks/pre-commit
```

### With [lint-staged](https://github.com/lint-staged/lint-staged)

Install lint-staged and [husky](https://github.com/typicode/husky):

```bash
npm install -D lint-staged husky
npx husky init
```

Add to your `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,js,tsx,jsx}": "node /path/to/sonarlint-cli/dist/cli.js"
  }
}
```

Update `.husky/pre-commit`:

```bash
npx lint-staged
```

### With [lefthook](https://github.com/evilmartians/lefthook)

Add to `lefthook.yml`:

```yaml
pre-commit:
  commands:
    sonarlint:
      glob: "*.{ts,js,tsx,jsx}"
      run: node /path/to/sonarlint-cli/dist/cli.js {staged_files}
```

## License

ISC
