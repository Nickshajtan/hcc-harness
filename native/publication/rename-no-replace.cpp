// arch-publication-v1: one same-volume, no-replace operation. No copy fallback.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <cwchar>

static bool absolutePath(const wchar_t* path) {
  // Deliberately support local drive paths only; network/device paths are outside
  // the publication contract. Node supplies resolved, namespaced drive paths.
  return wcslen(path) > 7 && wcsncmp(path, L"\\\\?\\", 4) == 0 &&
      path[5] == L':' && path[6] == L'\\' &&
      ((path[4] >= L'A' && path[4] <= L'Z') ||
       (path[4] >= L'a' && path[4] <= L'z'));
}

int wmain(int argc, wchar_t** argv) {
  DWORD error = ERROR_INVALID_PARAMETER;
  if (argc == 3 && absolutePath(argv[1]) && absolutePath(argv[2]) &&
      _wcsicmp(argv[1], argv[2]) != 0) {
    const DWORD attributes = GetFileAttributesW(argv[1]);
    if (attributes == INVALID_FILE_ATTRIBUTES) {
      error = GetLastError();
    } else if (attributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT)) {
      error = ERROR_INVALID_PARAMETER;
    } else {
      error = MoveFileExW(argv[1], argv[2], 0) ? ERROR_SUCCESS : GetLastError();
    }
  }
  printf("{\"protocol\":1,\"win32\":%lu}\n", error);
  return error == ERROR_SUCCESS ? 0 : 1;
}
