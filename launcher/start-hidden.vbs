' Starts the Stremio Plus launcher with no console window.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(dir)
sh.Run "node """ & dir & "\launcher.js""", 0, False
