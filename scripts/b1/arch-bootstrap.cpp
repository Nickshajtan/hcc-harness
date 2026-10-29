// B1 feasibility prototype only. Not installed or used by renderFiles().
// Fixed Arch entry point; deliberately not a general process launcher.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string>
#include <vector>
#include <stdexcept>
#include <cstdio>
#include <cwctype>

namespace {
struct Handle {
    HANDLE value;
    explicit Handle(HANDLE h = nullptr) : value(h) {}
    ~Handle() { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
};
struct Failure { std::wstring message; };
[[noreturn]] void fail(const std::wstring& message) { throw Failure{message}; }
std::wstring env(const wchar_t* name) {
    DWORD size = GetEnvironmentVariableW(name, nullptr, 0);
    if (!size) return L"";
    std::vector<wchar_t> text(size);
    if (GetEnvironmentVariableW(name, text.data(), size) >= size) fail(L"Environment changed during runtime selection");
    return text.data();
}
std::wstring directory(const std::wstring& path) { return path.substr(0, path.find_last_of(L"\\/")); }
bool absolute(const std::wstring& path) {
    return (path.size() >= 3 && iswalpha(path[0]) && path[1] == L':' && (path[2] == L'\\' || path[2] == L'/')) ||
        (path.size() > 2 && path[0] == L'\\' && path[1] == L'\\');
}
std::wstring finalPath(const std::wstring& path) {
    Handle file(CreateFileW(path.c_str(), FILE_READ_ATTRIBUTES, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
    if (file.value == INVALID_HANDLE_VALUE) return L"";
    DWORD size = GetFinalPathNameByHandleW(file.value, nullptr, 0, FILE_NAME_NORMALIZED);
    if (!size) return L"";
    std::vector<wchar_t> text(size + 1);
    DWORD used = GetFinalPathNameByHandleW(file.value, text.data(), size + 1, FILE_NAME_NORMALIZED);
    if (!used || used > size) return L"";
    return text.data();
}
bool router(const std::wstring& dir) {
    Handle file(CreateFileW((dir + L"\\.arch-router").c_str(), GENERIC_READ, FILE_SHARE_READ,
        nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
    if (file.value == INVALID_HANDLE_VALUE) return false;
    char bytes[64] = {}; DWORD used = 0;
    return ReadFile(file.value, bytes, sizeof(bytes), &used, nullptr) &&
        std::string(bytes, used) == "arch-harness-router-v1\n";
}
std::wstring quote(const std::wstring& text) {
    std::wstring out = L"\""; size_t slashes = 0;
    for (wchar_t c : text) {
        if (c == L'\\') { ++slashes; continue; }
        out.append(slashes * (c == L'"' ? 2 : 1), L'\\'); slashes = 0;
        if (c == L'"') out += L'\\';
        out += c;
    }
    out.append(slashes * 2, L'\\'); return out + L'"';
}
std::wstring runtime(const std::wstring& self) {
    auto check = [&](const std::wstring& path) {
        std::wstring resolved = finalPath(path);
        if (resolved.empty()) fail(L"Node executable unavailable: " + path);
        DWORD attrs = GetFileAttributesW(resolved.c_str());
        if (attrs == INVALID_FILE_ATTRIBUTES || (attrs & FILE_ATTRIBUTE_DIRECTORY)) fail(L"Node is not an executable file: " + path);
        // Path identity plus file ID catches symlinks and hard-link aliases to self.
        Handle node(CreateFileW(resolved.c_str(), FILE_READ_ATTRIBUTES, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            nullptr, OPEN_EXISTING, 0, nullptr));
        Handle own(CreateFileW(self.c_str(), FILE_READ_ATTRIBUTES, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            nullptr, OPEN_EXISTING, 0, nullptr));
        BY_HANDLE_FILE_INFORMATION a = {}, b = {};
        if (!GetFileInformationByHandle(node.value, &a) || !GetFileInformationByHandle(own.value, &b)) fail(L"Cannot validate Node file identity");
        if ((a.dwVolumeSerialNumber == b.dwVolumeSerialNumber && a.nFileIndexHigh == b.nFileIndexHigh && a.nFileIndexLow == b.nFileIndexLow) ||
            router(directory(path)) || router(directory(resolved))) fail(L"Recursive Arch Node candidate refused: " + path);
        return resolved;
    };
    std::wstring overridePath = env(L"ARCH_NODE");
    // Set-but-empty is also an invalid explicit override.
    SetLastError(ERROR_SUCCESS);
    GetEnvironmentVariableW(L"ARCH_NODE", nullptr, 0);
    bool explicitOverride = GetLastError() != ERROR_ENVVAR_NOT_FOUND;
    if (explicitOverride) {
        if (!absolute(overridePath)) fail(L"ARCH_NODE must be an absolute Node executable path without arguments");
        return check(overridePath);
    }
    std::wstring paths = env(L"PATH");
    for (size_t from = 0; from <= paths.size();) {
        size_t end = paths.find(L';', from); if (end == std::wstring::npos) end = paths.size();
        std::wstring dir = paths.substr(from, end - from);
        if (dir.size() > 1 && dir.front() == L'"' && dir.back() == L'"') dir = dir.substr(1, dir.size() - 2);
        if (!dir.empty() && !router(dir)) {
            std::wstring candidate = dir + L"\\node.exe";
            DWORD attrs = GetFileAttributesW(candidate.c_str());
            if (attrs != INVALID_FILE_ATTRIBUTES && !(attrs & FILE_ATTRIBUTE_DIRECTORY)) return check(candidate);
        }
        if (end == paths.size()) break;
        from = end + 1;
    }
    fail(L"No node.exe on PATH. Set ARCH_NODE to an independently installed compatible Node executable");
}
BOOL WINAPI control(DWORD event) {
    // Console events are broadcast to the inherited console. Wait for Arch's
    // existing handlers/cleanup; never forward a duplicate console event.
    return event == CTRL_C_EVENT || event == CTRL_BREAK_EVENT;
}
DWORD arch(const std::wstring& self, int argc, wchar_t** argv) {
    std::wstring node = runtime(self);
    Handle job(CreateJobObjectW(nullptr, nullptr));
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = {};
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    if (!job.value || !SetInformationJobObject(job.value, JobObjectExtendedLimitInformation, &limits, sizeof(limits)))
        fail(L"Cannot establish Arch process lifetime");
    if (!SetConsoleCtrlHandler(control, TRUE)) fail(L"Cannot register Arch console handler");

    // The only probe is the selected Node's --version; bounded output/time.
    SECURITY_ATTRIBUTES security = {sizeof(SECURITY_ATTRIBUTES), nullptr, TRUE};
    HANDLE readRaw = nullptr, writeRaw = nullptr;
    if (!CreatePipe(&readRaw, &writeRaw, &security, 0)) fail(L"Cannot create runtime version probe pipe");
    Handle reader(readRaw), writer(writeRaw);
    if (!SetHandleInformation(reader.value, HANDLE_FLAG_INHERIT, 0)) fail(L"Cannot protect runtime probe handle");
    Handle nullInput(CreateFileW(L"NUL", GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, &security, OPEN_EXISTING, 0, nullptr));
    STARTUPINFOW probe = {}; probe.cb = sizeof(probe); probe.dwFlags = STARTF_USESTDHANDLES;
    probe.hStdInput = nullInput.value; probe.hStdOutput = writer.value; probe.hStdError = writer.value;
    PROCESS_INFORMATION pi = {};
    std::wstring line = quote(node) + L" --version";
    if (!CreateProcessW(node.c_str(), &line[0], nullptr, nullptr, TRUE, CREATE_SUSPENDED, nullptr, nullptr, &probe, &pi))
        fail(L"Cannot execute Node version probe: " + node);
    Handle process(pi.hProcess), thread(pi.hThread);
    if (!AssignProcessToJobObject(job.value, process.value)) { TerminateProcess(process.value, 1); fail(L"Cannot contain Node probe"); }
    if (ResumeThread(thread.value) == static_cast<DWORD>(-1)) fail(L"Cannot start Node probe");
    if (WaitForSingleObject(process.value, 3000) != WAIT_OBJECT_0) fail(L"Node version probe timed out: " + node);
    DWORD exit = 1; GetExitCodeProcess(process.value, &exit);
    DWORD available = 0;
    if (!PeekNamedPipe(reader.value, nullptr, 0, nullptr, &available, nullptr) || available == 0 || available > 128 || exit != 0)
        fail(L"Invalid Node version probe: " + node);
    char bytes[129] = {}; DWORD used = 0;
    if (!ReadFile(reader.value, bytes, available, &used, nullptr)) fail(L"Cannot read Node version");
    std::string version(bytes, used);
    // Strict release version only. Do not weaken package engines for bootstrap.
    unsigned major = 0, minor = 0, patch = 0; int consumed = 0;
    bool parsed = sscanf_s(version.c_str(), "v%u.%u.%u%n", &major, &minor, &patch, &consumed) == 3;
    std::string tail = parsed ? version.substr(static_cast<size_t>(consumed)) : "invalid";
    if (!parsed || (tail != "\r\n" && tail != "\n") || major != 24 || minor < 15)
        fail(L"Incompatible Node at " + node + L" (reported " + std::wstring(version.begin(), version.end()) +
            L"); Arch requires >=24.15.0 <25. Set ARCH_NODE explicitly; project Node/PATH will not be changed");
    // Close probe handles before the harness can inherit them.
    CloseHandle(writer.value); writer.value = nullptr;
    CloseHandle(reader.value); reader.value = nullptr;
    CloseHandle(nullInput.value); nullInput.value = nullptr;
    std::wstring cli = directory(self) + L"\\dist\\cli.js";
    if (GetFileAttributesW(cli.c_str()) == INVALID_FILE_ATTRIBUTES) fail(L"Arch application missing beside bootstrap: " + cli);
    line = quote(node) + L" " + quote(cli);
    for (int i = 1; i < argc; ++i) line += L" " + quote(argv[i]);
    STARTUPINFOW startup = {}; startup.cb = sizeof(startup);
    GetStartupInfoW(&startup);
    // Preserve real pipe/console handles; no new console, shell, PATH or cwd.
    startup.dwFlags |= STARTF_USESTDHANDLES;
    startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
    startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
    PROCESS_INFORMATION child = {};
    if (!CreateProcessW(node.c_str(), &line[0], nullptr, nullptr, TRUE, CREATE_SUSPENDED, nullptr, nullptr, &startup, &child))
        fail(L"Cannot start Arch with selected Node: " + node);
    Handle childProcess(child.hProcess), childThread(child.hThread);
    if (!AssignProcessToJobObject(job.value, childProcess.value)) { TerminateProcess(childProcess.value, 1); fail(L"Cannot contain Arch process"); }
    if (ResumeThread(childThread.value) == static_cast<DWORD>(-1)) fail(L"Cannot resume Arch process");
    if (WaitForSingleObject(childProcess.value, INFINITE) != WAIT_OBJECT_0 || !GetExitCodeProcess(childProcess.value, &exit))
        fail(L"Cannot read Arch exit status");
    return exit;
}
void diagnostic(const std::wstring& text) {
    std::wstring message = L"[arch bootstrap] " + text + L"\n";
    int size = WideCharToMultiByte(CP_UTF8, 0, message.data(), static_cast<int>(message.size()), nullptr, 0, nullptr, nullptr);
    std::vector<char> bytes(size); DWORD used = 0;
    WideCharToMultiByte(CP_UTF8, 0, message.data(), static_cast<int>(message.size()), bytes.data(), size, nullptr, nullptr);
    WriteFile(GetStdHandle(STD_ERROR_HANDLE), bytes.data(), static_cast<DWORD>(bytes.size()), &used, nullptr);
}
}
int wmain(int argc, wchar_t** argv) {
    try {
        std::vector<wchar_t> self(32768);
        DWORD size = GetModuleFileNameW(nullptr, self.data(), static_cast<DWORD>(self.size()));
        if (!size || size >= self.size()) fail(L"Cannot resolve Arch bootstrap location");
        return static_cast<int>(arch(self.data(), argc, argv));
    } catch (const Failure& error) { diagnostic(error.message); return 1; }
    catch (...) { diagnostic(L"Unexpected bootstrap failure"); return 1; }
}
