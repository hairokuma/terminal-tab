/** @babel */

import {
  CompositeDisposable
} from 'atom';
import TerminalSession from './terminal-session';
import TerminalView from './terminal-view';
import config from './config';
import os from 'os'

const TERMINAL_TAB_URI = 'terminal-tab://';

var currentSession;
var done = false;
export default {

  config,
  currentTerminal: null,
  test: null,
  sessions: null,
  openProc: null,
  continue: false,
  initialize() {
    this.disposables = new CompositeDisposable();
    this.addViewProvider();
  },

  activate() {
    this.addOpener();
    this.addCommands();
    const setActive = (item) => {
      if (item) {
        if (item.constructor.name != "TreeView") {
          activePane = atom.workspace.getActivePane();
          if (item instanceof TerminalSession) {
            currentSession = item;
          }
        }
      }
    }
    atom.workspace.observePaneItems(setActive);
    atom.workspace.onDidChangeActivePaneItem(setActive)
  },

  deactivate() {
    this.disposables.dispose();
  },

  deserializeTerminalSession(data) {
    return new TerminalSession(data.config);
  },

  handleOpen() {
    this.currentTerminal = atom.workspace.open(TERMINAL_TAB_URI);
    return this.currentTerminal;
  },
  handleRunLine() {

    const activePane = atom.workspace.getActivePane();
    var editor = atom.workspace.getActiveTextEditor();
    console.log(editor);
    console.log(currentSession);
    if (!atom.workspace.paneForItem(currentSession)) {
      if (!currentSession) {
        this.handleOpen();
        this.focusBackToPane(activePane);
        this.contine = "this.handleRunLine();";
        return null;
      }
    }

    editor.selectLinesContainingCursors();
    var line = editor.getSelectedText()
    editor.moveToEndOfLine();
    console.log(line.replace(/(\r\n|\n|\r)/gm, ""));
    currentSession.write(line.replace(/(\r\n|\n|\r)/gm, "")+ os.EOL.charAt(0));
    this.focusBackToPane(activePane);
    this.focusToTerminal();
  },
  handleRunFile() {
    const activePane = atom.workspace.getActivePane();
    var setFocus = true;
    // open new Session and continue when initialized
    if (!atom.workspace.paneForItem(currentSession)) {
      if (!currentSession) {
        this.handleOpen();
        this.contine = "this.handleRunFile();";
        return null;
      }
    }

    const editor = atom.workspace.getActiveTextEditor();
    editor.save();

    var commands;
    const fullPath = editor.getPath(); // path/with/fileName.ext
    const fullName = editor.getTitle(); // fileName.ext
    const ext = '.' + fullName.replace(/.*\./g, ''); //.ext
    const path = fullPath.replace(fullName, '');
    this.changePath(path);
    if (ext === '.java') {
      commands = this.getJavaCommands(fullName, fullPath);
    } else if (ext === '.py') {
      commands = [atom.config.get('terminal-tab.python.home') + ' "' + fullPath + '"']
    } else if (ext === '.sh') {
      commands = ['sh ' + fullPath]
    } else if (ext === '.c') {
      // gcc IOloops.c -o IOloops && ./IOloops
      commands = ['gcc ' + fullName + ' -o ' + fullName.replace(ext, '') + ' && ./' + fullName.replace(ext, '')]
    } else {
      console.log('Error: not a c, shell, java or Python file');
      setFocus = false;
    }

    if (commands) {
      for (var command of commands) {
        currentSession.write(command + os.EOL.charAt(0));
      }
    }

    this.focusBackToPane(activePane);
    if (!setFocus) {
      this.focusToTerminal();
    }
  },
  changePath(path) {
    shellPath = atom.config.get('terminal-tab.shellSettings.shellPath');
    console.log(shellPath);
    if (shellPath.includes('bash.exe')) {
      console.log(path);
      drive = "/mnt/" + path.charAt(0).toLowerCase();
      console.log(drive + '/' + path.replace(/\\/g, '/').substring(3));
      currentSession.write('cd ' + drive + '/' + path.replace(/\\/g, '/').substring(3) + os.EOL.charAt(0));
    }

  },
  focusBackToPane(pane) {
    done = false;
    if (currentSession) {
      if (!currentSession.pty.focusBackToPaneListener) {
        currentSession.pty.focusBackToPaneListener = true;
        currentSession.pty.onData((data) => {
          if (!done && atom.config.get('terminal-tab.alwaysFocusBack')) {
            pane.activate();
            done = true;
          } else {
            atom.config.get('terminal-tab.prompt').split(',').forEach((prompt, i) => {
              if (!done && data.split('\n').pop().trim().includes(prompt.trim())) {
                console.log(data.split('\n').pop().trim());
                console.log(prompt.trim());
                console.log(data.split('\n').pop().trim().includes(prompt.trim()));
                pane.activate();
                done = true;
              }
            });
          }
        });
      }
    } else {
      pane.activate();
    }
  },
  focusToTerminal() {
    atom.workspace.paneForItem(currentSession).activate();
  },

  continue (contine = this.contine) {
    this.contine = null;
    if (contine) {
      eval(contine);
    }
  },
  getJavaCommands(fullName, fullPath) {
    // TODO: setup config
    const javaPath = atom.config.get('terminal-tab.java.home');
    var javacArgs = atom.config.get('terminal-tab.java.compileArgs');
    var javaArgs = atom.config.get('terminal-tab.java.executeArgs');
    const words = atom.workspace.getActiveTextEditor().getText();
    var commands = []
    var javacArgs = javacArgs == "" ? [] : javacArgs.match(/(?:[^\s"]+|"[^"]*")+/g);
    var javaArgs = javaArgs == "" ? [] : javaArgs.match(/(?:[^\s"]+|"[^"]*")+/g);
    if (words.includes("javafx")) {
      console.log("JavaFX detected & modules loadet");
      const jfxPath = atom.config.get('terminal-tab.java.fxHome');
      const jfxModules = ["--module-path", jfxPath, "--add-modules", "javafx.controls"];
      javacArgs = javacArgs.concat(jfxModules);
      javaArgs = javaArgs.concat(jfxModules);
    }

    const filename = fullName.replace(/\..*/g, '');
    const ext = '.' + fullName.replace(/.*\./g, '');
    const workingDir = fullPath.replace(fullName, '');
    const dirDivider = process.platform == "linux" ? "/" : "\\";
    const cpDivider = process.platform == "linux" ? ":" : ";"; // windows: ;
    const fs = require("fs"); // Or `import fs from "fs";` with ESM

    var classFilename = filename;
    var packageName = "";
    var srcFolderName = "src";
    var binFolderName = "bin";
    var includeFolderName = "include";
    var projectRoot = workingDir;
    var pathToBin = '';
    var pathToSrc = '';
    var pathToIncludes = '';
    var classPaths = [];

    if (words.includes("package")) {
      for (let line of words.split(/\r?\n/)) {
        if (line.includes("package")) {
          packageName = line.replace("package", '').trim().replace(';', '');
          break;
        }
      }
    }

    if (workingDir.indexOf(dirDivider + srcFolderName + dirDivider) != -1) {
      packageName = workingDir.substr(workingDir.indexOf(dirDivider + srcFolderName + dirDivider) + srcFolderName.length + (dirDivider.length * 2), workingDir.length).replace(dirDivider, '');
      projectRoot = workingDir.substr(0, workingDir.indexOf(dirDivider + srcFolderName + dirDivider));

      pathToBin = projectRoot + dirDivider + binFolderName;
      javacArgs.push("-d");
      javacArgs.push(pathToBin);
      pathToSrc = projectRoot + dirDivider + srcFolderName;
      classPaths.push(pathToSrc);
    }
    runfile = projectRoot + dirDivider + "runfile.txt"
    if (fs.existsSync(runfile)) {
      try {
        const data = fs.readFileSync(runfile, 'utf8')
        return data.split(/\r?\n/)
      } catch (err) {
        console.error(err)
      }
    }
    if (packageName.length > 0) {
      classFilename = packageName + "." + filename
    }
    pathToIncludes = projectRoot + dirDivider + includeFolderName
    if (fs.existsSync(pathToIncludes)) {
      pathToIncludes = pathToIncludes + dirDivider + '*'
      classPaths.push(pathToIncludes);
    }

    if (classPaths && classPaths.length) {
      javacArgs.push("-cp");
      javacArgs.push('"' + classPaths.join(cpDivider) + '"');
    }

    classPaths = [workingDir.replace(packageName.replace('.', dirDivider), '')];
    if (pathToBin.length > 0) {
      classPaths = [pathToIncludes, pathToBin];
    }

    javaArgs.push("-cp");
    javaArgs.push('"' + classPaths.join(cpDivider) + '"');

    commands.push('cd "' + projectRoot + '"');
    commands.push(javaPath + 'javac ' + javacArgs.join(" ") + ' "' + fullPath + '"');
    commands.push(javaPath + 'java ' + javaArgs.join(" ") + ' "' + classFilename + '"');

    return commands
  },


  handleClose() {
    console.log('close');
    currentSession = null;
    const activePane = atom.workspace.getActivePane();
    activePane.destroyActiveItem();
  },

  handleCopy() {
    const activeSession = atom.workspace.getActivePaneItem();
    activeSession.copySelection();
  },

  handlePaste() {
    const activeSession = atom.workspace.getActivePaneItem();
    activeSession.pasteFromClipboard();
  },

  handleClear() {
    const activeSession = atom.workspace.getActivePaneItem();
    activeSession.clear();
  },

  addViewProvider() {
    this.disposables.add(atom.views.addViewProvider(TerminalSession, (session) => {
      currentSession = session;
      console.log("addViewProvider");
      console.log(currentSession);
      this.continue();
      return new TerminalView(session).element;
    }));
  },

  addOpener() {
    this.disposables.add(atom.workspace.addOpener((uri) => {
      if (uri === TERMINAL_TAB_URI) {
        return new TerminalSession();
      }
    }));
  },
  debug() {
    console.log('DEBUG: ');
    console.log(currentSession);
    console.log(atom.workspace.paneForItem(currentSession));
    const activePane = atom.workspace.getActivePane();
    var editor = atom.workspace.getActiveTextEditor();
    console.log('pane');
    console.log(editor);
    console.log(activePane);
    if (!atom.workspace.paneForItem(currentSession)) {
      console.log('if');
      if (!currentSession) {
        console.log('noTerminal');
        this.handleOpen();
        this.focusBackToPane(activePane);
        this.contine = "this.debug();";
        return null;
      }
    } else {
      console.log("else");
    }
  },

  addCommands() {
    for (const pane of atom.workspace.getPanes()) {
      pane.onDidActivate(function() {
        activeItem = pane.getActiveItem();
        if (activeItem) {
          if (activeItem.constructor.name == "TerminalSession") {
            currentSession = activeItem;
          }
        }
      });
    }

    this.disposables.add(atom.commands.add('atom-workspace', {
      'terminal:open': this.handleOpen.bind(this),
      'terminal:runFile': this.handleRunFile.bind(this),
      'terminal:debug': this.debug.bind(this)
    }));
    this.disposables.add(atom.commands.add('atom-text-editor', {
      'terminal:runLine': this.handleRunLine.bind(this)
    }));
    this.disposables.add(atom.commands.add('terminal-view', {
      'terminal:copy': this.handleCopy.bind(this),
      'terminal:paste': this.handlePaste.bind(this),
      'terminal:clear': this.handleClear.bind(this),
      'terminal:close': this.handleClose.bind(this)
    }));
  }
};
