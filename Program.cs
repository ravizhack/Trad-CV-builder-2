using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace TradCVBuilder
{
    static class Program
    {
        private static HttpListener _listener;
        private static string _baseDir;
        private static volatile bool _isRunning = true;
        private static DateTime _lastHeartbeat = DateTime.UtcNow;

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            _baseDir = AppDomain.CurrentDomain.BaseDirectory;

            // Ensure index.html exists in baseDir or parent
            if (!File.Exists(Path.Combine(_baseDir, "index.html")))
            {
                DirectoryInfo parent = Directory.GetParent(_baseDir);
                if (parent != null && File.Exists(Path.Combine(parent.FullName, "index.html")))
                {
                    _baseDir = parent.FullName;
                }
            }

            int port = GetFreePort();
            string url = string.Format("http://127.0.0.1:{0}/index.html", port);

            // Start Local HTTP Server
            StartHttpServer(port);

            // Launch App Window (Edge / Chrome / Default)
            Process browserProcess = LaunchAppWindow(url);

            // Watchdog loop: check heartbeat and browser process
            DateTime startTime = DateTime.UtcNow;
            while (_isRunning)
            {
                Thread.Sleep(1000);

                // Check if browser process exited and at least 5 seconds elapsed
                if (browserProcess != null)
                {
                    bool processEnded = false;
                    try { processEnded = browserProcess.HasExited; } catch { }

                    // If process ended and no recent heartbeat in last 6 seconds (after grace period of 8 seconds)
                    if (processEnded && (DateTime.UtcNow - startTime).TotalSeconds > 8)
                    {
                        if ((DateTime.UtcNow - _lastHeartbeat).TotalSeconds > 6)
                        {
                            break;
                        }
                    }
                }

                // If no heartbeat for 15 seconds after initial 10s grace period, shut down
                if ((DateTime.UtcNow - startTime).TotalSeconds > 10)
                {
                    if ((DateTime.UtcNow - _lastHeartbeat).TotalSeconds > 15)
                    {
                        break;
                    }
                }
            }

            // Cleanup
            _isRunning = false;
            if (_listener != null)
            {
                try { _listener.Stop(); } catch { }
            }
        }

        private static int GetFreePort()
        {
            TcpListener l = new TcpListener(IPAddress.Loopback, 0);
            l.Start();
            int port = ((IPEndPoint)l.LocalEndpoint).Port;
            l.Stop();
            return port;
        }

        private static void StartHttpServer(int port)
        {
            _listener = new HttpListener();
            _listener.Prefixes.Add(string.Format("http://127.0.0.1:{0}/", port));
            _listener.Start();

            ThreadPool.QueueUserWorkItem(delegate(object state)
            {
                while (_isRunning && _listener.IsListening)
                {
                    try
                    {
                        HttpListenerContext context = _listener.GetContext();
                        ThreadPool.QueueUserWorkItem(delegate(object ctxObj)
                        {
                            HandleRequest((HttpListenerContext)ctxObj);
                        }, context);
                    }
                    catch
                    {
                        if (!_isRunning) break;
                    }
                }
            });
        }

        private static void HandleRequest(HttpListenerContext context)
        {
            try
            {
                string rawUrl = context.Request.Url.AbsolutePath;

                // Heartbeat endpoint
                if (rawUrl == "/__heartbeat")
                {
                    _lastHeartbeat = DateTime.UtcNow;
                    byte[] ok = Encoding.UTF8.GetBytes("ok");
                    context.Response.ContentType = "text/plain";
                    context.Response.ContentLength64 = ok.Length;
                    context.Response.OutputStream.Write(ok, 0, ok.Length);
                    context.Response.OutputStream.Close(); // Fix #1: prevent connection leak
                    return;
                }

                // Exit signal from beforeunload
                if (rawUrl == "/__exit")
                {
                    _isRunning = false;
                    byte[] bye = Encoding.UTF8.GetBytes("bye");
                    context.Response.ContentType = "text/plain";
                    context.Response.ContentLength64 = bye.Length;
                    context.Response.OutputStream.Write(bye, 0, bye.Length);
                    context.Response.OutputStream.Close(); // Fix #1: prevent connection leak
                    return;
                }

                if (string.IsNullOrEmpty(rawUrl) || rawUrl == "/")
                {
                    rawUrl = "/index.html";
                }

                // Sanitize path to prevent directory traversal
                string relPath = rawUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                string filePath = Path.Combine(_baseDir, relPath);

                // Fix #11: guard against path traversal outside _baseDir
                string safeBase = Path.GetFullPath(_baseDir);
                string safePath = Path.GetFullPath(filePath);
                if (!safePath.StartsWith(safeBase, StringComparison.OrdinalIgnoreCase))
                {
                    context.Response.StatusCode = 403;
                    byte[] forbidden = Encoding.UTF8.GetBytes("403 Forbidden");
                    context.Response.OutputStream.Write(forbidden, 0, forbidden.Length);
                    return;
                }

                if (File.Exists(filePath))
                {
                    byte[] bytes = File.ReadAllBytes(filePath);
                    string ext = Path.GetExtension(filePath).ToLowerInvariant();
                    context.Response.ContentType = GetMimeType(ext);
                    context.Response.ContentLength64 = bytes.Length;
                    context.Response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate");
                    context.Response.Headers.Add("Access-Control-Allow-Origin", "*");
                    context.Response.StatusCode = 200;
                    context.Response.OutputStream.Write(bytes, 0, bytes.Length);
                }
                else
                {
                    context.Response.StatusCode = 404;
                    byte[] notFound = Encoding.UTF8.GetBytes("404 Not Found");
                    context.Response.OutputStream.Write(notFound, 0, notFound.Length);
                }
            }
            catch { }
            finally
            {
                try { context.Response.OutputStream.Close(); } catch { }
            }
        }

        private static string GetMimeType(string ext)
        {
            switch (ext)
            {
                case ".html": case ".htm": return "text/html; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".js": return "application/javascript; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg": case ".jpeg": return "image/jpeg";
                case ".ico": return "image/x-icon";
                case ".webp": return "image/webp";
                case ".woff": return "font/woff";
                case ".woff2": return "font/woff2";
                case ".ttf": return "font/ttf";
                default: return "application/octet-stream";
            }
        }

        private static Process LaunchAppWindow(string url)
        {
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string userDataDir = Path.Combine(localAppData, "TradCVBuilder_App");

            string[] candidateBrowsers = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(localAppData, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe")
            };

            foreach (string browserPath in candidateBrowsers)
            {
                if (File.Exists(browserPath))
                {
                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo();
                        psi.FileName = browserPath;
                        psi.Arguments = string.Format("--app=\"{0}\" --user-data-dir=\"{1}\" --window-size=1366,860", url, userDataDir);
                        psi.UseShellExecute = false;
                        return Process.Start(psi);
                    }
                    catch { }
                }
            }

            // Fallback: system default browser
            try
            {
                ProcessStartInfo defaultPsi = new ProcessStartInfo(url);
                defaultPsi.UseShellExecute = true;
                return Process.Start(defaultPsi);
            }
            catch
            {
                return null;
            }
        }
    }
}
