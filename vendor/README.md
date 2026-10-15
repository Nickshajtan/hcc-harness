# Windows launcher provenance

These are the unmodified native C++ Scoop launchers from
[ScoopInstaller/Shim cpp/v0.3.0](https://github.com/ScoopInstaller/Shim/releases/tag/cpp/v0.3.0).
Arch uses the MIT license in `SHIM-LICENSE`. Scoop itself is not required.
The launchers start Node directly, prepend fixed arguments, inherit console handles,
preserve the incoming argument tail, and return the child status.

| Artifact | SHA-256 |
|---|---|
| `shim-x64.exe` | `d3b20f2b732ec3e7939295997a005f05fc15b16ab75c109aea015783ba39e192` |
| `shim-arm64.exe` | `1c51e7c0191242376aef1d280a17f9b4907b1e48f7197e7061b4c102b6224214` |
| Upstream `shim-x64.zip` | `59d89d5895d9d2a0f4b1d3919d9e59b47e5ed6770a8cb3543618037d28e0fb27` |
| Upstream `shim-arm64.zip` | `829958242de93982454595bbaded7c7769a7d99ee2cfbc2093579f277df3d16b` |

Archive hashes were compared with the GitHub release API `digest` fields before extraction.
ARM64 is supplied but has not been executed locally.
