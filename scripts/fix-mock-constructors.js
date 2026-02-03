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

  // Pattern 1: vi.fn().mockImplementation(() => functionCall())
  // Change to: vi.fn(function() { return functionCall(); })
  content = content.replace(
    /vi\.fn\(\)\.mockImplementation\(\(\) => ([a-zA-Z_][a-zA-Z0-9_]*\(\))\)/g,
    (match, funcCall) => {
      return `vi.fn(function() { return ${funcCall}; })`;
    }
  );

  // Pattern 2: vi.fn().mockImplementation(() => variableName)
  // Change to: vi.fn(function() { return variableName; })
  content = content.replace(
    /vi\.fn\(\)\.mockImplementation\(\(\) => ([a-zA-Z_][a-zA-Z0-9_]*)\)/g,
    (match, varName) => {
      return `vi.fn(function() { return ${varName}; })`;
    }
  );

  // Pattern 3: vi.fn().mockImplementation((params) => ({...})) - with parameters
  // Change to: vi.fn(function(params) { return {...}; })
  content = content.replace(
    /vi\.fn\(\)\.mockImplementation\(\(([^)]*)\) => \((\{[\s\S]*?\})\)\)/g,
    (match, params, objectLiteral) => {
      return `vi.fn(function(${params}) { return ${objectLiteral}; })`;
    }
  );

  // Pattern 4: vi.fn().mockImplementation((id: type) => expression)
  // Change to: vi.fn(function(id: type) { return expression; })
  content = content.replace(
    /vi\.fn\(\)\.mockImplementation\(\(([^)]+)\) => ([^{][^)]+)\)/g,
    (match, params, expr) => {
      // Only fix if expr doesn't start with { (that's a different pattern)
      if (expr.trim().startsWith('{')) return match;
      return `vi.fn(function(${params}) { return ${expr}; })`;
    }
  );

  // Pattern 5: vi.fn().mockImplementation(() => ({...})) - simple inline object
  // Change to: vi.fn(function() { return {...}; })
  content = content.replace(
    /vi\.fn\(\)\.mockImplementation\(\(\) => \((\{[\s\S]*?\})\)\)/g,
    (match, objectLiteral) => {
      return `vi.fn(function() { return ${objectLiteral}; })`;
    }
  );

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
