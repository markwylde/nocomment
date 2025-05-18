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

  let lines = source.split('\n');
  const lineInfo = lines.map(() => ({ hasComment: false, hasCode: false }));

  for (const comment of comments) {
    const startPos =
      source.substring(0, comment.range[0]).split('\n').length - 1;
    const endPos = source.substring(0, comment.range[1]).split('\n').length - 1;

    for (let i = startPos; i <= endPos; i++) {
      lineInfo[i].hasComment = true;

      if (i === startPos) {
        const beforeComment = source
          .substring(
            source.lastIndexOf('\n', comment.range[0] - 1) + 1,
            comment.range[0]
          )
          .trim();

        if (beforeComment) {
          lineInfo[i].hasCode = true;
        }
      }

      if (i === endPos && comment.type === 'Line') {
        lineInfo[i].hasCode = false;
      } else if (i === endPos) {
        const afterComment = source
          .substring(
            comment.range[1],
            source.indexOf('\n', comment.range[1]) === -1
              ? source.length
              : source.indexOf('\n', comment.range[1])
          )
          .trim();

        if (afterComment) {
          lineInfo[i].hasCode = true;
        }
      }

      if (i > startPos && i < endPos) {
        lineInfo[i].hasCode = false;
      }
    }
  }

  const sortedComments = [...comments].sort((a, b) => b.range[0] - a.range[0]);

  let result = source;

  for (const comment of sortedComments) {
    result =
      result.substring(0, comment.range[0]) +
      result.substring(comment.range[1]);
  }

  lines = result.split('\n');
  const newLines = [];

  for (let i = 0; i < lines.length; i++) {
    if (
      i < lineInfo.length &&
      lineInfo[i].hasComment &&
      !lineInfo[i].hasCode &&
      !lines[i].trim()
    ) {
      continue;
    }

    newLines.push(lines[i]);
  }

  result = newLines.join('\n');

  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

export function deactivate() {}
