import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_ROOT = path.join("apps", "api", "plane");
const MODEL_BASE_NAMES = new Set([
  "models.Model",
  "Model",
  "BaseModel",
  "WorkspaceBaseModel",
  "ProjectBaseModel",
  "AuditModel",
  "TimeAuditModel",
  "AbstractBaseUser",
  "AbstractBaseSession",
]);
const NON_MODEL_BASE_MARKERS = [
  "Enum",
  "models.TextChoices",
  "models.IntegerChoices",
  "Manager",
  "SoftDeletionManager",
  "DBSessionStore",
  "ChangeTrackerMixin",
  "PermissionsMixin",
];
const RELATION_FIELD_TYPES = new Set(["ForeignKey", "OneToOneField", "ManyToManyField"]);
const OPERATION_TYPES = [
  "CreateModel",
  "DeleteModel",
  "RenameModel",
  "AddField",
  "AlterField",
  "RemoveField",
  "RenameField",
  "AddConstraint",
  "RemoveConstraint",
  "AlterUniqueTogether",
  "AlterIndexTogether",
  "AddIndex",
  "RemoveIndex",
  "RunPython",
  "RunSQL",
];

function usage() {
  return `Usage: node apps/cloudflare/tools/django-model-inventory.mjs [--root apps/api/plane] [--json]

Static, read-only inventory of Django models and migrations. The scanner reads Python
source files only; it does not import Django, open network sockets, or connect to a database.`;
}

function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--root requires a path");
      }
      options.root = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function walkFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const fileGroups = await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === "__pycache__" || entry.name.startsWith(".")) {
        return [];
      }

      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(fullPath);
      }
      if (entry.isFile()) {
        return [fullPath];
      }
      return [];
    })
  );

  return fileGroups.flat().toSorted();
}

function countParens(text) {
  let count = 0;
  for (const char of text) {
    if (char === "(") count += 1;
    if (char === ")") count -= 1;
  }
  return count;
}

function collectStatement(lines, startIndex) {
  const statementLines = [lines[startIndex]];
  let parenBalance = countParens(lines[startIndex]);
  let index = startIndex;

  while (parenBalance > 0 && index + 1 < lines.length) {
    index += 1;
    statementLines.push(lines[index]);
    parenBalance += countParens(lines[index]);
  }

  return {
    raw: statementLines.join("\n"),
    endIndex: index,
  };
}

function splitBases(rawBases) {
  return rawBases
    .split(",")
    .map((base) => base.trim())
    .filter(Boolean);
}

function getAppLabel(relativeFile) {
  const parts = relativeFile.split("/");
  const migrationIndex = parts.indexOf("migrations");
  const modelsIndex = parts.indexOf("models");

  if (migrationIndex > 0) {
    return parts[migrationIndex - 1];
  }
  if (modelsIndex > 0) {
    return parts[modelsIndex - 1];
  }
  return parts[0] ?? "unknown";
}

function extractTopLevelClassBlocks(source) {
  const lines = source.split(/\r?\n/);
  const classStarts = [];
  const classRegex = /^class\s+([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\):/;

  lines.forEach((line, index) => {
    const match = line.match(classRegex);
    if (match) {
      classStarts.push({
        name: match[1],
        bases: splitBases(match[2]),
        startIndex: index,
      });
    }
  });

  return classStarts.map((classStart, index) => {
    const nextStart = classStarts[index + 1]?.startIndex ?? lines.length;
    return {
      bases: classStart.bases,
      name: classStart.name,
      startIndex: classStart.startIndex,
      startLine: classStart.startIndex + 1,
      lines: lines.slice(classStart.startIndex, nextStart),
    };
  });
}

function extractFieldType(rawAssignment) {
  const directMatch = rawAssignment.match(/\bmodels\.([A-Za-z0-9_]+Field|ForeignKey)\s*\(/);
  if (directMatch) {
    return directMatch[1];
  }

  const postgresMatch = rawAssignment.match(/\b(ArrayField)\s*\(/);
  if (postgresMatch) {
    return postgresMatch[1];
  }

  return null;
}

function extractRelationTarget(rawAssignment) {
  const firstArgMatch = rawAssignment.match(/\(\s*(["'][^"']+["']|[A-Za-z_][A-Za-z0-9_.]*)/);
  if (!firstArgMatch) {
    return null;
  }
  return firstArgMatch[1].replace(/^["']|["']$/g, "");
}

function extractFields(classBlock) {
  const fields = [];

  for (let index = 1; index < classBlock.lines.length; index += 1) {
    const line = classBlock.lines[index];
    const assignmentMatch = line.match(/^    ([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!assignmentMatch) {
      continue;
    }

    const { raw, endIndex } = collectStatement(classBlock.lines, index);
    const fieldType = extractFieldType(raw);
    if (!fieldType) {
      index = endIndex;
      continue;
    }

    const field = {
      name: assignmentMatch[1],
      type: fieldType,
      line: classBlock.startLine + index,
    };

    if (RELATION_FIELD_TYPES.has(fieldType)) {
      field.target = extractRelationTarget(raw);
    }

    fields.push(field);
    index = endIndex;
  }

  return fields;
}

function hasModelBase(bases) {
  return bases.some((base) => MODEL_BASE_NAMES.has(base) || MODEL_BASE_NAMES.has(base.split(".").at(-1)));
}

function hasOnlyNonModelBases(bases) {
  return bases.length > 0 && bases.every((base) => NON_MODEL_BASE_MARKERS.some((marker) => base.includes(marker)));
}

function extractDbTable(blockText) {
  const match = blockText.match(/\bdb_table\s*=\s*["']([^"']+)["']/);
  return match?.[1] ?? null;
}

function isAbstractModel(blockText) {
  return /^\s+abstract\s*=\s*True\b/m.test(blockText);
}

function extractCompatibilityConcerns(blockText, fields) {
  const concerns = [];
  const pushConcern = (type, detail) => {
    if (!concerns.some((concern) => concern.type === type && concern.detail === detail)) {
      concerns.push({ type, detail });
    }
  };

  for (const field of fields) {
    if (field.type === "JSONField") {
      pushConcern("json-field", "D1 stores JSON as text; query behavior and indexing need explicit design.");
    }
    if (field.type === "BinaryField") {
      pushConcern("binary-field", "Binary payloads should be evaluated for R2/object storage or base64/text encoding.");
    }
    if (field.type === "ArrayField") {
      pushConcern("postgres-array-field", "Postgres ArrayField has no direct SQLite/D1 equivalent.");
    }
    if (field.type === "ManyToManyField") {
      pushConcern("many-to-many", "Many-to-many relations need explicit join tables in D1 schema.");
    }
    if (field.type === "DecimalField") {
      pushConcern("decimal-field", "Decimal values need text/integer storage strategy to avoid SQLite numeric drift.");
    }
    if (field.type === "FileField" || field.type === "ImageField") {
      pushConcern("file-field", "File fields must map to R2 object metadata rather than local/GCS storage semantics.");
    }
  }

  if (/\bmodels\.Q\s*\(/.test(blockText) || /\bcondition\s*=/.test(blockText)) {
    pushConcern(
      "partial-constraint",
      "Partial indexes or conditional unique constraints require SQLite/D1 validation."
    );
  }
  if (/\bunique_together\b/.test(blockText)) {
    pushConcern("unique-together", "Composite uniqueness must be translated into explicit D1 indexes.");
  }
  if (/\bGinIndex\b|\bdjango\.contrib\.postgres\b|\bArrayField\b/.test(blockText)) {
    pushConcern("postgres-specific", "Postgres-specific fields/indexes need replacement before D1 migration.");
  }
  if (/\bpg_advisory_xact_lock\b|\bconnection\.cursor\b/.test(blockText)) {
    pushConcern("postgres-locking", "Postgres advisory locks/raw cursors require Worker/D1-safe concurrency design.");
  }
  if (/\btransaction\.atomic\b/.test(blockText)) {
    pushConcern("transaction-semantics", "Django transaction boundaries need explicit D1 batch/transaction mapping.");
  }

  return concerns;
}

async function inventoryModels(rootDir, pythonFiles) {
  const modelGroups = await Promise.all(
    pythonFiles.map(async (filePath) => {
      const relativeFile = toPosixPath(path.relative(rootDir, filePath));
      if (relativeFile.includes("/migrations/")) {
        return [];
      }

      const source = await readFile(filePath, "utf8");
      const classBlocks = extractTopLevelClassBlocks(source);
      const fileModels = [];

      for (const classBlock of classBlocks) {
        const blockText = classBlock.lines.join("\n");
        const fields = extractFields(classBlock);
        const modelLike = hasModelBase(classBlock.bases) || fields.length > 0 || /\bdb_table\s*=/.test(blockText);

        if (!modelLike || hasOnlyNonModelBases(classBlock.bases)) {
          continue;
        }

        const abstract = isAbstractModel(blockText);
        const relations = fields
          .filter((field) => RELATION_FIELD_TYPES.has(field.type))
          .map((field) => ({
            field: field.name,
            type: field.type,
            target: field.target,
            line: field.line,
          }));

        fileModels.push({
          app: getAppLabel(relativeFile),
          className: classBlock.name,
          bases: classBlock.bases,
          file: relativeFile,
          line: classBlock.startLine,
          dbTable: extractDbTable(blockText),
          abstract,
          fieldCount: fields.length,
          relationCount: relations.length,
          fields,
          relations,
          concerns: extractCompatibilityConcerns(blockText, fields),
        });
      }

      return fileModels;
    })
  );

  const models = modelGroups.flat();

  return models.toSorted((a, b) => `${a.app}.${a.className}`.localeCompare(`${b.app}.${b.className}`));
}

function countOperationTypes(source) {
  const counts = {};
  for (const operation of OPERATION_TYPES) {
    const regex = new RegExp(`\\bmigrations\\.${operation}\\s*\\(`, "g");
    const matches = source.match(regex);
    if (matches) {
      counts[operation] = matches.length;
    }
  }
  return counts;
}

function extractCreatedModelNames(source) {
  const names = [];
  const createModelRegex = /migrations\.CreateModel\s*\(\s*name\s*=\s*["']([^"']+)["']/g;
  let match;
  while ((match = createModelRegex.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

async function inventoryMigrations(rootDir, pythonFiles) {
  const migrationGroups = await Promise.all(
    pythonFiles.map(async (filePath) => {
      const relativeFile = toPosixPath(path.relative(rootDir, filePath));
      const basename = path.basename(filePath);
      if (!relativeFile.includes("/migrations/") || basename === "__init__.py") {
        return [];
      }

      const source = await readFile(filePath, "utf8");
      const operationCounts = countOperationTypes(source);
      return [
        {
          app: getAppLabel(relativeFile),
          name: basename.replace(/\.py$/, ""),
          file: relativeFile,
          operationCounts,
          createdModels: extractCreatedModelNames(source),
          hasRunPython: Boolean(operationCounts.RunPython),
          hasRunSQL: Boolean(operationCounts.RunSQL),
        },
      ];
    })
  );

  const migrations = migrationGroups.flat();

  return migrations.toSorted((a, b) => a.file.localeCompare(b.file));
}

function summarize(models, migrations) {
  const migrationOperationCounts = {};
  const concernCounts = {};

  for (const migration of migrations) {
    for (const [operation, count] of Object.entries(migration.operationCounts)) {
      migrationOperationCounts[operation] = (migrationOperationCounts[operation] ?? 0) + count;
    }
  }

  for (const model of models) {
    for (const concern of model.concerns) {
      concernCounts[concern.type] = (concernCounts[concern.type] ?? 0) + 1;
    }
  }

  return {
    modelClassCount: models.length,
    concreteModelClassCount: models.filter((model) => !model.abstract).length,
    abstractModelClassCount: models.filter((model) => model.abstract).length,
    migrationFileCount: migrations.length,
    migrationOperationCounts,
    compatibilityConcernCounts: concernCounts,
  };
}

function printHumanReport(inventory) {
  const { root, summary, models } = inventory;
  const apps = [...new Set(models.map((model) => model.app))].toSorted();
  const highConcernModels = models.filter((model) => !model.abstract && model.concerns.length > 0).slice(0, 20);

  console.log("Django model and migration inventory");
  console.log(`Root: ${root}`);
  console.log(
    `Models: ${summary.modelClassCount} total, ${summary.concreteModelClassCount} concrete, ${summary.abstractModelClassCount} abstract`
  );
  console.log(`Migrations: ${summary.migrationFileCount} files`);
  console.log(`Apps: ${apps.join(", ") || "(none)"}`);
  console.log("");
  console.log("Migration operations:");
  for (const [operation, count] of Object.entries(summary.migrationOperationCounts).toSorted()) {
    console.log(`- ${operation}: ${count}`);
  }
  console.log("");
  console.log("Compatibility concern counts:");
  for (const [concern, count] of Object.entries(summary.compatibilityConcernCounts).toSorted()) {
    console.log(`- ${concern}: ${count}`);
  }
  console.log("");
  console.log("High-concern concrete models:");
  for (const model of highConcernModels) {
    const table = model.dbTable ?? "(implicit table)";
    const concerns = model.concerns.map((concern) => concern.type).join(", ");
    console.log(`- ${model.className} -> ${table} (${model.file}:${model.line}) [${concerns}]`);
  }
  console.log("");
  console.log("Use --json for the full file/field/relation inventory.");

  if (models.length === 0 || inventory.migrations.length === 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const rootDir = path.resolve(options.root);
  const files = await walkFiles(rootDir);
  const pythonFiles = files.filter((filePath) => filePath.endsWith(".py"));
  const models = await inventoryModels(rootDir, pythonFiles);
  const migrations = await inventoryMigrations(rootDir, pythonFiles);
  const inventory = {
    generatedAt: new Date().toISOString(),
    root: toPosixPath(path.relative(process.cwd(), rootDir)) || ".",
    summary: summarize(models, migrations),
    models,
    migrations,
  };

  if (options.json) {
    console.log(JSON.stringify(inventory, null, 2));
  } else {
    printHumanReport(inventory);
  }
}

main().catch((error) => {
  console.error(`Inventory failed: ${error.message}`);
  process.exitCode = 2;
});
