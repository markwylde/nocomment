import * as vscode from 'vscode';
import * as parser from '@typescript-eslint/typescript-estree';
import * as path from 'node:path';

interface Comment {
  type: 'Line' | 'Block';
  value: string;
  range: [number, number];
}

export function activate(context: vscode.ExtensionContext) {
  console.log('NoComment is now active');

  const disposable = vscode.commands.registerCommand(
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

  context.subscriptions.push(disposable);
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
