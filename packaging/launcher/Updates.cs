// s0L updates, the launcher's side: checking a staged release before anything of it runs, and
// swapping it in (or back out). The folder contract with Flask (core/shell/updates.py) is .update\.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

namespace S0L
{
    static class Updates
    {
        // Exit codes of --verify; core/shell/updates.py reads them.
        public const int Ok = 0;
        public const int NotSigned = 1;
        public const int OtherPublisher = 2;
        public const int FilesDiffer = 3;
        public const int LauncherUnsigned = 4;
        public const int CouldNotCheck = 5;
        public const int OtherVersion = 6;
        // --check-files answers with this, not 0: an older s0L.exe that doesn't know the
        // flag would start as the app or exit 0, and must never pass for a checked package.
        public const int FilesMatch = 77;

        const string ManifestResource = "s0L.manifest";
        const int CheckFilesTimeoutMs = 120000;
        // Longer than the new launcher's own 150 s wait for its first start, so a slow start isn't cut short.
        const int StartTimeoutSeconds = 180;
        const int MoveAttempts = 20;
        // s0L.exe moves last, so the s0L folder is without one for a single rename at most.
        static readonly string[] PackageParts = { "app", "runtime", "s0L.exe" };
        static readonly string[] SnapshotFiles =
        {
            @"data\deals_data.json", @"gssm\store.sqlite", @"gssm\store.sqlite-wal", @"gssm\store.sqlite-shm",
        };

        static readonly string Local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "s0L");
        static readonly string UpdateDir = Path.Combine(Launcher.Root, ".update");
        static readonly string PreviousDir = Path.Combine(Launcher.Root, ".previous");
        static readonly string FailedDir = Path.Combine(UpdateDir, "failed");
        static readonly string Journal = Path.Combine(UpdateDir, "swapping");
        // Not in the s0L folder: people zip and share that folder, and this copy holds their deals.
        static readonly string SnapshotDir = Path.Combine(Local, "update-snapshot");
        public static readonly string Staging = Path.Combine(UpdateDir, "staging");

        // The version Flask checked and staged, while its files are still in place; null otherwise.
        public static string ReadyVersion()
        {
            try
            {
                string text = File.ReadAllText(Path.Combine(UpdateDir, "ready")).Trim();
                if (!Regex.IsMatch(text, @"^\d+\.\d+\.\d+$")) return null;
                return File.Exists(Path.Combine(Staging, "s0L.exe")) ? text : null;
            }
            catch (Exception)
            {
                return null;
            }
        }

        public static bool RestartRequested()
        {
            return File.Exists(Path.Combine(UpdateDir, "restart"));
        }

        public static void ClearRestart()
        {
            TryDeleteFile(Path.Combine(UpdateDir, "restart"));
        }

        public static void ClearMarkers()
        {
            TryDeleteFile(Path.Combine(UpdateDir, "ready"));
            ClearRestart();
            TryDeleteDirectory(Staging);
        }

        // A release that failed its check: a definite "bad" is remembered, anything else is fetched again later.
        public static void Discard(string version, int verdict)
        {
            if (verdict == NotSigned || verdict == OtherPublisher || verdict == FilesDiffer || verdict == OtherVersion)
                MarkBad(version);
            ClearMarkers();
        }

        public static void MarkBad(string version)
        {
            try
            {
                string path = Path.Combine(UpdateDir, "bad-versions");
                string known = File.Exists(path) ? File.ReadAllText(path) : "";
                if (Array.IndexOf(known.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries), version) < 0)
                    File.AppendAllText(path, version + "\n");
            }
            catch (Exception ex)
            {
                Log("Could not record " + version + " as bad: " + ex.Message);
            }
        }

        public static void Log(string line)
        {
            try
            {
                string dir = Path.Combine(Local, "logs");
                Directory.CreateDirectory(dir);
                File.AppendAllText(Path.Combine(dir, "update.log"), DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss ") + line + Environment.NewLine);
            }
            catch (Exception)
            {
            }
        }

        public static void WaitForPortsFree()
        {
            DateTime deadline = DateTime.UtcNow.AddSeconds(20);
            while (DateTime.UtcNow < deadline && PortsBusy()) Thread.Sleep(250);
        }

        public static bool PortsBusy()
        {
            return Launcher.PortAnswers(Launcher.FlaskPort) || Launcher.PortAnswers(Launcher.GssmPort);
        }

        // Renames inside the s0L folder fail while anything still runs from it.
        public static void WaitForNothingRunningFromRoot()
        {
            int self = Process.GetCurrentProcess().Id;
            DateTime deadline = DateTime.UtcNow.AddSeconds(20);
            while (DateTime.UtcNow < deadline && RunningFromRoot(self)) Thread.Sleep(500);
        }

        static bool RunningFromRoot(int self)
        {
            bool found = false;
            foreach (Process process in Process.GetProcesses())
            {
                using (process)
                {
                    if (found || process.Id == self) continue;
                    try
                    {
                        found = process.MainModule.FileName.StartsWith(Launcher.Root, StringComparison.OrdinalIgnoreCase);
                    }
                    catch (Exception)
                    {
                    }
                }
            }
            return found;
        }

        // Copies of the deals file and GSSM store, put back if the new version fails its first start.
        public static bool Snapshot()
        {
            try
            {
                TryDeleteDirectory(SnapshotDir);
                Directory.CreateDirectory(SnapshotDir);
                foreach (string relative in SnapshotFiles)
                {
                    string source = Path.Combine(Local, relative);
                    if (!File.Exists(source)) continue;
                    string copy = Path.Combine(SnapshotDir, relative);
                    Directory.CreateDirectory(Path.GetDirectoryName(copy));
                    File.Copy(source, copy, true);
                }
                File.WriteAllText(Path.Combine(SnapshotDir, "complete"), "");
                return true;
            }
            catch (Exception ex)
            {
                Log("Could not copy the data aside, so the update waits: " + ex.Message);
                TryDeleteDirectory(SnapshotDir);
                return false;
            }
        }

        public static void RestoreSnapshot()
        {
            // Without a complete copy, the live data is left exactly as it is.
            if (!File.Exists(Path.Combine(SnapshotDir, "complete")))
            {
                Log("No complete copy of the data to put back; leaving it as it is");
                return;
            }
            foreach (string relative in SnapshotFiles)
            {
                string copy = Path.Combine(SnapshotDir, relative);
                string live = Path.Combine(Local, relative);
                try
                {
                    // A SQLite journal the failed version left behind must not replay onto the restored store.
                    if (File.Exists(copy)) File.Copy(copy, live, true);
                    else TryDeleteFile(live);
                }
                catch (Exception ex)
                {
                    Log("Could not restore " + relative + ": " + ex.Message);
                }
            }
            DropSnapshot();
        }

        public static void DropSnapshot()
        {
            TryDeleteDirectory(SnapshotDir);
        }

        // Renames (same drive) each part of the current version into .previous and the staged one into
        // place, journaling every move. Returns the moves, for SwapBack. On failure undoes them and returns
        // null; intact is false when even the undo failed.
        public static List<string> Swap(out bool intact)
        {
            intact = true;
            List<string> moved = new List<string>();
            try
            {
                if (Directory.Exists(PreviousDir)) Directory.Delete(PreviousDir, true);
                Directory.CreateDirectory(PreviousDir);
                foreach (string part in PackageParts)
                {
                    Move(Path.Combine(Launcher.Root, part), Path.Combine(PreviousDir, part));
                    Record(moved, "old:" + part);
                    Move(Path.Combine(Staging, part), Path.Combine(Launcher.Root, part));
                    Record(moved, "new:" + part);
                }
                return moved;
            }
            catch (Exception ex)
            {
                Log("Swap stopped (" + ex.Message + "); undoing " + moved.Count + " moves");
                intact = Undo(moved, Staging);
                return null;
            }
        }

        // After a failed start: the new version goes to .update\failed and the old one comes back.
        public static bool SwapBack(List<string> moved)
        {
            TryDeleteDirectory(FailedDir);
            Directory.CreateDirectory(FailedDir);
            if (!Undo(moved, FailedDir)) return false;
            TryDeleteDirectory(FailedDir);
            return true;
        }

        public static void FinishSwap()
        {
            TryDeleteFile(Journal);
            DropSnapshot();
        }

        // At a fresh start, after a crash or power cut mid-update: a finished swap stands, a partial one is
        // undone. False when the folder couldn't be put back together.
        public static bool RecoverInterruptedSwap()
        {
            bool intact = true;
            try
            {
                if (File.Exists(Journal))
                {
                    List<string> moved = new List<string>(File.ReadAllLines(Journal));
                    if (moved.Count == PackageParts.Length * 2)
                    {
                        Log("A finished swap was never confirmed; keeping it");
                        TryDeleteFile(Journal);
                    }
                    else
                    {
                        Log("An unfinished swap was found; undoing " + moved.Count + " moves");
                        intact = SwapBack(moved);
                        // Half of the staged release moved and back; Flask fetches it again rather than fail its check.
                        if (intact) ClearMarkers();
                    }
                }
            }
            catch (Exception ex)
            {
                Log("Could not recover an interrupted swap: " + ex.Message);
                intact = false;
            }
            if (intact) DropSnapshot();
            return intact;
        }

        public static string BrokenInstallMessage()
        {
            return "s0L couldn't finish putting its previous version back after an update. Your data is safe in " +
                   Local + ". To repair s0L, unzip it again, or copy the files in " + PreviousDir + " back into " +
                   Launcher.Root.TrimEnd('\\') + ".";
        }

        // Stops at the first move it can't undo, so the journal still matches the folder for a later recovery.
        static bool Undo(List<string> moved, string newHome)
        {
            for (int i = moved.Count - 1; i >= 0; i--)
            {
                string part = moved[i].Substring(4);
                try
                {
                    if (moved[i].StartsWith("new:")) Move(Path.Combine(Launcher.Root, part), Path.Combine(newHome, part));
                    else Move(Path.Combine(PreviousDir, part), Path.Combine(Launcher.Root, part));
                }
                catch (Exception ex)
                {
                    Log("Undo of " + moved[i] + " failed: " + ex.Message);
                    return false;
                }
                moved.RemoveAt(i);
                WriteJournal(moved);
            }
            return true;
        }

        static void Record(List<string> moved, string step)
        {
            moved.Add(step);
            WriteJournal(moved);
        }

        static void WriteJournal(List<string> moved)
        {
            if (moved.Count == 0) TryDeleteFile(Journal);
            else File.WriteAllLines(Journal, moved.ToArray());
        }

        // Antivirus and indexers hold freshly written files for a moment, so each rename gets a few tries.
        static void Move(string from, string to)
        {
            for (int attempt = 1; ; attempt++)
            {
                try
                {
                    if (Directory.Exists(from)) Directory.Move(from, to);
                    else File.Move(from, to);
                    return;
                }
                catch (IOException)
                {
                    if (attempt >= MoveAttempts) throw;
                }
                catch (UnauthorizedAccessException)
                {
                    if (attempt >= MoveAttempts) throw;
                }
                Thread.Sleep(250);
            }
        }

        // A release that didn't start gets one more chance (Flask fetches it again); a second failure marks it bad.
        public static bool RecordFailure(string version)
        {
            string path = Path.Combine(UpdateDir, "failed-once");
            try
            {
                string[] seen = File.Exists(path) ? File.ReadAllLines(path) : new string[0];
                if (Array.IndexOf(seen, version) >= 0)
                {
                    MarkBad(version);
                    return true;
                }
                File.AppendAllText(path, version + Environment.NewLine);
            }
            catch (Exception ex)
            {
                Log("Could not record the failed start of " + version + ": " + ex.Message);
            }
            return false;
        }

        public static void KeepFailedLogs(string version)
        {
            foreach (string name in new[] { "flask", "gssm" })
            {
                string log = Path.Combine(Local, @"logs\" + name + ".log");
                try
                {
                    if (File.Exists(log)) File.Copy(log, Path.Combine(Local, @"logs\update-" + version + "-" + name + ".log"), true);
                }
                catch (Exception)
                {
                }
            }
        }

        // True once the new version's server answers with its own version.
        public static bool WaitForVersion(string target, Process launcher)
        {
            DateTime deadline = DateTime.UtcNow.AddSeconds(StartTimeoutSeconds);
            while (DateTime.UtcNow < deadline)
            {
                if (launcher.HasExited) return false;
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + Launcher.FlaskPort + "/api/updates/version");
                    request.Timeout = 2000;
                    request.Proxy = null;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                    {
                        if (reader.ReadToEnd().Trim() == target) return true;
                    }
                }
                catch (WebException)
                {
                }
                Thread.Sleep(1000);
            }
            return false;
        }

        static void TryDeleteFile(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch (Exception)
            {
            }
        }

        static void TryDeleteDirectory(string path)
        {
            try
            {
                if (Directory.Exists(path)) Directory.Delete(path, true);
            }
            catch (Exception)
            {
            }
        }

        // Every file in dir matches the list compiled into this s0L.exe, dir's s0L.exe is this very file,
        // and nothing else is there.
        public static int CheckFiles(string dir)
        {
            try
            {
                Dictionary<string, string> expected = ReadManifest();
                if (expected == null) return FilesDiffer;
                string root = Path.GetFullPath(dir).TrimEnd('\\') + "\\";
                string staged = root + "s0L.exe";
                if (!File.Exists(staged) || !string.Equals(Sha256(staged), Sha256(Application.ExecutablePath), StringComparison.Ordinal))
                    return FilesDiffer;
                int seen = 0;
                foreach (string file in Directory.GetFiles(root, "*", SearchOption.AllDirectories))
                {
                    if (string.Equals(file, staged, StringComparison.OrdinalIgnoreCase)) continue;
                    string hash;
                    if (!expected.TryGetValue(file.Substring(root.Length), out hash)) return FilesDiffer;
                    if (!string.Equals(Sha256(file), hash, StringComparison.Ordinal)) return FilesDiffer;
                    seen++;
                }
                return seen == expected.Count ? FilesMatch : FilesDiffer;
            }
            catch (Exception)
            {
                return CouldNotCheck;
            }
        }

        // A staged release passes when its s0L.exe carries a valid signature from this launcher's
        // publisher and is the version being installed. That copy alone then checks every other file.
        public static int Verify(string dir, string version)
        {
            string sandbox = Path.Combine(Path.GetTempPath(), "s0L-verify-" + Guid.NewGuid().ToString("N"));
            try
            {
                string own = Publisher(Application.ExecutablePath);
                if (own == null) return LauncherUnsigned;
                string staged = Path.Combine(dir, "s0L.exe");
                if (!File.Exists(staged)) return NotSigned;
                // Checked and run on its own: beside the zip's unchecked files, Windows and .NET would load an
                // s0L.exe.config or DLLs from there before the file check could refuse them.
                Directory.CreateDirectory(sandbox);
                string candidate = Path.Combine(sandbox, "s0L.exe");
                File.Copy(staged, candidate);
                int trust = Trust(candidate);
                if (trust != Ok) return trust;
                if (!string.Equals(Publisher(candidate), own, StringComparison.Ordinal)) return OtherPublisher;
                if (!string.Equals(FileVersionInfo.GetVersionInfo(candidate).ProductVersion, version, StringComparison.Ordinal))
                    return OtherVersion;

                ProcessStartInfo info = new ProcessStartInfo(candidate, "--check-files \"" + Path.GetFullPath(dir).TrimEnd('\\') + "\"");
                info.UseShellExecute = false;
                info.CreateNoWindow = true;
                info.WorkingDirectory = sandbox;
                using (Process check = Process.Start(info))
                {
                    if (!check.WaitForExit(CheckFilesTimeoutMs))
                    {
                        try { check.Kill(); }
                        catch (Exception) { }
                        return CouldNotCheck;
                    }
                    if (check.ExitCode == FilesMatch) return Ok;
                    return check.ExitCode == CouldNotCheck ? CouldNotCheck : FilesDiffer;
                }
            }
            catch (Exception)
            {
                return CouldNotCheck;
            }
            finally
            {
                TryDeleteDirectory(sandbox);
            }
        }

        static Dictionary<string, string> ReadManifest()
        {
            Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ManifestResource);
            if (stream == null) return null;
            Dictionary<string, string> manifest = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            using (StreamReader reader = new StreamReader(stream, Encoding.UTF8))
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    if (line.Length > 65 && line[64] == ' ') manifest[line.Substring(65)] = line.Substring(0, 64);
                }
            }
            return manifest;
        }

        static string Sha256(string path)
        {
            using (SHA256 sha = SHA256.Create())
            using (FileStream stream = File.OpenRead(path))
            {
                StringBuilder text = new StringBuilder(64);
                foreach (byte part in sha.ComputeHash(stream)) text.Append(part.ToString("x2"));
                return text.ToString();
            }
        }

        static string Publisher(string path)
        {
            try
            {
                return X509Certificate.CreateFromSignedFile(path).Subject;
            }
            catch (CryptographicException)
            {
                return null;
            }
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct WinTrustFileInfo
        {
            public uint cbStruct;
            public string pcwszFilePath;
            public IntPtr hFile;
            public IntPtr pgKnownSubject;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct WinTrustData
        {
            public uint cbStruct;
            public IntPtr pPolicyCallbackData;
            public IntPtr pSIPClientData;
            public uint dwUIChoice;
            public uint fdwRevocationChecks;
            public uint dwUnionChoice;
            public IntPtr pFile;
            public uint dwStateAction;
            public IntPtr hWVTStateData;
            public IntPtr pwszURLReference;
            public uint dwProvFlags;
            public uint dwUIContext;
            public IntPtr pSignatureSettings;
        }

        [DllImport("wintrust.dll", CharSet = CharSet.Unicode)]
        static extern uint WinVerifyTrust(IntPtr hwnd, [MarshalAs(UnmanagedType.LPStruct)] Guid action, ref WinTrustData data);

        static readonly Guid GenericVerifyV2 = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");

        // Answers that mean the file itself is bad; anything else (a chain Windows couldn't build offline) is retried.
        static readonly uint[] BadFile =
        {
            0x800B0100, // TRUST_E_NOSIGNATURE
            0x80096010, // TRUST_E_BAD_DIGEST
            0x800B0003, // TRUST_E_SUBJECT_FORM_UNKNOWN
            0x800B0004, // TRUST_E_SUBJECT_NOT_TRUSTED
            0x800B0111, // TRUST_E_EXPLICIT_DISTRUST
            0x800B010C, // CERT_E_REVOKED
        };

        static int Trust(string path)
        {
            WinTrustFileInfo file = new WinTrustFileInfo();
            file.cbStruct = (uint)Marshal.SizeOf(typeof(WinTrustFileInfo));
            file.pcwszFilePath = path;
            IntPtr filePtr = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(WinTrustFileInfo)));
            try
            {
                Marshal.StructureToPtr(file, filePtr, false);
                WinTrustData data = new WinTrustData();
                data.cbStruct = (uint)Marshal.SizeOf(typeof(WinTrustData));
                data.dwUIChoice = 2;          // WTD_UI_NONE
                data.fdwRevocationChecks = 0; // WTD_REVOKE_NONE
                data.dwUnionChoice = 1;       // WTD_CHOICE_FILE
                data.pFile = filePtr;
                data.dwProvFlags = 0x1000;    // WTD_CACHE_ONLY_URL_RETRIEVAL: the check never goes online
                uint result = WinVerifyTrust(new IntPtr(-1), GenericVerifyV2, ref data);
                if (result == 0) return Ok;
                return Array.IndexOf(BadFile, result) >= 0 ? NotSigned : CouldNotCheck;
            }
            finally
            {
                Marshal.DestroyStructure(filePtr, typeof(WinTrustFileInfo));
                Marshal.FreeHGlobal(filePtr);
            }
        }
    }
}
