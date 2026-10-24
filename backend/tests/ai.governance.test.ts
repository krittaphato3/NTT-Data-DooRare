import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/client.js';
import { defaultToolRegistry } from '../src/modules/ai/tools/index.js';
import { byokService } from '../src/modules/ai/byok/byok.service.js';

// Make pool.end idempotent so multiple after() hooks across test files do not throw "Called end on pool more than once"
const origPoolEnd = pool.end.bind(pool);
let poolEnded = false;
pool.end = (async () => {
  if (poolEnded) return;
  poolEnded = true;
  return origPoolEnd();
}) as any;

// Explicit side-effect imports of all governance test files
import './ai/hospitalAdmin.tools.test.js';
import './ai/regionAdmin.tools.test.js';
import './ai/systemAdmin.tools.test.js';
import './ai/dataAdmin.tools.test.js';
import './ai/auditor.tools.test.js';
import './ai/rbac-matrix.test.js';
import './ai/audit-integrity.test.js';

// Close shared database connection pool once after all imported tests complete
after(async () => {
  await pool.end();
});

test('governance bridge: every *.test.ts file in tests/ai/ is explicitly imported', () => {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const aiDir = path.join(currentDir, 'ai');

  // Read directory listing of tests/ai/
  const aiFiles = fs
    .readdirSync(aiDir)
    .filter((f) => f.endsWith('.test.ts'))
    .sort();

  assert.ok(aiFiles.length >= 7, 'Expected at least 7 test files in tests/ai/');

  // Read this bridge file source
  const bridgeSource = fs.readFileSync(currentFile, 'utf8');

  // Assert every *.test.ts file is explicitly imported (as .js or .ts)
  for (const testFile of aiFiles) {
    const baseName = testFile.replace(/\.test\.ts$/, '');
    const hasImport =
      bridgeSource.includes(`./ai/${testFile}`) ||
      bridgeSource.includes(`./ai/${baseName}.test.js`) ||
      bridgeSource.includes(`./ai/${baseName}.test.ts`);

    assert.ok(
      hasImport,
      `Bridge file must explicitly import tests/ai/${testFile} so it is never forgotten silently`,
    );
  }
});

test('governance bridge: mock-leak guard verifies all tool and service mocks are restored', () => {
  // 1. Verify every registered tool's execute function has no residual mock
  const tools = defaultToolRegistry.getAll();
  for (const tool of tools) {
    assert.equal(
      (tool.execute as any).mock,
      undefined,
      `Tool '${tool.name}' execute method must not leak mock state`,
    );
  }

  // 2. Verify byokService methods have no residual mock
  assert.equal(
    (byokService.getConfig as any).mock,
    undefined,
    'byokService.getConfig must not leak mock state',
  );
  assert.equal(
    (byokService.testConnection as any).mock,
    undefined,
    'byokService.testConnection must not leak mock state',
  );
});

