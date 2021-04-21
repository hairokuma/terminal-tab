/** @babel */

import {
  CompositeDisposable
} from 'atom';
import TerminalSession from './terminal-session';
import TerminalView from './terminal-view';
import config from './config';
import os from 'os'

const TERMINAL_TAB_URI = 'terminal-tab://';


export default {

  config,
  currentTerminal: null,
  currentSession: null,
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

    if (!atom.workspace.paneForItem(this.currentSession)) {
      this.findSession();
      if (!this.currentSession) {
        this.handleOpen();
        this.contine = "this.handleRunLine();";
        return null;
      }
    }

    var editor = atom.workspace.getActiveTextEditor();
    editor.selectLinesContainingCursors();
    var line = editor.getSelectedText()
    editor.moveToEndOfLine();
    this.currentSession.write(line);
    this.focusBackToPane(activePane);
    this.focusToTerminal();
  },

  handleRunFile() {
    const activePane = atom.workspace.getActivePane();

    // open new Session and continue when initialized
    if (!atom.workspace.paneForItem(this.currentSession)) {
      this.findSession();
      if (!this.currentSession) {
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
    const ext = '.' + fullName.replace(/.*\./g, '');

    if (ext === '.java') {
      commands = this.getJavaCommands(fullName, fullPath);
    } else if (ext === '.py') {
      commands = [atom.config.get('terminal-tab.python.home') + ' ' + fullPath]
    } else if (ext === '.sh') {
      commands = ['sh ' + fullPath]
    } else {
      console.log('Error: not a shell, java or Python file');
    }

    if (commands) {
      for (var command of commands) {
        this.currentSession.write(command + os.EOL.charAt(0));
      }
    }

    this.focusBackToPane(activePane);
    this.focusToTerminal();


  },
  focusBackToPane(pane) {
    var done = false;
    this.currentSession.pty.onData((data) => {
      if (!done && (data.endsWith('$ ') || data.endsWith('# '))) {
        pane.activate();
        done = true;
      }
    });
  },
  focusToTerminal() {
    atom.workspace.paneForItem(this.currentSession).activate();
  },
  findSession() {
    var found = false;
    for (const item of atom.workspace.getPaneItems()) {
      activeItem = atom.workspace.paneForItem(item).getActiveItem()
      if (activeItem.constructor.name == "TerminalSession") {
        this.currentSession = activeItem;
        found = true;
        break
      }
      if (item.constructor.name == "TerminalSession") {
        this.currentSession = item;
        atom.workspace.paneForItem(item).activateItem(item);
        found = true;
      }
    }
    if (!found) {
      this.currentSession = null;
    }
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
    if (workingDir.indexOf(dirDivider + srcFolderName + dirDivider) != -1) {
      packageName = workingDir.substr(workingDir.indexOf(dirDivider + srcFolderName + dirDivider) + srcFolderName.length + (dirDivider.length * 2), workingDir.length).replace(dirDivider, '');
      projectRoot = workingDir.substr(0, workingDir.indexOf(dirDivider + srcFolderName + dirDivider));
      pathToBin = projectRoot + dirDivider + binFolderName;
      javacArgs.push("-d");
      javacArgs.push(pathToBin);
      pathToSrc = projectRoot + dirDivider + srcFolderName;
      classPaths.push(pathToSrc);
      if (packageName.length > 0) {
        classFilename = packageName + "." + filename
      }
    }
    pathToIncludes = projectRoot + dirDivider + includeFolderName
    const fs = require("fs"); // Or `import fs from "fs";` with ESM
    if (fs.existsSync(pathToIncludes)) {
      pathToIncludes = pathToIncludes + dirDivider + '*'
      classPaths.push(pathToIncludes);
    }

    javacArgs.push("-cp");
    javacArgs.push(classPaths.join(cpDivider));

    classPaths = [workingDir];
    if (pathToBin.length > 0) {
      classPaths = [pathToIncludes, pathToBin];
    }

    javaArgs.push("-cp");
    javaArgs.push(classPaths.join(cpDivider));

    commands.push('cd ' + projectRoot);
    commands.push(javaPath + 'javac ' + javacArgs.join(" ") + " " + fullPath);
    commands.push(javaPath + 'java ' + javaArgs.join(" ") + ' ' + classFilename);

    return commands
  },


  handleClose() {
    this.currentSession = null;
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
      this.currentSession = session;
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

    for (const item of atom.workspace.getPaneItems()) {
      activeItem = atom.workspace.paneForItem(item).getActiveItem()
      if (activeItem.constructor.name == "TerminalSession") {
        this.currentSession = activeItem;
        break
      }
      if (item.constructor.name == "TerminalSession") {
        this.currentSession = item
        atom.workspace.paneForItem(item).activateItem(item);
      }
    }
  },

  addCommands() {
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
