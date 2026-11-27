' Starts the Stremio Plus launcher with no console window.
' Uses the bundled node.exe (installer) if present, else node from PATH (git checkout).
' Optional argument 1: the data folder (plugins, themes, config, logs). Default: the program folder.
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(dir)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = root
If WScript.Arguments.Count > 0 Then
  sh.Environment("Process")("STREMIO_PLUS_DATA") = WScript.Arguments(0)
End If
nodeExe = "node"
bundled = root & "\node\node.exe"
If fso.FileExists(bundled) Then nodeExe = """" & bundled & """"
sh.Run nodeExe & " """ & dir & "\launcher.js""", 0, False
