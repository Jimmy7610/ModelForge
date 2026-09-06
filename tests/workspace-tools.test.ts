import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { WorkspaceGuard } from '../src/main/workspace/guard';
import { WorkspaceTools } from '../src/main/workspace/tools';

describe('WorkspaceTools (Read-Only Inspection Suite)', () => {
  let tempWorkspace: string;
  let tools: WorkspaceTools;

  beforeEach(() => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-tools-test-'));

    // Create test file structure
    fs.mkdirSync(path.join(tempWorkspace, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tempWorkspace, 'node_modules', 'foo'), { recursive: true });

    fs.writeFileSync(
      path.join(tempWorkspace, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0' }, null, 2),
      'utf8'
    );

    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'App.tsx'),
      `import React from 'react';\n\nexport const App = () => {\n  return <div>Achievement unlocked!</div>;\n};\n`,
      'utf8'
    );

    fs.writeFileSync(
      path.join(tempWorkspace, 'src', 'game.ts'),
      `export class Game {\n  private score = 0;\n  public triggerAchievement(id: string) {\n    console.log("Earned badge", id);\n  }\n}\n`,
      'utf8'
    );

    // Dummy node_modules file that should be skipped by recursive listing
    fs.writeFileSync(path.join(tempWorkspace, 'node_modules', 'foo', 'index.js'), 'module.exports = {};', 'utf8');

    // Binary file
    const binaryBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    fs.writeFileSync(path.join(tempWorkspace, 'logo.png'), binaryBuf);

    const guard = new WorkspaceGuard(tempWorkspace);
    tools = new WorkspaceTools(guard);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('Tool 1: getProjectOverview returns correct metadata', async () => {
    const overview = await tools.getProjectOverview();
    expect(overview.name).toBe('test-project');
    expect(overview.keyFiles).toContain('package.json');
    expect(overview.topLevelDirectories).toContain('src');
    expect(overview.languages).toContain('TypeScript');
  });

  it('Tool 2: listDirectory lists entries and respects ignore directories', async () => {
    const rootList = await tools.listDirectory();
    expect(rootList.entries.length).toBeGreaterThan(0);
    expect(rootList.entries.some((e) => e.name === 'src')).toBe(true);
    expect(rootList.entries.some((e) => e.name === 'package.json')).toBe(true);

    // node_modules should be marked ignored and not recursed into
    const nodeModulesEntry = rootList.entries.find((e) => e.name === 'node_modules');
    expect(nodeModulesEntry?.isIgnored).toBe(true);

    const srcList = await tools.listDirectory({ path: 'src', recursive: true });
    expect(srcList.entries.some((e) => e.name === 'App.tsx')).toBe(true);
    expect(srcList.entries.some((e) => e.name === 'game.ts')).toBe(true);
  });

  it('Tool 3: readFile reads text lines and protects against binary dumping', async () => {
    const fileResult = await tools.readFile({ path: 'src/App.tsx', startLine: 1, endLine: 4 });
    expect(fileResult.totalLines).toBeGreaterThanOrEqual(4);
    expect(fileResult.content).toContain('import React');
    expect(fileResult.content).toContain('Achievement unlocked');
    expect(fileResult.isBinary).toBeFalsy();

    // Binary file protection
    const binResult = await tools.readFile({ path: 'logo.png' });
    expect(binResult.isBinary).toBe(true);
    expect(binResult.content).toContain('[Binary file cannot be displayed');
  });

  it('Tool 4: searchText finds queries across files with line numbers and snippets', async () => {
    const searchResult = await tools.searchText({ query: 'achievement' });
    expect(searchResult.totalMatches).toBe(2);
    expect(searchResult.matches.some((m) => m.file === 'src/App.tsx' && m.line === 4)).toBe(true);
    expect(searchResult.matches.some((m) => m.file === 'src/game.ts' && m.line === 3)).toBe(true);
  });

  it('verifies technical incapacity: WorkspaceTools has NO file modification methods', () => {
    const toolsAny = tools as any;
    expect(toolsAny.writeFile).toBeUndefined();
    expect(toolsAny.createFile).toBeUndefined();
    expect(toolsAny.deleteFile).toBeUndefined();
    expect(toolsAny.renameFile).toBeUndefined();
    expect(toolsAny.mkdir).toBeUndefined();
    expect(toolsAny.executeCommand).toBeUndefined();
    expect(toolsAny.exec).toBeUndefined();
  });
});
