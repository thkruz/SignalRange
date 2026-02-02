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

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;

  // Check if file uses any jest APIs
  const usesJest = /jest\./.test(content);

  if (!usesJest) {
    return false;
  }

  // Replace jest.* with vi.*
  content = content.replace(/jest\.fn\(/g, 'vi.fn(');
  content = content.replace(/jest\.spyOn\(/g, 'vi.spyOn(');
  content = content.replace(/jest\.mock\(/g, 'vi.mock(');
  content = content.replace(/jest\.unmock\(/g, 'vi.unmock(');
  content = content.replace(/jest\.doMock\(/g, 'vi.doMock(');
  content = content.replace(/jest\.resetModules\(/g, 'vi.resetModules(');
  content = content.replace(/jest\.clearAllMocks\(/g, 'vi.clearAllMocks(');
  content = content.replace(/jest\.restoreAllMocks\(/g, 'vi.restoreAllMocks(');
  content = content.replace(/jest\.resetAllMocks\(/g, 'vi.resetAllMocks(');
  content = content.replace(/jest\.useFakeTimers\(/g, 'vi.useFakeTimers(');
  content = content.replace(/jest\.useRealTimers\(/g, 'vi.useRealTimers(');
  content = content.replace(/jest\.advanceTimersByTime\(/g, 'vi.advanceTimersByTime(');
  content = content.replace(/jest\.runAllTimers\(/g, 'vi.runAllTimers(');
  content = content.replace(/jest\.clearAllTimers\(/g, 'vi.clearAllTimers(');
  content = content.replace(/jest\.mocked\(/g, 'vi.mocked(');
  content = content.replace(/jest\.requireActual\(/g, 'vi.importActual(');
  content = content.replace(/jest\.isolateModules\(/g, 'vi.isolateModules(');
  content = content.replace(/jest\.setSystemTime\(/g, 'vi.setSystemTime(');
  content = content.replace(/jest\.getRealSystemTime\(/g, 'vi.getRealSystemTime(');
  content = content.replace(/jest\.runOnlyPendingTimers\(/g, 'vi.runOnlyPendingTimers(');
  content = content.replace(/jest\.advanceTimersToNextTimer\(/g, 'vi.advanceTimersToNextTimer(');
  content = content.replace(/jest\.getTimerCount\(/g, 'vi.getTimerCount(');
  content = content.replace(/jest\.setTimeout\(/g, 'vi.setConfig({ testTimeout:');
  content = content.replace(/jest\.retryTimes\(/g, '// vi.retryTimes(');

  // Replace jest.Mock type assertions with Mock from vitest
  content = content.replace(/as jest\.Mock\b/g, 'as Mock');
  content = content.replace(/jest\.Mock\b/g, 'Mock');
  content = content.replace(/jest\.MockedFunction/g, 'MockedFunction');
  content = content.replace(/jest\.MockedClass/g, 'MockedClass');
  content = content.replace(/jest\.Mocked</g, 'Mocked<');
  content = content.replace(/jest\.SpyInstance/g, 'SpyInstance');
  content = content.replace(/jest\.advanceTimersByTimeAsync\(/g, 'vi.advanceTimersByTimeAsync(');

  // Determine what vitest imports are needed
  const needsVi = content.includes('vi.');
  const needsMock = content.includes(': Mock') || content.includes('as Mock') || content.includes('<Mock');
  const needsMocked = content.includes('Mocked<');
  const needsMockedFunction = content.includes('MockedFunction');
  const needsMockedClass = content.includes('MockedClass');
  const needsSpyInstance = content.includes('SpyInstance');

  // Build the import statement
  const imports = [];
  if (needsVi) imports.push('vi');
  if (needsMock) imports.push('Mock');
  if (needsMocked) imports.push('Mocked');
  if (needsMockedFunction) imports.push('MockedFunction');
  if (needsMockedClass) imports.push('MockedClass');
  if (needsSpyInstance) imports.push('SpyInstance');

  if (imports.length > 0 && !content.includes("from 'vitest'") && !content.includes('from "vitest"')) {
    const importStatement = `import { ${imports.join(', ')} } from 'vitest';\n`;
    // Find the first import statement
    const importMatch = content.match(/^(import\s+.*?['"];?\s*\n)/m);
    if (importMatch) {
      const firstImport = importMatch[0];
      const importIndex = content.indexOf(firstImport);
      content = content.slice(0, importIndex) + importStatement + content.slice(importIndex);
    } else {
      // No imports found, add at the beginning
      content = importStatement + content;
    }
  } else if (imports.length > 0 && content.includes("from 'vitest'")) {
    // Update existing vitest import to include Mock if needed
    if (needsMock && !content.includes('Mock')) {
      content = content.replace(/import \{ ([^}]+) \} from 'vitest'/, (match, existingImports) => {
        const allImports = [...new Set([...existingImports.split(/,\s*/), ...imports])];
        return `import { ${allImports.join(', ')} } from 'vitest'`;
      });
    }
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    return true;
  }

  return false;
}

const testFiles = getAllTestFiles(testDir);
let migratedCount = 0;

console.log(`Found ${testFiles.length} test files`);

for (const file of testFiles) {
  const relativePath = path.relative(path.join(__dirname, '..'), file);
  if (migrateFile(file)) {
    console.log(`Migrated: ${relativePath}`);
    migratedCount++;
  }
}

console.log(`\nMigration complete: ${migratedCount} files updated`);
