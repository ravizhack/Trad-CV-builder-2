using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

class MakeIcon
{
    static void Main()
    {
        int[] sizes = new int[] { 16, 32, 48, 64, 128, 256 };
        Bitmap[] bitmaps = new Bitmap[sizes.Length];

        for (int i = 0; i < sizes.Length; i++)
        {
            int s = sizes[i];
            Bitmap bmp = new Bitmap(s, s, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                // Gradient background rounded rectangle
                using (GraphicsPath path = new GraphicsPath())
                {
                    int radius = Math.Max(2, (int)(s * 0.22));
                    int d = radius * 2;
                    path.AddArc(0, 0, d, d, 180, 90);
                    path.AddArc(s - d, 0, d, d, 270, 90);
                    path.AddArc(s - d, s - d, d, d, 0, 90);
                    path.AddArc(0, s - d, d, d, 90, 90);
                    path.CloseFigure();

                    using (LinearGradientBrush brush = new LinearGradientBrush(
                        new PointF(0, 0), new PointF(s, s),
                        Color.FromArgb(108, 99, 255), Color.FromArgb(168, 85, 247)))
                    {
                        g.FillPath(brush, path);
                    }
                }

                // Inner white document card
                int docW = (int)(s * 0.58);
                int docH = (int)(s * 0.72);
                int docX = (s - docW) / 2;
                int docY = (s - docH) / 2;

                using (GraphicsPath docPath = new GraphicsPath())
                {
                    int docR = Math.Max(1, (int)(s * 0.05));
                    int dd = docR * 2;
                    docPath.AddArc(docX, docY, dd, dd, 180, 90);
                    docPath.AddArc(docX + docW - dd, docY, dd, dd, 270, 90);
                    docPath.AddArc(docX + docW - dd, docY + docH - dd, dd, dd, 0, 90);
                    docPath.AddArc(docX, docY + docH - dd, dd, dd, 90, 90);
                    docPath.CloseFigure();

                    using (SolidBrush whiteBrush = new SolidBrush(Color.FromArgb(245, 255, 255, 255)))
                    {
                        g.FillPath(whiteBrush, docPath);
                    }
                }

                // Mini gold avatar
                int avSize = Math.Max(3, (int)(s * 0.16));
                int avX = docX + (int)(s * 0.06);
                int avY = docY + (int)(s * 0.08);
                using (SolidBrush goldBrush = new SolidBrush(Color.FromArgb(235, 175, 45)))
                {
                    g.FillEllipse(goldBrush, avX, avY, avSize, avSize);
                }

                // Name bar
                float penW = Math.Max(1.0f, (float)(s * 0.04));
                using (Pen darkPen = new Pen(Color.FromArgb(108, 99, 255), penW))
                using (Pen goldPen = new Pen(Color.FromArgb(235, 175, 45), penW))
                using (Pen grayPen = new Pen(Color.FromArgb(180, 180, 200), penW))
                {
                    int nlX1 = avX + avSize + Math.Max(2, (int)(s * 0.04));
                    int nlX2 = docX + docW - Math.Max(2, (int)(s * 0.06));
                    int nlY = avY + (avSize / 2);
                    if (nlX2 > nlX1) g.DrawLine(darkPen, nlX1, nlY, nlX2, nlY);

                    // Content lines
                    int lineStep = Math.Max(2, (int)(s * 0.08));
                    int ly = avY + avSize + lineStep;
                    int xStart = docX + Math.Max(2, (int)(s * 0.06));
                    int xEndFull = docX + docW - Math.Max(2, (int)(s * 0.06));
                    int xEndShort = docX + (int)(docW * 0.65);

                    if (ly < docY + docH) { g.DrawLine(grayPen, xStart, ly, xEndFull, ly); ly += lineStep; }
                    if (ly < docY + docH) { g.DrawLine(goldPen, xStart, ly, xEndShort, ly); ly += lineStep; }
                    if (ly < docY + docH) { g.DrawLine(grayPen, xStart, ly, xEndFull, ly); ly += lineStep; }
                    if (ly < docY + docH) { g.DrawLine(grayPen, xStart, ly, xEndShort, ly); }
                }
            }
            bitmaps[i] = bmp;
        }

        // Save ICO
        using (FileStream fs = File.Create("app.ico"))
        using (BinaryWriter bw = new BinaryWriter(fs))
        {
            bw.Write((ushort)0);
            bw.Write((ushort)1);
            bw.Write((ushort)sizes.Length);

            MemoryStream[] msArray = new MemoryStream[sizes.Length];
            for (int i = 0; i < sizes.Length; i++)
            {
                msArray[i] = new MemoryStream();
                bitmaps[i].Save(msArray[i], ImageFormat.Png);
            }

            int offset = 6 + (sizes.Length * 16);

            for (int i = 0; i < sizes.Length; i++)
            {
                int w = sizes[i];
                int h = sizes[i];
                byte[] data = msArray[i].ToArray();

                bw.Write((byte)(w >= 256 ? 0 : w));
                bw.Write((byte)(h >= 256 ? 0 : h));
                bw.Write((byte)0);
                bw.Write((byte)0);
                bw.Write((ushort)1);
                bw.Write((ushort)32);
                bw.Write((uint)data.Length);
                bw.Write((uint)offset);

                offset += data.Length;
            }

            for (int i = 0; i < sizes.Length; i++)
            {
                byte[] data = msArray[i].ToArray();
                bw.Write(data, 0, data.Length);
                msArray[i].Dispose();
                bitmaps[i].Dispose();
            }
        }

        Console.WriteLine("Icon generated successfully: app.ico");
    }
}
