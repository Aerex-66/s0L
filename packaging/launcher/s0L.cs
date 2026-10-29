// s0L launcher: starts the Flask and GSSM servers hidden, opens the browser, and lives in the tray.
// C# 5 only: it is compiled with the .NET Framework compiler that ships with Windows.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("s0L")]
[assembly: AssemblyProduct("s0L")]
[assembly: AssemblyDescription("s0L deal workbench")]

namespace S0L
{
    static class Launcher
    {
        public const int FlaskPort = 5121;
        public const int GssmPort = 5175;
        const string AppUrl = "http://localhost:5121/";
        public static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;

        // Ownership, not creation, decides the one running launcher: during an update the old
        // launcher keeps its handle, hands ownership to the new version, and takes it back on a rollback.
        static Mutex instance;
        static bool ownsInstance;

        [DllImport("user32.dll")]
        static extern bool SetProcessDPIAware();

        [STAThread]
        static int Main(string[] args)
        {
            if (args.Length == 3 && args[0] == "--verify") return Updates.Verify(args[1], args[2]);
            if (args.Length == 2 && args[0] == "--check-files") return Updates.CheckFiles(args[1]);

            bool openBrowser = Array.IndexOf(args, "--no-browser") < 0;
            bool afterUpdate = Array.IndexOf(args, "--after-update") >= 0;
            instance = new Mutex(false, @"Local\s0L-launcher");
            if (!TakeInstance())
            {
                if (openBrowser) OpenBrowser();
                return 0;
            }
            SetProcessDPIAware();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TrayContext(new Session(), openBrowser, afterUpdate));
            ReleaseInstance();
            return 0;
        }

        // Call both on the UI thread: a mutex belongs to the thread that took it.
        public static bool TakeInstance()
        {
            try
            {
                ownsInstance = instance.WaitOne(0);
            }
            catch (AbandonedMutexException)
            {
                ownsInstance = true;
            }
            return ownsInstance;
        }

        public static void ReleaseInstance()
        {
            if (!ownsInstance) return;
            instance.ReleaseMutex();
            ownsInstance = false;
        }

        public static string Version()
        {
            object[] found = Assembly.GetExecutingAssembly().GetCustomAttributes(typeof(AssemblyInformationalVersionAttribute), false);
            return found.Length > 0 ? ((AssemblyInformationalVersionAttribute)found[0]).InformationalVersion : null;
        }

        public static Process StartNewVersion(bool openBrowser)
        {
            ProcessStartInfo info = new ProcessStartInfo(Path.Combine(Root, "s0L.exe"), openBrowser ? "--after-update" : "--after-update --no-browser");
            info.UseShellExecute = false;
            info.WorkingDirectory = Root;
            return Process.Start(info);
        }

        public static void OpenBrowser()
        {
            Process.Start(AppUrl);
        }

        public static Icon AppIcon()
        {
            return Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        }

        public static bool PortAnswers(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    IAsyncResult attempt = client.BeginConnect("127.0.0.1", port, null, null);
                    if (!attempt.AsyncWaitHandle.WaitOne(500)) return false;
                    client.EndConnect(attempt);
                    return true;
                }
            }
            catch (SocketException)
            {
                return false;
            }
        }

        public static bool WaitForFlask(Process flask, int seconds)
        {
            DateTime deadline = DateTime.UtcNow.AddSeconds(seconds);
            while (DateTime.UtcNow < deadline)
            {
                if (flask.HasExited) return false;
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + FlaskPort + "/");
                    request.Timeout = 2000;
                    request.Proxy = null;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    {
                        if (response.StatusCode == HttpStatusCode.OK) return true;
                    }
                }
                catch (WebException)
                {
                }
                Thread.Sleep(300);
            }
            return false;
        }
    }

    sealed class TrayContext : ApplicationContext
    {
        readonly Session session;
        readonly bool openBrowser;
        readonly bool afterUpdate;
        readonly NotifyIcon tray;
        readonly Control ui;
        readonly System.Windows.Forms.Timer watchdog;
        bool ready;
        bool quitting;
        bool updating;

        public TrayContext(Session session, bool openBrowser, bool afterUpdate)
        {
            this.session = session;
            this.openBrowser = openBrowser;
            this.afterUpdate = afterUpdate;
            ui = new Control();
            IntPtr handle = ui.Handle;

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Open s0L", null, delegate { if (ready) Launcher.OpenBrowser(); });
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Quit s0L", null, delegate { if (!updating) Quit(); });

            tray = new NotifyIcon();
            tray.Icon = Launcher.AppIcon();
            tray.Text = "s0L - starting";
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { if (ready) Launcher.OpenBrowser(); };
            tray.Visible = true;

            watchdog = new System.Windows.Forms.Timer();
            watchdog.Interval = 2000;
            watchdog.Tick += delegate { Tick(); };

            // An update cut off by a crash or power cut is finished or undone before anything runs.
            if (!afterUpdate && !Updates.RecoverInterruptedSwap())
            {
                Background(delegate { ui.BeginInvoke((MethodInvoker)delegate { Fail(Updates.BrokenInstallMessage()); }); });
                return;
            }

            // An update the person put off ("Later") installs now, before anything starts.
            string pending = afterUpdate ? null : Updates.ReadyVersion();
            if (pending != null)
            {
                updating = true;
                tray.Text = "s0L - updating";
                Background(delegate { ApplyUpdate(pending, openBrowser); });
            }
            else
            {
                Background(delegate { StartServers(openBrowser); });
            }
        }

        static void Background(ThreadStart work)
        {
            Thread thread = new Thread(work);
            thread.IsBackground = true;
            thread.Start();
        }

        void OnUi(MethodInvoker action)
        {
            ui.Invoke(action);
        }

        // Runs on a background thread.
        void StartServers(bool openTab)
        {
            string error = session.Start(afterUpdate ? 150 : 60);
            ui.BeginInvoke((MethodInvoker)delegate
            {
                if (error != null) Fail(error);
                else Ready(openTab);
            });
        }

        void Ready(bool openTab)
        {
            if (quitting) return;
            ready = true;
            updating = false;
            tray.Text = "s0L";
            watchdog.Start();
            if (openTab) Launcher.OpenBrowser();
        }

        void Tick()
        {
            if (quitting || updating) return;
            if (Updates.RestartRequested())
            {
                string target = Updates.ReadyVersion();
                if (target == null)
                {
                    Updates.ClearRestart();
                    return;
                }
                updating = true;
                ready = false;
                watchdog.Stop();
                tray.Text = "s0L - updating";
                Background(delegate { ApplyUpdate(target, false); });
                return;
            }
            string stopped = session.StoppedServer();
            if (stopped != null) Fail(stopped + " stopped unexpectedly. Details are in " + session.LogDir);
        }

        // Runs on a background thread. openTab: a start opens the browser as usual; after a restart the
        // open tab reloads itself.
        void ApplyUpdate(string target, bool openTab)
        {
            string current = Launcher.Version() ?? "?";
            Updates.Log("Updating " + current + " to " + target + (openTab ? " (start)" : " (restart)"));
            session.StopAll();
            Updates.WaitForPortsFree();
            if (Updates.PortsBusy())
            {
                Updates.Log("Port " + Launcher.FlaskPort + " or " + Launcher.GssmPort + " is in use; the update waits");
                Updates.ClearRestart();
                StartServers(openTab);
                return;
            }

            int verdict = Updates.Verify(Updates.Staging, target);
            if (verdict != Updates.Ok)
            {
                Updates.Log("The staged " + target + " failed its check (" + verdict + ")");
                Updates.Discard(target, verdict);
                StartServers(openTab);
                return;
            }
            if (!Updates.Snapshot())
            {
                Updates.ClearRestart();
                StartServers(openTab);
                return;
            }
            Updates.WaitForNothingRunningFromRoot();
            bool intact;
            List<string> moved = Updates.Swap(out intact);
            if (moved == null)
            {
                Updates.DropSnapshot();
                Updates.ClearRestart();
                if (!intact)
                {
                    Broken();
                    return;
                }
                Updates.Log("Could not swap in " + target + "; staying on " + current);
                StartServers(openTab);
                return;
            }
            Updates.ClearMarkers();

            OnUi(delegate { tray.Visible = false; Launcher.ReleaseInstance(); });
            Process next = null;
            try
            {
                next = Launcher.StartNewVersion(openTab);
            }
            catch (Exception ex)
            {
                Updates.Log("Could not start " + target + ": " + ex.Message);
            }
            if (next != null && Updates.WaitForVersion(target, next))
            {
                Updates.FinishSwap();
                Updates.Log("Now running " + target);
                OnUi(delegate { quitting = true; tray.Dispose(); ExitThread(); });
                return;
            }

            Updates.Log(target + " did not start; going back to " + current);
            if (next != null)
            {
                try
                {
                    if (!next.HasExited) next.Kill();
                    next.WaitForExit(10000);
                }
                catch (Exception)
                {
                }
            }
            Updates.WaitForNothingRunningFromRoot();
            Updates.WaitForPortsFree();
            Updates.KeepFailedLogs(target);
            if (!Updates.SwapBack(moved))
            {
                Broken();
                return;
            }
            Updates.RestoreSnapshot();
            bool bad = Updates.RecordFailure(target);
            string note = bad ? "" : " It will try once more later.";
            OnUi(delegate
            {
                Launcher.TakeInstance();
                tray.Visible = true;
                tray.Text = "s0L - starting";
                tray.ShowBalloonTip(10000, "s0L", "s0L couldn't start version " + target + ", so it's back on version " + current + "." + note, ToolTipIcon.Warning);
            });
            StartServers(openTab);
        }

        // Runs on a background thread: the folder is half old, half new, so nothing may start from it.
        void Broken()
        {
            Updates.Log("The s0L folder could not be put back together; not starting");
            OnUi(delegate
            {
                Launcher.TakeInstance();
                Fail(Updates.BrokenInstallMessage());
            });
        }

        void Fail(string message)
        {
            if (quitting) return;
            watchdog.Stop();
            tray.Visible = false;
            // A first start after an update just exits: the old launcher rolls back and explains.
            if (afterUpdate && !ready)
            {
                Updates.Log("The new version didn't start: " + message);
                Quit();
                return;
            }
            MessageBox.Show(message, "s0L", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Quit();
        }

        void Quit()
        {
            quitting = true;
            watchdog.Stop();
            tray.Visible = false;
            tray.Dispose();
            session.Stop();
            ExitThread();
        }
    }

    sealed class Session
    {
        public readonly string LogDir;
        readonly string appDir;
        readonly string pythonExe;
        readonly string nodeExe;
        readonly string dataDir;
        readonly string gssmDir;
        readonly IntPtr job;
        readonly List<StreamWriter> logs = new List<StreamWriter>();
        Process flask;
        Process gssm;

        public Session()
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            appDir = Path.Combine(root, "app");
            pythonExe = Path.Combine(root, @"runtime\python\python.exe");
            nodeExe = Path.Combine(root, @"runtime\node\node.exe");
            string local = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "s0L");
            dataDir = Path.Combine(local, "data");
            gssmDir = Path.Combine(local, "gssm");
            LogDir = Path.Combine(local, "logs");
            job = Job.CreateKillOnClose();
        }

        public string Start(int flaskWaitSeconds)
        {
            try
            {
                if (!File.Exists(pythonExe) || !File.Exists(nodeExe) || !Directory.Exists(appDir))
                    return "s0L is missing some of its files. Unzip the whole folder again and run s0L.exe from inside it.";
                if (Launcher.PortAnswers(Launcher.FlaskPort) || Launcher.PortAnswers(Launcher.GssmPort))
                    return "s0L can't start because port " + Launcher.FlaskPort + " or " + Launcher.GssmPort +
                           " is already in use. If s0L's developer servers are running, stop them and open s0L again.";
                Directory.CreateDirectory(dataDir);
                Directory.CreateDirectory(gssmDir);
                Directory.CreateDirectory(LogDir);

                Dictionary<string, string> gssmEnv = new Dictionary<string, string>();
                gssmEnv["ENGINE_IMPORT_ROOT"] = Path.Combine(gssmDir, "engine-imports");
                gssmEnv["GSSM_DB_PATH"] = Path.Combine(gssmDir, "store.sqlite");
                gssmEnv["PYTHON_PATH"] = pythonExe;
                gssm = Spawn(nodeExe, "--disable-warning=ExperimentalWarning index.js",
                             Path.Combine(appDir, "gssm-server"), "gssm.log", gssmEnv);

                Dictionary<string, string> flaskEnv = new Dictionary<string, string>();
                flaskEnv["S0L_DATA_DIR"] = dataDir;
                flaskEnv["S0L_FRONTEND_DIST"] = Path.Combine(appDir, @"frontend\dist");
                flaskEnv["S0L_MONDAY_APP"] = Path.Combine(appDir, "monday-app.json");
                string salesforceApp = Path.Combine(appDir, "salesforce-app.json");
                if (File.Exists(salesforceApp)) flaskEnv["S0L_SALESFORCE_APP"] = salesforceApp;
                string version = Launcher.Version();
                if (version != null) flaskEnv["S0L_VERSION"] = version;
                flaskEnv["S0L_LAUNCHER"] = Application.ExecutablePath;
                flaskEnv["FRONTEND_PORT"] = Launcher.FlaskPort.ToString();
                flaskEnv["PYTHONDONTWRITEBYTECODE"] = "1";
                flaskEnv["PYTHONUTF8"] = "1";
                flaskEnv["PYTHONUNBUFFERED"] = "1";
                flask = Spawn(pythonExe, "deal_tracker.py", appDir, "flask.log", flaskEnv);

                if (!Launcher.WaitForFlask(flask, flaskWaitSeconds))
                    return "s0L didn't start. Details are in " + Path.Combine(LogDir, "flask.log");
                return null;
            }
            catch (Exception ex)
            {
                return "s0L couldn't start: " + ex.Message;
            }
        }

        public string StoppedServer()
        {
            if (flask != null && flask.HasExited) return "The s0L server";
            if (gssm != null && gssm.HasExited) return "The GSSM engine";
            return null;
        }

        public void Stop()
        {
            Kill(flask);
            Kill(gssm);
            CloseLogs();
        }

        // Ends everything the servers started too, and waits, so nothing in the s0L folder stays open.
        public void StopAll()
        {
            Job.Terminate(job);
            WaitForExit(flask);
            WaitForExit(gssm);
            CloseLogs();
        }

        void CloseLogs()
        {
            foreach (StreamWriter log in logs)
            {
                lock (log) log.Dispose();
            }
            logs.Clear();
        }

        static void WaitForExit(Process process)
        {
            try
            {
                if (process != null) process.WaitForExit(10000);
            }
            catch (InvalidOperationException)
            {
            }
            catch (System.ComponentModel.Win32Exception)
            {
            }
        }

        Process Spawn(string exe, string arguments, string workDir, string logName, Dictionary<string, string> env)
        {
            ProcessStartInfo info = new ProcessStartInfo(exe, arguments);
            info.WorkingDirectory = workDir;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            info.StandardOutputEncoding = Encoding.UTF8;
            info.StandardErrorEncoding = Encoding.UTF8;
            info.EnvironmentVariables.Remove("PYTHONHOME");
            info.EnvironmentVariables.Remove("PYTHONPATH");
            info.EnvironmentVariables.Remove("NODE_OPTIONS");
            foreach (KeyValuePair<string, string> pair in env) info.EnvironmentVariables[pair.Key] = pair.Value;

            StreamWriter log = new StreamWriter(Path.Combine(LogDir, logName), false, new UTF8Encoding(false));
            log.AutoFlush = true;
            logs.Add(log);
            DataReceivedEventHandler write = delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data == null) return;
                lock (log)
                {
                    try { log.WriteLine(e.Data); }
                    catch (ObjectDisposedException) { }
                }
            };

            Process process = new Process();
            process.StartInfo = info;
            process.OutputDataReceived += write;
            process.ErrorDataReceived += write;
            process.Start();
            Job.Assign(job, process);
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return process;
        }

        static void Kill(Process process)
        {
            try
            {
                if (process != null && !process.HasExited) process.Kill();
            }
            catch (InvalidOperationException)
            {
            }
            catch (System.ComponentModel.Win32Exception)
            {
            }
        }
    }

    // Children join a job that Windows kills when the launcher's handle closes, even if the launcher crashes.
    static class Job
    {
        const int JobObjectExtendedLimitInformation = 9;
        const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

        [StructLayout(LayoutKind.Sequential)]
        struct BasicLimits
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct IoCounters
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct ExtendedLimits
        {
            public BasicLimits BasicLimitInformation;
            public IoCounters IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern IntPtr CreateJobObject(IntPtr attributes, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits info, uint length);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool TerminateJobObject(IntPtr job, uint exitCode);

        public static void Terminate(IntPtr job)
        {
            TerminateJobObject(job, 1);
        }

        public static IntPtr CreateKillOnClose()
        {
            IntPtr job = CreateJobObject(IntPtr.Zero, null);
            ExtendedLimits limits = new ExtendedLimits();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            SetInformationJobObject(job, JobObjectExtendedLimitInformation, ref limits,
                                    (uint)Marshal.SizeOf(typeof(ExtendedLimits)));
            return job;
        }

        public static void Assign(IntPtr job, Process process)
        {
            AssignProcessToJobObject(job, process.Handle);
        }
    }
}
