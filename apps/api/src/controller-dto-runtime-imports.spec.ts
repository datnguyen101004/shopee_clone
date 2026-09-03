import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return entry.isFile() && entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

describe('Nest controller DTO runtime imports', () => {
  it('keeps DTO classes as runtime values so ValidationPipe receives decorator metadata', () => {
    const invalidImports: string[] = [];

    for (const file of controllerFiles(__dirname)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );

      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;

        const clause = statement.importClause;
        const bindings = clause.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;

        for (const binding of bindings.elements) {
          if (!binding.name.text.endsWith('Dto')) continue;
          if (!clause.isTypeOnly && !binding.isTypeOnly) continue;

          const position = source.getLineAndCharacterOfPosition(binding.getStart(source));
          invalidImports.push(
            `${relative(__dirname, file)}:${position.line + 1} imports ${binding.name.text} as type-only`,
          );
        }
      }
    }

    expect(invalidImports).toEqual([]);
  });
});
