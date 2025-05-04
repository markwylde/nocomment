# NoComment

A VS Code extension to remove comments from JavaScript and TypeScript files using AST parsing.

## Features

- Removes both line comments (`// ...`) and block comments (`/* ... */`) from JS/TS files
- Preserves code structure and formatting
- Uses AST parsing for precise comment detection
- Works with JS, JSX, TS, and TSX files

## Usage

1. Open a JavaScript or TypeScript file
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the command palette
3. Search for and select `NoComment: Remove Comments from Current File`
4. All comments will be removed from your current file

## How It Works

This extension uses the TypeScript ESTree parser to analyze your code's abstract syntax tree and accurately identify and remove comments, preserving the original code structure and functionality.

## Requirements

VS Code 1.60.0 or higher

## Extension Settings

This extension does not add any settings.

## Known Limitations

- The extension will not work on files with syntax errors
- In some rare cases, the removal of line comments that contain entire lines may affect blank line spacing

## Release Notes

### 0.1.0

- Initial release
- Support for removing comments from JS, JSX, TS, and TSX files