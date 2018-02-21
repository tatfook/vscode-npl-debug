/**
 * author: LiXizhi
 * email: lixizhi@yeah.net
 * date: 2018/2.19
 * desc: this is a manual port from script\apps\WebServer\admin\wp-content\pages\debugger.page in NPL main package
 */

import { readFileSync } from 'fs';
import { EventEmitter } from 'events';
import { setInterval } from 'timers';
var request = require('request');

export interface NPLBreakpoint {
	id: number;
	line: number;
	verified: boolean;
}
export interface NPLScriptBreakpoint {
	filename: string;
	line: number;
	verified?: boolean;
}

/**
 * A NPL debug runtime with minimal debugger functionality.
 *
 */
export class NPLDebugRuntime extends EventEmitter {

	// the initial (and one and only) file we are 'debugging'
	private _sourceFile: string;
	public get sourceFile() {
		return this._sourceFile;
	}

	// the contents (= lines) of the one and only file
	private _sourceLines: string[];

	// This is the next line that will be 'executed'
	private _currentLine = 0;

	// maps from sourceFile to array of NPL breakpoints
	private _breakPoints = new Map<string, NPLBreakpoint[]>();

	// since we want to send breakpoint events, we will assign an id to every event
	// so that the frontend can match events with breakpoints.
	private _breakpointId = 1;

	/** NPLRuntime host ip address */
	private _hostIP = "http://127.0.0.1";
	private _hostPort = 8099;
	private _debuggerHelpUrl = "https://github.com/LiXizhi/NPLRuntime/wiki/DebugAndLog";


	private msgs : any[] = [];
	private stackinfo = [];
	private selectedStackLevel = 0;
	private expression:string = "";
	private last_eval_result:string[] = [];
	private status:string = "";

	private breakpoints:NPLScriptBreakpoint[] = []; // {filename, line}
	private openedfiles:NPLScriptBreakpoint[] = []; // {filename, line}
	private currentFilename:string = "";

	private workspaceDir: string;
	private devDir:string;
	private pollTimer;


	constructor() {
		super();
	}

	/** return "http://127.0.0.1:8099/" */
	private GetHost() {
		return `${this._hostIP}:${this._hostPort}/`;
	}

	/** wrapper of json based NPL http request */
	private GetUrl(url: string, callback?){
		return request.get({url: `${this.GetHost()}${url}`, json:true}, callback);
	}

	// start polling (receive) debug messages from NPL runtime
	private startTimer() {
		if (this.pollTimer)
			return;
		this.pollTimer = setInterval(()=>{
			request.get({url: `${this.GetHost()}vscode_debugger?action=poll_msg`, json:true}, (error, response, data) =>{
				if(!error){
					var msgs = data.msgs;
					for (var i in msgs) {
						this.handleMessage(msgs[i]);
					}
				}
			});
		}, 500);
	}
	private stopTimer() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = undefined;
		}
	}

	private gotoStackLevel(index) {
		this.selectedStackLevel = index;
		if (this.stackinfo.length > index) {
			var line:any = this.stackinfo[index];
			this.gotoSourceLine(line.source, line.currentline);
		}
	}

	private gotoSourceLine(filename:string, line?:number, bForceReopen?)
	{
		filename = this.getRelativePath(filename);
	}

	/*
	 * Clear breakpoint in file with given line.
	 */
	public clearBreakPoint(path: string, line: number) : NPLBreakpoint | undefined {
		let bps = this._breakPoints.get(path);
		if (bps) {
			const index = bps.findIndex(bp => bp.line === line);
			if (index >= 0) {
				const bp = bps[index];
				bps.splice(index, 1);
				return bp;
			}
		}
		return undefined;
	}

	/*
	 * Clear all breakpoints for the given file.
	 * @param filename: this is the absolute filename
	 */
	public clearBreakpoints(filename: string): void {
		filename = this.getRelativePath(filename);
		for (var i = 0; i < this.breakpoints.length; ) {
			if (this.breakpoints[i].filename.toLowerCase() == filename.toLowerCase())
				this.removeBreakpoint(i);
			else
				i++;
		}
	}

	/**
	 *
	 * @param filename: this is the absolute filename
	 * @param line
	 */
	public setBreakpoint(filename:string, line:number)  : NPLScriptBreakpoint | undefined {
		filename = this.getRelativePath(filename);
		return this.addBreakpoint(filename, line);
	}

	/**
	 *
	 * @param filename : this should be relative filepath
	 * @param line
	 */
	private addBreakpoint(filename:string, line:number) : NPLScriptBreakpoint | undefined {
		if (filename && filename != "" && line != null && this.getBreakpointIndex(filename, line) < 0) {
			request.get({url: `${this.GetHost()}vscode_debugger?action=addbreakpoint&filename=${encodeURIComponent(filename)}&line=${encodeURIComponent(line)}`, json:true}, (error, response, data) =>{
			});
			var bp:NPLScriptBreakpoint = { filename: filename, line: line };
			this.breakpoints.push(bp);
			return bp;
		}
	}

	private removeBreakpoint(index:number) {
		var bp = this.breakpoints[index];
		if (bp.filename != null && bp.filename != "" && bp.line != null) {
			request.get({url: `${this.GetHost()}vscode_debugger?action=removebreakpoint&filename=${encodeURIComponent(bp.filename)}&line=${encodeURIComponent(String(bp.line))}`, json:true}, (error, response, data) =>{});
			if (index != null)
				this.breakpoints.splice(index, 1);
		}
	}

	private getBreakpointIndex(filename:string, line:number) {
		for (var i = 0; i < this.breakpoints.length; i++) {
			if (this.breakpoints[i].line == line && this.breakpoints[i].filename.toLowerCase() == filename.toLowerCase())
				return i;
		}
		return -1;
	}

	private getRelativePath(filename:string) {
		filename = filename.replace(/\\/g, "/");
		filename = filename.replace(this.workspaceDir, "");
		filename = filename.replace(this.workspaceDir.toLowerCase(), "");
		if(this.devDir!="")
		{
			filename = filename.replace(this.devDir, "");
			filename = filename.replace(this.devDir.toLowerCase(), "");
		}
		filename = filename.replace(/.*npl_packages\/[^\/]+\//g, "");
		return filename;
	}

	private handleMessage(msg){
		var cmd = msg.filename;
		if (cmd == "BP") {
			this.stackinfo = msg.code.stack_info;
			this.gotoStackLevel(0);
			return;
		}
		else if (cmd == "ExpValue") {
			this.last_eval_result.push(msg.code);
		}
		else if (cmd == "exit") {
			this.stop();
		}
		else if (cmd == "openfile") {
			msg.param1 = msg.file; msg.param2 = msg.line;
			this.gotoSourceLine(msg.file, msg.line, true);
		}
		else if (cmd == "listBreakpoint" && msg.code != null) {
			if (Array.isArray(msg.code))
				this.breakpoints = msg.code;
			else
				this.breakpoints = [];
		}
		else if (cmd == "DebuggerOutput" && msg.code != null) {
			if (msg.code == "[DEBUG]> ") {
				this.status = "paused";
			}
			else if (msg.code.substring(0, 10) == "Break at: ") {
				var lineEnd = msg.code.indexOf(" in");
				if (lineEnd > 0) {
					var line = Number(msg.code.substr(10, lineEnd - 10));
					var filename = msg.code.substr(lineEnd + 4, msg.code.length - lineEnd - 4).trim();
					this.addBreakpoint(filename, line);
				}
			}
			else if (msg.code.substring(0, 29) == "Breakpoint async set in file ")
			{
				var lineEnd = msg.code.indexOf(" line ", 29);
				if (lineEnd > 0) {
					var line = Number(msg.code.substr(lineEnd + 6, msg.code.length - lineEnd - 6).trim());
					var filename = msg.code.substr(29, lineEnd - 29).trim();
					filename = this.getRelativePath(filename);
					var bpIndex = this.getBreakpointIndex(filename, line);
					if (bpIndex < 0) {
						this.addBreakpoint(filename, line);
						this.gotoSourceLine(filename, line);
					}
				}
			}
		}
		this.msgs.push(msg);
	}


	/** attach to a running NPL runtime with a given port on localhost.  */
	public attach(port?: number) {
		this._hostPort = port || this._hostPort;
		request.get({url: `${this.GetHost()}vscode_debugger?action=attach`, json:true}, (error, response, data) =>{
			if(error){
				this.error(`error: NPLRuntime not detected on ${this.GetHost()}`);
				this.message(`NPLRuntime not detected on ${this.GetHost()}. Do you want to see help page?`, ()=>{
					this.open_url(this._debuggerHelpUrl);
				});
				this.end();
				return;
			}
		});
	}

	/**
	 * Start executing the given program.
	 */
	public start(program: string, port?:number, stopOnEntry?: boolean) {
		// TODO: start NPLRuntime with http debug and redirect bootstrap file.
		this.attach(port);
	}

	public stop()
	{
		request.get({url: `${this.GetHost()}vscode_debugger?action=stop`, json:true}, (error, response, data) =>{
			if(error){
				this.error(`NPLRuntime not detected on ${this.GetHost()}`);
				return;
			}
			this.log("NPLRuntime debugger detached. NPLRuntime is now running with full speed.");
		});
		this.status = "detached";
		this.stackinfo = [];
	}

	public end(){
		this.sendEvent('end');
	}

	/**show UI message to user
	 * @param callback: if provided, we will show a OK button and call this function if user clicks it instead of close.
	*/
	public message(text, callback?){
		this.sendEvent('message', text, callback);
	}

	/** send log message to front end's debug console */
	public log(content:string, level?){
		this.sendEvent("log", content, level);
	}

	/** send error message to front end */
	public error(content:string){
		this.log(content, 3);
	}

	/** open an url in external browser */
	public open_url(url){
		this.sendEvent("open_url", url);
	}

	private uploadBreakpoints(){
		for (var i = 0; i < this.breakpoints.length; i++) {
			request.get({url: `${this.GetHost()}vscode_debugger?action=addbreakpoint&filename=${encodeURIComponent(this.breakpoints[i].filename)}&line=${encodeURIComponent(String(this.breakpoints[i].line))}`, json:true}, (error, response, data) =>{});
		}
	}

	private pause() {
		request.get({url: `${this.GetHost()}vscode_debugger?action=pause`, json:true}, (error, response, data) =>{
			this.uploadBreakpoints();
		});
		this.startTimer();
		this.status = "running";
	}

	private stepover() {
		request.get({url: `${this.GetHost()}vscode_debugger?action=stepover`, json:true}, (error, response, data) =>{});
	}
	private stepinto () {
		request.get({url: `${this.GetHost()}vscode_debugger?action=stepinto`, json:true}, (error, response, data) =>{});
	}
	private stepout() {
		request.get({url: `${this.GetHost()}vscode_debugger?action=stepout`, json:true}, (error, response, data) =>{});
	}

	private evaluate() {
		this.last_eval_result = [];
		var code = this.expression;
		if (this.expression.indexOf(";") < 0)
			code = "return " + code;
		request.get({url: `${this.GetHost()}vscode_debugger?action=evaluate&code=${encodeURIComponent(code)}`, json:true}, (error, response, data) =>{});
	}

	private listBreakpoint() {
		request.get({url: `${this.GetHost()}vscode_debugger?action=listbreakpoint`, json:true}, (error, response, data) =>{});
	}

	/**
	 * Continue execution to the end/beginning.
	 */
	public continue(reverse = false) {
		this.run(reverse, undefined);
	}

	/**
	 * Step to the next/previous non empty line.
	 */
	public step(reverse = false, event = 'stopOnStep') {
		this.run(reverse, event);
	}

	/**
	 * Returns a fake 'stacktrace' where every 'stackframe' is a word from the current line.
	 */
	public stack(startFrame: number, endFrame: number): any {

		const words = this._sourceLines[this._currentLine].trim().split(/\s+/);

		const frames = new Array<any>();
		// every word of the current line becomes a stack frame.
		for (let i = startFrame; i < Math.min(endFrame, words.length); i++) {
			const name = words[i];	// use a word of the line as the stackframe name
			frames.push({
				index: i,
				name: `${name}(${i})`,
				file: this._sourceFile,
				line: this._currentLine
			});
		}
		return {
			frames: frames,
			count: words.length
		};
	}

	// private methods

	private loadSource(file: string) {
		if (this._sourceFile !== file) {
			this._sourceFile = file;
			try {
				this._sourceLines = readFileSync(this._sourceFile).toString().split('\n');
			} catch (error) {
				this._sourceLines = ["hello", "world"];
			}
		}
	}

	/**
	 * Run through the file.
	 * If stepEvent is specified only run a single step and emit the stepEvent.
	 */
	private run(reverse = false, stepEvent?: string) {
		if (reverse) {
			for (let ln = this._currentLine-1; ln >= 0; ln--) {
				if (this.fireEventsForLine(ln, stepEvent)) {
					this._currentLine = ln;
					return;
				}
			}
			// no more lines: stop at first line
			this._currentLine = 0;
			this.sendEvent('stopOnEntry');
		} else {
			for (let ln = this._currentLine+1; ln < this._sourceLines.length; ln++) {
				if (this.fireEventsForLine(ln, stepEvent)) {
					this._currentLine = ln;
					return true;
				}
			}
			// no more lines: run to end
			this.sendEvent('end');
		}
	}

	private verifyBreakpoints(path: string) : void {
		let bps = this._breakPoints.get(path);
		if (bps) {
			this.loadSource(path);
			bps.forEach(bp => {
				if (!bp.verified && bp.line < this._sourceLines.length) {
					const srcLine = this._sourceLines[bp.line].trim();

					// if a line is empty or starts with '+' we don't allow to set a breakpoint but move the breakpoint down
					if (srcLine.length === 0 || srcLine.indexOf('+') === 0) {
						bp.line++;
					}
					// if a line starts with '-' we don't allow to set a breakpoint but move the breakpoint up
					if (srcLine.indexOf('-') === 0) {
						bp.line--;
					}
					// don't set 'verified' to true if the line contains the word 'lazy'
					// in this case the breakpoint will be verified 'lazy' after hitting it once.
					if (srcLine.indexOf('lazy') < 0) {
						bp.verified = true;
						this.sendEvent('breakpointValidated', bp);
					}
				}
			});
		}
	}

	/**
	 * Fire events if line has a breakpoint or the word 'exception' is found.
	 * Returns true is execution needs to stop.
	 */
	private fireEventsForLine(ln: number, stepEvent?: string): boolean {

		const line = this._sourceLines[ln].trim();

		// if 'log(...)' found in source -> send argument to debug console
		const matches = /log\((.*)\)/.exec(line);
		if (matches && matches.length === 2) {
			this.sendEvent('output', matches[1], this._sourceFile, ln, matches.index)
		}

		// if word 'exception' found in source -> throw exception
		if (line.indexOf('exception') >= 0) {
			this.sendEvent('stopOnException');
			return true;
		}

		// is there a breakpoint?
		const breakpoints = this._breakPoints.get(this._sourceFile);
		if (breakpoints) {
			const bps = breakpoints.filter(bp => bp.line === ln);
			if (bps.length > 0) {

				// send 'stopped' event
				this.sendEvent('stopOnBreakpoint');

				// the following shows the use of 'breakpoint' events to update properties of a breakpoint in the UI
				// if breakpoint is not yet verified, verify it now and send a 'breakpoint' update event
				if (!bps[0].verified) {
					bps[0].verified = true;
					this.sendEvent('breakpointValidated', bps[0]);
				}
				return true;
			}
		}

		// non-empty line
		if (stepEvent && line.length > 0) {
			this.sendEvent(stepEvent);
			return true;
		}

		// nothing interesting found -> continue
		return false;
	}

	private sendEvent(event: string, ... args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}