; Stremio Plus one-click installer (Inno Setup 6.1+). Per-user, no admin rights.
; Build with installer\build.ps1.
;
; Cases (decided in InitializeWizard, shown on the "What was found" page):
;   1. No Stremio 5        -> download + silently install the official Stremio 5, then Plus (+ Enhanced import if found)
;   2. Stremio 5 only      -> install Plus; the user's Stremio account, add-ons, history and settings are Stremio's own and untouched
;   3. Stremio 5 + Enhanced-> as 2, plus copy Enhanced's plugins/themes into Plus (Enhanced is never modified)
;
; Test switches on the command line (silent runs):
;   /DATADIR=<dir>  Plus data folder            /ENHDIR=<dir>  Enhanced data folder (default %APPDATA%\stremio-enhanced)
;   /STREMIOEXE=<exe> Stremio 5 shell path      /HIDEENHANCED=1  /HIDESTREMIO=1  pretend those are absent
;   /TASKS=""       no shortcuts                /DIR=<dir>     program folder

#ifndef AppVersion
  #define AppVersion "0.3.0"
#endif

[Setup]
AppId={{B7F3C1E2-5A41-4C7B-9E0A-3D6F2A1C8E55}
AppName=Stremio Plus
AppVersion={#AppVersion}
AppPublisher=Stremio Plus
DefaultDirName={localappdata}\Programs\StremioPlus
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=StremioPlusSetup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\assets\stremio-plus.ico
UninstallDisplayIcon={app}\assets\stremio-plus.ico
CloseApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "startmenuicon"; Description: "Create a &Start Menu shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\launcher\*"; DestDir: "{app}\launcher"; Flags: ignoreversion recursesubdirs
Source: "detect.js"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "import-enhanced.js"; DestDir: "{app}\installer"; Flags: ignoreversion
Source: "..\assets\stremio-plus.ico"; DestDir: "{app}\assets"; Flags: ignoreversion
Source: "..\examples\*"; DestDir: "{app}\examples"; Flags: ignoreversion recursesubdirs
Source: "build\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion

[Dirs]
Name: "{code:DataDir}"
Name: "{code:DataDir}\plugins"
Name: "{code:DataDir}\themes"

[Icons]
Name: "{autodesktop}\Stremio Plus"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\launcher\start-hidden.vbs"" ""{code:DataDir}"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\stremio-plus.ico"; Comment: "Stremio with plugins and themes"; Tasks: desktopicon
Name: "{autoprograms}\Stremio Plus"; Filename: "{sys}\wscript.exe"; Parameters: """{app}\launcher\start-hidden.vbs"" ""{code:DataDir}"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\stremio-plus.ico"; Comment: "Stremio with plugins and themes"; Tasks: startmenuicon
Name: "{autoprograms}\Stremio Plus plugins folder"; Filename: "{code:DataDir}"; Tasks: startmenuicon

[UninstallDelete]
Type: files; Name: "{app}\datadir.txt"

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{app}\launcher\start-hidden.vbs"" ""{code:DataDir}"""; WorkingDir: "{app}"; Description: "Launch Stremio Plus"; Flags: postinstall nowait skipifsilent

[Code]
const
  StremioUrlX64 = 'https://dl.strem.io/stremio-shell-ng/v5.0.24/StremioSetup-v5.0.24_x64.exe';
  StremioUrlArm64 = 'https://dl.strem.io/stremio-shell-ng/v5.0.24/StremioSetup-v5.0.24_arm64.exe';
  StremioDownloadsPage = 'https://www.stremio.com/downloads';

var
  HasStremio5, HasStremio4, HasEnhanced, NeedStremio, ImportEnh: Boolean;
  EnhDir, StremioExe: String;
  EnhPlugins, EnhThemes: Integer;
  SummaryPage: TOutputMsgMemoWizardPage;
  DownloadPage: TDownloadWizardPage;
  ImportSummary: String;

function DataDir(Param: String): String;
begin
  Result := ExpandConstant('{param:DATADIR|}');
  if Result = '' then Result := ExpandConstant('{userappdata}\StremioPlus');
end;

function CountFiles(const Dir, Mask: String): Integer;
var
  R: TFindRec;
begin
  Result := 0;
  if FindFirst(Dir + '\' + Mask, R) then
  try
    repeat
      if (R.Attributes and FILE_ATTRIBUTE_DIRECTORY) = 0 then Result := Result + 1;
    until not FindNext(R);
  finally
    FindClose(R);
  end;
end;

function CountSub(const S, Sub: String): Integer;
var
  P: Integer;
  T: String;
begin
  Result := 0; T := S;
  repeat
    P := Pos(Sub, T);
    if P > 0 then begin Result := Result + 1; Delete(T, 1, P + Length(Sub) - 1); end;
  until P = 0;
end;

procedure Detect;
begin
  StremioExe := ExpandConstant('{param:STREMIOEXE|}');
  if StremioExe = '' then StremioExe := ExpandConstant('{localappdata}\Programs\Stremio\stremio-shell-ng.exe');
  HasStremio5 := FileExists(StremioExe) and (ExpandConstant('{param:HIDESTREMIO|0}') <> '1');
  HasStremio4 := FileExists(ExpandConstant('{localappdata}\Programs\LNV\Stremio-4\stremio.exe')) or FileExists(ExtractFilePath(StremioExe) + 'stremio.exe');
  EnhDir := ExpandConstant('{param:ENHDIR|}');
  if EnhDir = '' then EnhDir := ExpandConstant('{userappdata}\stremio-enhanced');
  EnhPlugins := CountFiles(EnhDir + '\plugins', '*.plugin.js');
  EnhThemes := CountFiles(EnhDir + '\themes', '*.theme.css');
  HasEnhanced := (ExpandConstant('{param:HIDEENHANCED|0}') <> '1') and
    (FileExists(ExpandConstant('{localappdata}\Programs\stremio-enhanced\Stremio Enhanced.exe')) or (EnhPlugins + EnhThemes > 0));
  NeedStremio := not HasStremio5;
  ImportEnh := HasEnhanced and (EnhPlugins + EnhThemes > 0);
end;

function SummaryText: String;
var
  S: String;
begin
  S := 'What was found on this PC:' + #13#10 + #13#10;
  if HasStremio5 then S := S + '  [x] Stremio 5 (installed)' + #13#10 else S := S + '  [ ] Stremio 5 (not installed)' + #13#10;
  if HasEnhanced then S := S + '  [x] Stremio Enhanced (' + IntToStr(EnhPlugins) + ' plugins, ' + IntToStr(EnhThemes) + ' themes)' + #13#10
  else S := S + '  [ ] Stremio Enhanced (not installed)' + #13#10;
  if HasStremio4 then S := S + '  [x] Stremio 4 (older version, left alone)' + #13#10;
  S := S + #13#10 + 'What will happen:' + #13#10 + #13#10;
  if NeedStremio then
    S := S + '  - Download the official Stremio 5 from stremio.com, check its signature, and install it.' + #13#10 +
             '  - After that you sign in or create a Stremio account inside Stremio Plus, as usual.' + #13#10
  else
    S := S + '  - Your Stremio login, add-ons (and debrid setup), library and watch history stay exactly as they are.' + #13#10;
  if ImportEnh then
    S := S + '  - Copy your ' + IntToStr(EnhPlugins) + ' Stremio Enhanced plugin(s) and ' + IntToStr(EnhThemes) + ' theme(s) into Stremio Plus. Stremio Enhanced is not changed.' + #13#10;
  S := S + '  - Install Stremio Plus and add a "Stremio Plus" shortcut. Normal Stremio keeps its own shortcut and still opens without plugins.' + #13#10;
  Result := S;
end;

procedure InitializeWizard;
begin
  Detect;
  SummaryPage := CreateOutputMsgMemoPage(wpWelcome, 'What was found', 'Stremio Plus checked this PC', 'Click Next to continue.', SummaryText);
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), nil);
end;

function VerifyStremioSignature(const F: String): Boolean;
var
  Code: Integer;
  Cmd: String;
begin
  Cmd := '-NoProfile -ExecutionPolicy Bypass -Command "$s = Get-AuthenticodeSignature -LiteralPath ''' + F + '''; if ($s.Status -eq ''Valid'' -and $s.SignerCertificate.Subject -like ''*Smart Code OOD*'') { exit 0 } else { exit 1 }"';
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'), Cmd, '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Url: String;
begin
  Result := True;
  if (CurPageID = wpReady) and NeedStremio then begin
    if IsArm64 then Url := StremioUrlArm64 else Url := StremioUrlX64;
    DownloadPage.Clear;
    DownloadPage.Add(Url, 'StremioSetup.exe', '');
    DownloadPage.Show;
    try
      try
        DownloadPage.Download;
        if not VerifyStremioSignature(ExpandConstant('{tmp}\StremioSetup.exe')) then begin
          SuppressibleMsgBox('The downloaded Stremio installer failed its signature check (it must be validly signed by Smart Code OOD), so it was not run.' + #13#10 + 'Install Stremio yourself from ' + StremioDownloadsPage + ' and run this setup again.', mbCriticalError, MB_OK, IDOK);
          Result := False;
        end;
      except
        SuppressibleMsgBox('Could not download Stremio: ' + AddPeriod(GetExceptionMessage) + #13#10 + 'Install Stremio yourself from ' + StremioDownloadsPage + ' and run this setup again.', mbCriticalError, MB_OK, IDOK);
        Result := False;
      end;
    finally
      DownloadPage.Hide;
    end;
  end;
end;

procedure RunImport;
var
  Code: Integer;
  Report: AnsiString;
  OnCount, OffCount: Integer;
begin
  if not Exec(ExpandConstant('{app}\node\node.exe'), '"' + ExpandConstant('{app}\installer\import-enhanced.js') + '" --src "' + EnhDir + '" --dest "' + DataDir('') + '"', '', SW_HIDE, ewWaitUntilTerminated, Code) or (Code <> 0) then begin
    ImportSummary := 'Importing from Stremio Enhanced did not complete; your Enhanced install is untouched. You can copy plugins into the Stremio Plus plugins folder by hand.';
    Exit;
  end;
  if LoadStringFromFile(DataDir('') + '\import-report.txt', Report) then begin
    OnCount := CountSub(String(Report), '[on]');
    OffCount := CountSub(String(Report), '[off]');
    ImportSummary := 'Imported from Stremio Enhanced: ' + IntToStr(OnCount) + ' plugin(s) on, ' + IntToStr(OffCount) + ' switched off (see import-report.txt in the Stremio Plus plugins folder shortcut).';
  end;
end;

procedure InstallStremio;
var
  Code: Integer;
begin
  Exec(ExpandConstant('{tmp}\StremioSetup.exe'), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_SHOW, ewWaitUntilTerminated, Code);
  // the Stremio installer may start Stremio itself; this is a brand-new install, so close it (Plus starts it with plugins)
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/IM stremio-shell-ng.exe /T /F', '', SW_HIDE, ewWaitUntilTerminated, Code);
  if not FileExists(StremioExe) then
    SuppressibleMsgBox('Stremio did not finish installing. Install it from ' + StremioDownloadsPage + ' and then start Stremio Plus.', mbError, MB_OK, IDOK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    SaveStringToFile(ExpandConstant('{app}\datadir.txt'), DataDir(''), False);
    if NeedStremio then InstallStremio;
    if ImportEnh then RunImport;
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and (ImportSummary <> '') then
    WizardForm.FinishedLabel.Caption := WizardForm.FinishedLabel.Caption + #13#10#13#10 + ImportSummary;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  D: AnsiString;
begin
  if CurUninstallStep = usUninstall then begin
    if LoadStringFromFile(ExpandConstant('{app}\datadir.txt'), D) then begin
      if (not UninstallSilent) and DirExists(String(D)) then
        if MsgBox('Also delete your Stremio Plus plugins, themes and settings?' + #13#10 + String(D) + #13#10#13#10 + 'Choose No to keep them (recommended).', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
          DelTree(String(D), True, True, True);
    end;
  end;
end;
