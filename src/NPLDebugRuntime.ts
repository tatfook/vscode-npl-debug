/**
 * author: LiXizhi
 * email: lixizhi@yeah.net
 * date: 2018/2.19
 * desc: this is a manual port from script\apps\WebServer\admin\wp-content\pages\debugger.page in NPL main package
 */

// import { readFileSync } from 'fs';
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
	/** NPLRuntime host ip address */
	private _hostIP = "http://127.0.0.1";
	private _hostPort = 8099;
	private _debuggerHelpUrl = "https://github.com/LiXizhi/NPLRuntime/wiki/DebugAndLog";


	private stackinfo = [];
	private expression:string = "";
	private last_eval_result:string[] = [];
	private status:string = "";

	private breakpoints:NPLScriptBreakpoint[] = []; // {filename, line}

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

	// start polling (receive) debug messages from NPL runtime
	private startTimer() {
		if (this.pollTimer)
			return;
		this.pollTimer = setInterval(()=>{
			request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=poll_msg`, json:true}, (error, response, data) =>{
				if(!error){
					var msgs = data.msgs;
					for (var i in msgs) {
						this.handleMessage(msgs[i]);
					}
				}
			});
		}, 500);
	}
	// private stopTimer() {
	// 	if (this.pollTimer) {
	// 		clearInterval(this.pollTimer);
	// 		this.pollTimer = undefined;
	// 	}
	// }

	// private gotoStackLevel(index) {
	// 	if (this.stackinfo.length > index) {
	// 		var line:any = this.stackinfo[index];
	// 		this.gotoSourceLine(line.source, line.currentline);
	// 	}
	// }

	private gotoSourceLine(filename:string, line?:number, bForceReopen?)
	{
		filename = this.getRelativePath(filename);
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
	public setBreakpoint(filename:string, line:number)  : NPLScriptBreakpoint {
		filename = this.getRelativePath(filename);
		return this.addBreakpoint(filename, line) || {filename:filename, line:line};
	}

	/**
	 *
	 * @param filename : this should be relative filepath
	 * @param line
	 */
	private addBreakpoint(filename:string, line:number) : NPLScriptBreakpoint | undefined {
		if (filename && filename != "" && line != null && this.getBreakpointIndex(filename, line) < 0) {
			request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=addbreakpoint&filename=${encodeURIComponent(filename)}&line=${encodeURIComponent(String(line))}`, json:true}, (error, response, data) =>{
			});
			var bp:NPLScriptBreakpoint = { filename: filename, line: line };
			this.breakpoints.push(bp);
			return bp;
		}
	}

	private removeBreakpoint(index:number) {
		var bp = this.breakpoints[index];
		if (bp.filename != null && bp.filename != "" && bp.line != null) {
			request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=removebreakpoint&filename=${encodeURIComponent(bp.filename)}&line=${encodeURIComponent(String(bp.line))}`, json:true}, (error, response, data) =>{});
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
			this.sendEvent('stopOnBreakpoint');
			// this.gotoStackLevel(0);
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
		this.console_output(`${msg.filename}:${msg.param1},${msg.param2},${msg.code}`);
	}


	/** attach to a running NPL runtime with a given port on localhost.  */
	public attach(port?: number) {
		this._hostPort = port || this._hostPort;
		request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=attach`, json:true}, (error, response, data) =>{
			if(error){
				this.error(`error: NPLRuntime not detected on ${this.GetHost()}`);
				this.message(`NPLRuntime not detected on ${this.GetHost()}. Do you want to see help page?`, ()=>{
					this.open_url(this._debuggerHelpUrl);
				});
				this.end();
				return;
			}
			this.startTimer();
            this.status = "running";
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
		request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=stop`, json:true}, (error, response, data) =>{
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

	/** send log message to front end's debug console. Please note if the user does not enable trace in launch.json,
	 * message will not be shown to the user.
	 */
	public log(content:string, level?){
		this.sendEvent("log", content, level);
	}

	/** send a message to the debug console regardless of tracing settings. */
	public console_output(output:string, filePath?:string, line?:number, column?:number){
		this.sendEvent(output, filePath, line, column);
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
			request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=addbreakpoint&filename=${encodeURIComponent(this.breakpoints[i].filename)}&line=${encodeURIComponent(String(this.breakpoints[i].line))}`, json:true}, (error, response, data) =>{});
		}
	}

	public pause() {
		request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=pause`, json:true}, (error, response, data) =>{
			this.uploadBreakpoints();
		});
		this.startTimer();
		this.status = "running";
	}

	public stepover() {
		request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=stepover`, json:true}, (error, response, data) =>{});
	}
	public stepinto () {
		request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=stepinto`, json:true}, (error, response, data) =>{});
	}
	public stepout() {
		request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=stepout`, json:true}, (error, response, data) =>{});
	}

	public evaluate() {
		this.last_eval_result = [];
		var code = this.expression;
		if (this.expression.indexOf(";") < 0)
			code = "return " + code;
		request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=evaluate&code=${encodeURIComponent(code)}`, json:true}, (error, response, data) =>{});
	}

	public listBreakpoint() {
		request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=listbreakpoint`, json:true}, (error, response, data) =>{});
	}

	/**
	 * Continue execution
	 */
	public continue() {
		if(this.status == "paused"){
			request.get({url: `${this.GetHost()}ajax/vscode_debugger?action=continue`, json:true}, (error, response, data) =>{
				this.status = "running";
				this.stackinfo = [];
			});
		}
		else if(this.status == "" || this.status == "detached")
			this.attach();
	}

	/**
	 * Returns stacktrace
	 */
	public stack(startFrame: number, endFrame: number): any {
		const frames = new Array<any>();
		// every word of the current line becomes a stack frame.
		for (let i = startFrame; i < Math.min(endFrame, this.stackinfo.length); i++) {
			const frame:any = this.stackinfo[i];	// use a word of the line as the stackframe name
			frames.push({
				index: i,
				name: `${i}: in function ${frame.name}()`,
				file: frame.source,
				line: frame.line
			});
		}
		return {
			frames: frames,
			count: this.stackinfo.length
		};
	}

	private sendEvent(event: string, ... args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}