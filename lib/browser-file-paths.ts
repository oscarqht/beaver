type FileWithPath = File & {
  path?: string;
  webkitRelativePath?: string;
};

function toFileArray(files: Iterable<File> | ArrayLike<File> | null | undefined): FileWithPath[] {
  if (!files) {
    return [];
  }
  return Array.from(files as ArrayLike<File>) as FileWithPath[];
}

export function browserSupportsAbsoluteFilePaths(): boolean {
  return typeof File !== 'undefined' && 'path' in File.prototype;
}

export function getAbsolutePathsFromFiles(files: Iterable<File> | ArrayLike<File> | null | undefined): string[] {
  return toFileArray(files)
    .map((file) => file.path?.trim() ?? '')
    .filter(Boolean);
}

export function getDirectoryPathFromFiles(
  files: Iterable<File> | ArrayLike<File> | null | undefined,
): string | null {
  const [firstFile] = toFileArray(files);
  if (!firstFile?.path || !firstFile.webkitRelativePath) {
    return null;
  }

  const normalizedAbsolutePath = firstFile.path.replace(/\\/g, '/');
  const normalizedRelativePath = firstFile.webkitRelativePath.replace(/\\/g, '/');
  if (!normalizedAbsolutePath.endsWith(normalizedRelativePath)) {
    return null;
  }

  const rootPath = normalizedAbsolutePath
    .slice(0, normalizedAbsolutePath.length - normalizedRelativePath.length)
    .replace(/[\\/]+$/, '');

  if (rootPath) {
    return rootPath;
  }

  if (normalizedAbsolutePath.startsWith('/')) {
    return '/';
  }

  const driveMatch = normalizedAbsolutePath.match(/^[A-Za-z]:/);
  return driveMatch ? driveMatch[0] : null;
}

export async function requestInputSelection<T>(
  input: HTMLInputElement | null,
  extractValue: (files: FileList | null) => T | null,
): Promise<T | null> {
  if (!input) {
    return null;
  }

  input.value = '';

  return await new Promise<T | null>((resolve) => {
    let settled = false;

    const finish = (value: T | null) => {
      if (settled) {
        return;
      }
      settled = true;
      input.value = '';
      input.removeEventListener('change', handleChange);
      input.removeEventListener('cancel', handleCancel as EventListener);
      window.removeEventListener('focus', handleFocus);
      resolve(value);
    };

    const handleChange = () => {
      finish(extractValue(input.files));
    };

    const handleCancel = () => {
      finish(null);
    };

    const handleFocus = () => {
      window.setTimeout(() => {
        if (!settled) {
          finish(null);
        }
      }, 0);
    };

    input.addEventListener('change', handleChange, { once: true });
    input.addEventListener('cancel', handleCancel as EventListener, { once: true });
    window.addEventListener('focus', handleFocus, { once: true });
    input.click();
  });
}
