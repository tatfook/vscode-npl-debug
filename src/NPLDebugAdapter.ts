/**
 * author: LiXizhi
 * email: lixizhi@yeah.net
 * date: 2018/2.19
 */
import {
	Logger, logger,
	LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent,
	Thread, Scope, Source, Handles, Breakpoint
} from 'vscode-debugadapter';
import { showInformationMessage, open_url } from './VscodeWrapper';
import { DebugProtocol } from 'vscode-debugprotocol';
import { basename } from 'path';
var fs = require('fs');
import { NPLDebugRuntime, NPLBreakpoint, NPLScriptBreakpoint } from './NPLDebugRuntime';
const { Subject } = require('await-notify');
import { LaunchRequestArguments, AttachRequestArguments } from './NPLDebugRequest';


export class NPLDebugSession extends LoggingDebugSession {
	// we don't support multiple threads, so we can use a hardcoded ID for the default thread
	private static THREAD_ID = 1;

	// a NPL runtime (or debugger)
	private _runtime: NPLDebugRuntime;

	private _variableHandles = new Handles<string>();

	private _configurationDone = new Subject();

	private _searchPath: Array<string> = [];
	/** mapping from known relative path to real file path on disk */
	private _sourceMap = {};

	private _last_evaluate_response: DebugProtocol.EvaluateResponse | undefined;

	/**
	 * Creates a new debug adapter that is used for one debug session.
	 * We configure the default implementation of a debug adapter here.
	 */
	public constructor() {
		super("NPL-debug.txt");
		// this debugger uses zero-based lines and columns
		this.setDebuggerLinesStartAt1(false);
		this.setDebuggerColumnsStartAt1(false);

		this._runtime = new NPLDebugRuntime();

		// setup event handlers
		this._runtime.on('stopOnEntry', () => {
			this.sendEvent(new StoppedEvent('entry', NPLDebugSession.THREAD_ID));
		});
		this._runtime.on('stopOnStep', () => {
			this.sendEvent(new StoppedEvent('step', NPLDebugSession.THREAD_ID));
		});
		this._runtime.on('stopOnBreakpoint', () => {
			this.sendEvent(new StoppedEvent('breakpoint', NPLDebugSession.THREAD_ID));
		});
		this._runtime.on('stopOnException', () => {
			this.sendEvent(new StoppedEvent('exception', NPLDebugSession.THREAD_ID));
		});
		this._runtime.on('breakpointValidated', (bp: NPLBreakpoint) => {
			// not used
			this.sendEvent(new BreakpointEvent('changed', <DebugProtocol.Breakpoint>{ verified: bp.verified, id: bp.id }));
		});
		this._runtime.on('output', (text, filePath, line, column) => {
			const e: DebugProtocol.OutputEvent = new OutputEvent(`${text}\n`);
			e.body.source = filePath && this.createSource(filePath);
			e.body.line = line && this.convertDebuggerLineToClient(line);
			e.body.column = column && this.convertDebuggerColumnToClient(column);
			this.sendEvent(e);
		});
		this._runtime.on('end', () => {
			this.sendEvent(new TerminatedEvent());
		});
		this._runtime.on('log', (text, level?) => {
			logger.log(text, level);
		});
		this._runtime.on('message', (text, callback) => {
			if (callback) {
				showInformationMessage(text, "OK", callback);
			}
			else {
				showInformationMessage(text);
			}
		});
		this._runtime.on('open_url', (url) => {
			open_url(url);
		});
		this._runtime.on('evalResult', (result) => {
			if(this._last_evaluate_response){
				this._last_evaluate_response.body = {
					"result" : String(result),
					"variablesReference": 0
				}
				this.sendResponse(this._last_evaluate_response);
				this._last_evaluate_response = undefined;
			}
		});

	}

	/**
	 * The 'initialize' request is the first request called by the frontend
	 * to interrogate the features the debug adapter provides.
	 */
	protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {

		// build and return the capabilities of this debug adapter:
		response.body = response.body || {};

		// the adapter implements the configurationDoneRequest.
		response.body.supportsConfigurationDoneRequest = true;

		// make VS Code to use 'evaluate' when hovering over source
		response.body.supportsEvaluateForHovers = true;

		this.sendResponse(response);

		// since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
		// we request them early by sending an 'initializeRequest' to the frontend.
		// The frontend will end the configuration sequence by calling 'configurationDone' request.
		this.sendEvent(new InitializedEvent());
	}

	/**
	 * Called at the end of the configuration sequence.
	 * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
	 */
	protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
		super.configurationDoneRequest(response, args);

		// notify the launchRequest that configuration has finished
		this._configurationDone.notify();
	}

	protected async launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments) {

		// make sure to 'Stop' the buffered logging if 'trace' is not set
		logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);

		this.addSearchPath(args.searchpath);

		// wait until configuration has finished (and configurationDoneRequest has been called)
		await this._configurationDone.wait(1000);

		// start the program in the runtime
		this._runtime.start(args.program, args.port, !!args.stopOnEntry);

		this.sendResponse(response);
	}

	protected async attachRequest(response: DebugProtocol.AttachResponse, args: AttachRequestArguments) {

		// make sure to 'Stop' the buffered logging if 'trace' is not set
		logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);

		this.addSearchPath(args.searchpath);

		// wait until configuration has finished (and configurationDoneRequest has been called)
		await this._configurationDone.wait(1000);

		// attach to running NPL runtime
		this._runtime.attach(args.port);

		this.sendResponse(response);
	}

	protected async disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments) {
		this._runtime.stop();
		this.sendResponse(response);
	}

	protected convertClientLineToDebugger(line: number): number{
		return line;
	}
	protected convertDebuggerLineToClient(line: number): number{
		return line;
	}

	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {

		const path : string = this.getRelativePathFromRealPath(args.source.path || "") || "";
		const clientLines = args.lines || [];

		// clear all breakpoints for this file
		this._runtime.clearBreakpoints(path);

		// set and verify breakpoint locations
		const actualBreakpoints = clientLines.map(l => {
			let npl_bp: NPLScriptBreakpoint = this._runtime.setBreakpoint(path, this.convertClientLineToDebugger(l));

			const bp = <DebugProtocol.Breakpoint>new Breakpoint(npl_bp.verified || true, this.convertDebuggerLineToClient(npl_bp.line));
			// bp.id = id;
			return bp;
		});

		// send back the actual breakpoint positions
		response.body = {
			breakpoints: actualBreakpoints
		};
		this.sendResponse(response);
	}

	protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {

		// runtime supports threads so just return a default thread.
		response.body = {
			threads: [
				new Thread(NPLDebugSession.THREAD_ID, "NPL Main thread")
			]
		};
		this.sendResponse(response);
	}

	protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {

		const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
		const maxLevels = typeof args.levels === 'number' ? args.levels : 1000;
		const endFrame = startFrame + maxLevels;

		const stk = this._runtime.stack(startFrame, endFrame);

		stk.frames.forEach(frame => {
			this.translateStackFrame(frame);
		});

		response.body = {
			stackFrames: stk.frames,
			totalFrames: stk.count
		};
		this.sendResponse(response);
	}

	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {

		const frameReference = args.frameId;
		const scopes = new Array<Scope>();
		scopes.push(new Scope("Local", this._variableHandles.create("local_" + frameReference), false));
		scopes.push(new Scope("Global", this._variableHandles.create("global_" + frameReference), true));

		response.body = {
			scopes: scopes
		};
		this.sendResponse(response);
	}

	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {

		const variables = new Array<DebugProtocol.Variable>();
		const id = this._variableHandles.get(args.variablesReference);
		if (id !== null) {
			variables.push({
				name: id + "_i",
				type: "integer",
				value: "123",
				variablesReference: 0
			});
			variables.push({
				name: id + "_f",
				type: "float",
				value: "3.14",
				variablesReference: 0
			});
			variables.push({
				name: id + "_s",
				type: "string",
				value: "hello world",
				variablesReference: 0
			});
			variables.push({
				name: id + "_o",
				type: "object",
				value: "Object",
				variablesReference: this._variableHandles.create("object_")
			});
		}

		response.body = {
			variables: variables
		};
		this.sendResponse(response);
	}

	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		this._runtime.continue();
		this.sendResponse(response);
	}

	protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
		this._runtime.stepover();
		this.sendResponse(response);
	}

	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments) {
		this._runtime.stepinto();
		this.sendResponse(response);
	}

	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) {
		this._runtime.stepout();
		this.sendResponse(response);
	}

	protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments) {
		this._runtime.pause();
		this.sendResponse(response);
	};

	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
		this._runtime.evaluate(args.expression);
		this._last_evaluate_response = response;
	}

	protected convertDebuggerPathToClient(debuggerPath: string): string {
		return debuggerPath;
	}

	protected sourceRequest(response: DebugProtocol.SourceResponse, args: DebugProtocol.SourceArguments) {
		// TODO:
		response.body.content = "file NOT found!";
		this.sendResponse(response);
	}

	protected loadedSourcesRequest(response: DebugProtocol.LoadedSourcesResponse, args: DebugProtocol.LoadedSourcesArguments) {
		// TODO:
	}

	private getRelativePathFromRealPath(filename: string): string | undefined {
		if(filename){
			filename = filename.replace(/\\/g, "/");
			this._searchPath.forEach((path)=>{
				filename = filename.replace(path.replace(/\\/g, "/"), "");
				filename = filename.replace(path.replace(/\\/g, "/").toLowerCase(), "");
			});
			filename = filename.replace(/.*npl_packages\/[^\/]+\//g, "");
			return filename;
		}
	}

	/**
	 * we will cache find found result
	 * @param path relative file path
	 */
	private getRealPathFromRelativePath(path: string): string | undefined {
		let realpath = this._sourceMap[path];
		if (typeof realpath == "string"){
			return realpath;
		}
		else if(typeof realpath == "boolean" && !realpath){
			realpath = undefined;
		}
		else
		{
			this._searchPath.forEach(searchpath => {
				if(!realpath)
				{
					let filePath = `${searchpath}${path}`;
					if(fs.existsSync(filePath)){
						realpath = filePath;
					}
				}
			});
			this._sourceMap[path] = realpath ? realpath : false;
		}
		return realpath;
	}

	//---- helpers

	private translateStackFrame(frame: any) {
		frame.source = {"name":basename(frame.file), "path": frame.file};
		let path: string | undefined = this.convertDebuggerPathToClient(frame.file);
		let realpath = this.getRealPathFromRelativePath(path);
		if (!realpath) {
			// if file is not found
			frame.source.name = `${path}:FileNotFound`;
			frame.source.path = undefined;
			// according to this issue: https://github.com/Microsoft/vscode-cpptools/issues/811
			frame.source.presentationHint = 'deemphasize';
		}
		else{
			frame.source.path = realpath;
		}
	}

	private createSource(filePath: string): Source {
		return new Source(basename(filePath), filePath);
	}

	private addSearchPath(paths: any) {
		paths.forEach(path => {
			path = path.replace(/\\/g, "/");
			if(!path.endsWith("/"))
				path = path + "/";
			this._searchPath.push(path);
		});
	}
}
