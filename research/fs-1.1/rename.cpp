// Isolated feasibility helper. No production caller. No fallback or retries.
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
#include <cwchar>
#include <cstring>
#include <vector>
#include <cstddef>

static DWORD publish(const wchar_t* method, const wchar_t* stage, const wchar_t* target) {
  if (wcscmp(method, L"move") == 0) {
    return MoveFileExW(stage, target, 0) ? 0 : GetLastError();
  }
  HANDLE file = CreateFileW(stage, DELETE | FILE_READ_ATTRIBUTES,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
      OPEN_EXISTING, FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
  if (file == INVALID_HANDLE_VALUE) return GetLastError();
  const DWORD size = static_cast<DWORD>(wcslen(target) * sizeof(wchar_t));
  std::vector<unsigned char> storage(sizeof(FILE_RENAME_INFO) + size, 0);
  auto* info = reinterpret_cast<FILE_RENAME_INFO*>(storage.data());
  info->ReplaceIfExists = FALSE;
  info->RootDirectory = nullptr;
  info->FileNameLength = size;
  memcpy(info->FileName, target, size);
  DWORD error = SetFileInformationByHandle(file, FileRenameInfo, info,
      static_cast<DWORD>(storage.size())) ? 0 : GetLastError();
  CloseHandle(file);
  return error;
}

int wmain(int argc, wchar_t** argv) {
  if (argc == 2 && wcscmp(argv[1], L"--version") == 0) { puts("fs-1.1-prototype"); return 0; }
  if (argc == 4 && wcscmp(argv[1], L"hold") == 0) {
    DWORD sharing = wcscmp(argv[3], L"shared") == 0 ? 7 : FILE_SHARE_READ;
    HANDLE file = CreateFileW(argv[2], GENERIC_READ, sharing, nullptr,
        OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) {
      printf("{\"error\":%lu}\n", GetLastError());
      return 1;
    }
    puts("ready"); fflush(stdout); getchar(); CloseHandle(file); return 0;
  }
  const bool immediate = argc == 5 && wcscmp(argv[4], L"--immediate") == 0;
  if ((!immediate && argc != 4) || (wcscmp(argv[1], L"move") != 0 && wcscmp(argv[1], L"handle") != 0)) return 2;
  // Explicit process barriers permit real competing publishers and termination.
  if (!immediate) {
    puts("ready"); fflush(stdout);
    if (getchar() != 'g') return 2;
  }
  DWORD error = publish(argv[1], argv[2], argv[3]);
  printf("{\"error\":%lu}\n", error); fflush(stdout);
  if (!immediate) getchar(); // Post-publication checkpoint.
  return error == 0 ? 0 : 1;
}
#else
#define _GNU_SOURCE 1
#include <stdio.h>
#include <errno.h>
#include <fcntl.h>
#ifndef __APPLE__
#include <linux/fs.h>
#endif
int main(int argc, char** argv) {
  if (argc != 4) return 2;
  puts("ready"); fflush(stdout);
  if (getchar() != 'g') return 2;
#ifdef __APPLE__
  int result = renamex_np(argv[2], argv[3], RENAME_EXCL);
#else
  int result = renameat2(AT_FDCWD, argv[2], AT_FDCWD, argv[3], RENAME_NOREPLACE);
#endif
  int error = result == 0 ? 0 : errno;
  printf("{\"error\":%d}\n", error); fflush(stdout); getchar();
  return result == 0 ? 0 : 1;
}
#endif
