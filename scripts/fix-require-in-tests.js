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

  // Find all require patterns in test bodies
  const requirePattern = /const \{ ([^}]+) \} = require\(['"]([^'"]+)['"]\);/g;
  const matches = [...content.matchAll(requirePattern)];

  if (matches.length === 0) {
    return false;
  }

  const importsToAdd = new Map(); // path -> Set of names

  for (const match of matches) {
    const [fullMatch, names, importPath] = match;
    const nameList = names.split(',').map(n => n.trim());

    if (!importsToAdd.has(importPath)) {
      importsToAdd.set(importPath, new Set());
    }
    for (const name of nameList) {
      importsToAdd.get(importPath).add(name);
    }

    // Remove the require line from the test body
    content = content.replace(fullMatch + '\n', '');
    content = content.replace(fullMatch, ''); // In case no newline
  }

  // Check what's already imported and add missing imports
  for (const [importPath, names] of importsToAdd) {
    for (const name of names) {
      // Check if already imported
      const importRegex = new RegExp(`import\\s+\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+['"]${importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
      if (!importRegex.test(content)) {
        // Add the import after the last vi.mock or after imports section
        const lastMockIndex = content.lastIndexOf('vi.mock(');
        if (lastMockIndex !== -1) {
          // Find the end of the vi.mock block
          let braceCount = 0;
          let inString = false;
          let stringChar = '';
          let endIndex = lastMockIndex;

          for (let i = lastMockIndex; i < content.length; i++) {
            const char = content[i];

            if (!inString) {
              if (char === '"' || char === "'" || char === '`') {
                inString = true;
                stringChar = char;
              } else if (char === '(') {
                braceCount++;
              } else if (char === ')') {
                braceCount--;
                if (braceCount === 0) {
                  endIndex = i;
                  break;
                }
              }
            } else {
              if (char === stringChar && content[i - 1] !== '\\') {
                inString = false;
              }
            }
          }

          // Find the end of the line containing the closing
          while (endIndex < content.length && content[endIndex] !== '\n') {
            endIndex++;
          }

          const importStatement = `\nimport { ${name} } from '${importPath}';`;
          content = content.slice(0, endIndex + 1) + importStatement + content.slice(endIndex + 1);
        }
      }
    }
  }

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
