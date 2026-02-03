const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, '..', 'test');

function getAllTestFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllTestFiles(fullPath));
    } else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;

  // Pattern: .mockImplementation(() => expression) where expression is not a block
  // Change to: .mockImplementation(function() { return expression; })
  // This handles: mockImplementation(() => mockBox), mockImplementation(() => mockInstance)
  content = content.replace(
    /\.mockImplementation\(\(\) => ([^{][^)]*)\)/g,
    (match, expr) => {
      // Skip if it already uses function or if the expression looks complex
      if (expr.includes('function') || expr.startsWith('{')) {
        return match;
      }
      return `.mockImplementation(function() { return ${expr}; })`;
    }
  );

  // Pattern: .mockImplementation(() => ({ ... })) - multi-line object literal
  // Need to handle carefully to not break nested structures
  // Match .mockImplementation(() => ({ with proper closing
  const pattern = /\.mockImplementation\(\(\) => \(\{/g;
  let newContent = content;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const startIdx = match.index;
    const searchStart = startIdx + match[0].length;

    // Find the matching closing }))
    let braceCount = 1;
    let i = searchStart;
    let inString = false;
    let stringChar = '';

    while (i < content.length && braceCount > 0) {
      const char = content[i];

      if (!inString) {
        if (char === '"' || char === "'" || char === '`') {
          inString = true;
          stringChar = char;
        } else if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        }
      } else {
        if (char === stringChar && content[i - 1] !== '\\') {
          inString = false;
        }
      }
      i++;
    }

    // Check if we found }))
    if (braceCount === 0 && content.slice(i, i + 2) === '))') {
      const objectContent = content.slice(searchStart - 1, i); // includes the { ... }
      const fullMatch = content.slice(startIdx, i + 2);
      const replacement = `.mockImplementation(function() { return ${objectContent}; })`;
      newContent = newContent.replace(fullMatch, replacement);
    }
  }

  content = newContent;

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    return true;
  }

  return false;
}

const testFiles = getAllTestFiles(testDir);
let fixedCount = 0;

console.log(`Found ${testFiles.length} test files`);

for (const file of testFiles) {
  const relativePath = path.relative(path.join(__dirname, '..'), file);
  if (fixFile(file)) {
    console.log(`Fixed: ${relativePath}`);
    fixedCount++;
  }
}

console.log(`\nFix complete: ${fixedCount} files updated`);
