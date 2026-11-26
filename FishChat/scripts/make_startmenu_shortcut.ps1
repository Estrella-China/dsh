# 创建 FishChat 开始菜单快捷方式，并写入 AppUserModelID（让 Windows 通知显示为 FishChat）
$ErrorActionPreference = 'Stop'

$exe = 'D:\FishChat\FishChat.exe'
$startMenu = [Environment]::GetFolderPath('Programs')
$lnkPath = Join-Path $startMenu 'FishChat.lnk'

$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = $exe
$lnk.WorkingDirectory = 'D:\FishChat'
$lnk.IconLocation = "$exe,0"
$lnk.Description = 'FishChat 聊天软件'
$lnk.Save()
Write-Output "shortcut: $lnkPath"

$code = @"
using System;
using System.Runtime.InteropServices;

public static class LnkAumid
{
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct PROPERTYKEY { public Guid fmtid; public int pid; }

    [StructLayout(LayoutKind.Explicit)]
    public struct PROPVARIANT
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pointerValue;
    }

    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore
    {
        [PreserveSig] int GetCount(out uint cProps);
        [PreserveSig] int GetAt(uint iProp, out PROPERTYKEY pkey);
        [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        [PreserveSig] int SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
        [PreserveSig] int Commit();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHGetPropertyStoreFromParsingName(string pszPath, IntPtr pbc, uint flags, ref Guid riid, out IPropertyStore ppv);

    [DllImport("ole32.dll")]
    static extern int PropVariantClear(ref PROPVARIANT pvar);

    public static void Set(string lnkPath, string appId)
    {
        Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
        IPropertyStore store;
        SHGetPropertyStoreFromParsingName(lnkPath, IntPtr.Zero, 0x2, ref iid, out store);
        PROPVARIANT pv = new PROPVARIANT();
        pv.vt = 31;
        pv.pointerValue = Marshal.StringToCoTaskMemUni(appId);
        PROPERTYKEY key = new PROPERTYKEY();
        key.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
        key.pid = 5;
        try
        {
            int hr = store.SetValue(ref key, ref pv);
            if (hr != 0) throw new COMException("SetValue", hr);
            hr = store.Commit();
            if (hr != 0) throw new COMException("Commit", hr);
        }
        finally
        {
            PropVariantClear(ref pv);
            Marshal.FreeCoTaskMem(pv.pointerValue);
        }
    }
}
"@

Add-Type -TypeDefinition $code -Language CSharp
[LnkAumid]::Set($lnkPath, 'com.fishchat.app')
Write-Output 'AUMID set: com.fishchat.app'
