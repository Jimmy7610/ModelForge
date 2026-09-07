import { describe, it, expect } from 'vitest';
import { DiffService } from '../src/main/edit/diff-service';

describe('DiffEngine & Myers LCS (Pass 5)', () => {
  it('computes diff for unchanged text', () => {
    const text = 'line 1\nline 2\nline 3';
    const result = DiffService.generateUnifiedDiff(text, text, 'test.txt');
    expect(result.insertions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.unifiedDiff).toBe('');
  });

  it('computes diff for newly created file', () => {
    const result = DiffService.generateUnifiedDiff('', 'hello world\nsecond line', 'newfile.ts');
    expect(result.insertions).toBe(2);
    expect(result.deletions).toBe(0);
    expect(result.unifiedDiff).toContain('--- a/newfile.ts');
    expect(result.unifiedDiff).toContain('+++ b/newfile.ts');
    expect(result.unifiedDiff).toContain('+hello world');
    expect(result.unifiedDiff).toContain('+second line');
  });

  it('computes diff for deleted file', () => {
    const result = DiffService.generateUnifiedDiff('line 1\nline 2', '', 'deleted.ts');
    expect(result.insertions).toBe(0);
    expect(result.deletions).toBe(2);
    expect(result.unifiedDiff).toContain('--- a/deleted.ts');
    expect(result.unifiedDiff).toContain('+++ b/deleted.ts');
    expect(result.unifiedDiff).toContain('-line 1');
    expect(result.unifiedDiff).toContain('-line 2');
  });

  it('computes modifications with additions and deletions', () => {
    const oldText = 'const a = 1;\nconst b = 2;\nconst c = 3;';
    const newText = 'const a = 1;\nconst b = 42;\nconst c = 3;\nconst d = 4;';
    const result = DiffService.generateUnifiedDiff(oldText, newText, 'calc.ts');

    expect(result.deletions).toBe(1);
    expect(result.insertions).toBe(2);
    expect(result.unifiedDiff).toContain('-const b = 2;');
    expect(result.unifiedDiff).toContain('+const b = 42;');
    expect(result.unifiedDiff).toContain('+const d = 4;');
  });

  it('formats unified diff with proper hunk headers', () => {
    const result = DiffService.generateUnifiedDiff(
      'line 1\nline 2\nline 3',
      'line 1\nMODIFIED\nline 3',
      'file.ts'
    );
    expect(result.unifiedDiff).toContain('--- a/file.ts');
    expect(result.unifiedDiff).toContain('+++ b/file.ts');
    expect(result.unifiedDiff).toContain('@@');
    expect(result.unifiedDiff).toContain('-line 2');
    expect(result.unifiedDiff).toContain('+MODIFIED');
  });
});
