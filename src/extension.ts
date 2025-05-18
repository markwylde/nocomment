import * as fs from 'node:fs';
import * as path from 'node:path';
import * as parser from '@typescript-eslint/typescript-estree';
import * as vscode from 'vscode';

interface Comment {
  type: 'Line' | 'Block';
  value: string;
  range: [number, number];
}

export function activate(context: vscode.ExtensionContext) {
  console.log('NoComment is now active');

  const removeCommentsFromCurrentFile = vscode.commands.registerCommand(
    'nocomment.removeComments',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
      }

      const document = editor.document;
      const filePath = document.uri.fsPath;
      const fileContent = document.getText();
      const fileExtension = path.extname(filePath);

      if (!['.js', '.jsx', '.ts', '.tsx'].includes(fileExtension)) {
        vscode.window.showErrorMessage('File must be JavaScript or TypeScript');
        return;
      }

      try {
        const parseOptions = {
          comment: true,
          jsx: fileExtension === '.jsx' || fileExtension === '.tsx',
          loc: true,
          range: true,
          tokens: true,
        };

        const ast = parser.parse(fileContent, parseOptions);

        const result = removeComments(
          fileContent,
          (ast.comments as Comment[]) || []
        );

        await editor.edit((editBuilder) => {
          const entireRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(fileContent.length)
          );
          editBuilder.replace(entireRange, result);
        });

        vscode.window.showInformationMessage('Comments removed successfully');
      } catch (error) {
        vscode.window.showErrorMessage(`Error removing comments: ${error}`);
      }
    }
  );

  const removeCommentsFromAllFiles = vscode.commands.registerCommand(
    'nocomment.removeCommentsFromAllFiles',
    async () => {
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage('No workspace folder is open');
          return;
        }

        const standardExclusions = [
          '**/node_modules/**',
          '**/bower_components/**',
          '**/dist/**',
          '**/build/**',
          '**/coverage/**',
          '**/.git/**',
          '**/.vscode/**',
          '**/.idea/**',
          '**/.DS_Store/**',
          '**/npm-debug.log',
          '**/yarn-debug.log',
          '**/yarn-error.log',
          '**/lerna-debug.log',
          '**/.next/**',
          '**/out/**',
          '**/logs/**',
          '**/temp/**',
          '**/tmp/**',
        ];

        const gitignorePatterns: string[] = [];
        for (const folder of workspaceFolders) {
          const gitignorePath = path.join(folder.uri.fsPath, '.gitignore');
          try {
            if (fs.existsSync(gitignorePath)) {
              const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
              const lines = gitignoreContent.split(/\r?\n/);

              for (let line of lines) {
                line = line.trim();

                if (line && !line.startsWith('#')) {
                  if (!line.startsWith('/')) {
                    line = `**/${line}`;
                  } else {
                    line = line.substring(1);
                  }

                  if (line.endsWith('/')) {
                    line = `${line}**`;
                  }

                  gitignorePatterns.push(line);
                }
              }
            }
          } catch (error) {
            console.error(`Error reading .gitignore: ${error}`);
          }
        }

        const allExclusions = [...standardExclusions, ...gitignorePatterns];

        const files = await vscode.workspace.findFiles(
          '**/*.{js,jsx,ts,tsx}',
          `{${allExclusions.join(',')}}`
        );

        if (files.length === 0) {
          vscode.window.showInformationMessage(
            'No JavaScript or TypeScript files found in the project'
          );
          return;
        }

        const progress = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Removing comments from all files',
            cancellable: true,
          },
          async (progress, token) => {
            progress.report({ increment: 0 });
            let processedCount = 0;

            for (const fileUri of files) {
              if (token.isCancellationRequested) {
                return;
              }

              try {
                const document =
                  await vscode.workspace.openTextDocument(fileUri);
                const fileContent = document.getText();
                const fileExtension = path.extname(fileUri.fsPath);

                const parseOptions = {
                  comment: true,
                  jsx: fileExtension === '.jsx' || fileExtension === '.tsx',
                  loc: true,
                  range: true,
                  tokens: true,
                };

                const ast = parser.parse(fileContent, parseOptions);
                const result = removeComments(
                  fileContent,
                  (ast.comments as Comment[]) || []
                );

                if (result !== fileContent) {
                  const edit = new vscode.WorkspaceEdit();
                  edit.replace(
                    fileUri,
                    new vscode.Range(
                      document.positionAt(0),
                      document.positionAt(fileContent.length)
                    ),
                    result
                  );
                  await vscode.workspace.applyEdit(edit);
                  processedCount++;
                }

                progress.report({
                  increment: (1 / files.length) * 100,
                  message: `Processing ${path.basename(fileUri.fsPath)} (${processedCount} files updated)`,
                });
              } catch (error) {
                console.error(
                  `Error processing file ${fileUri.fsPath}:`,
                  error
                );
              }
            }

            return processedCount;
          }
        );

        vscode.window.showInformationMessage(
          `Comments removed from ${progress} files`
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Error removing comments: ${error}`);
      }
    }
  );

  context.subscriptions.push(removeCommentsFromCurrentFile);
  context.subscriptions.push(removeCommentsFromAllFiles);
}

function removeComments(source: string, comments: Comment[]): string {
  if (comments.length === 0) {
    return source;
  }

  const sortedComments = [...comments].sort((a, b) => b.range[0] - a.range[0]);

  let result = source;

  for (const comment of sortedComments) {
    const [start, end] = comment.range;

    if (comment.type === 'Line') {
      let lineStart = start;
      while (lineStart > 0 && result.charAt(lineStart - 1) !== '\n') {
        lineStart--;
      }

      let lineEnd = end;
      while (lineEnd < result.length && result.charAt(lineEnd) !== '\n') {
        lineEnd++;
      }

      const lineContent = result.substring(lineStart, lineEnd).trim();

      if (lineContent.startsWith('//')) {
        if (lineStart === 0) {
          result = result.substring(lineEnd + 1);
        } else {
          result = result.substring(0, lineStart) + result.substring(lineEnd);
        }
      } else {
        result = result.substring(0, start) + result.substring(end);
      }
    } else {
      result = result.substring(0, start) + result.substring(end);
    }
  }

  return result;
}

export function deactivate() {}
