/**
 * author: LiXizhi
 * email: lixizhi@yeah.net
 * date: 2018/2.19
 */

'use strict';
import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { NPLDebugSession } from './NPLDebugAdapter';
import {SetVsCodeImplementation} from './VscodeWrapper';
import * as Net from 'net';

/*
 * Set the following compile time flag to true if the
 * debug adapter should run inside the extension host.
 * Please note: the test suite does no longer work in this mode.
 */
const EMBED_DEBUG_ADAPTER = true;

export function activate(context: vscode.ExtensionContext) {
	SetVsCodeImplementation(vscode);
	// context.subscriptions.push(vscode.commands.registerCommand('extension.NPL-debug.getProgramName', config => {
	// 	return vscode.window.showInputBox({
	// 		placeHolder: "Please enter the name of a markdown file in the workspace folder",
	// 		value: "readme.md"
	// 	});
	// }));

	// register a configuration provider for 'NPL' debug type
	const provider = new NPLConfigurationProvider()
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('NPL', provider));
	context.subscriptions.push(provider);
}

export function deactivate() {
	// nothing to do
}

class NPLConfigurationProvider implements vscode.DebugConfigurationProvider {

	private _server?: Net.Server;

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		// if launch.json is missing or empty
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === 'lua' ) {
				config.type = 'NPL';
				config.name = 'Attach';
				config.request = 'attach';
				config.port = '8099';
				config.stopOnEntry = true;
			}
		}
		config.searchpath = config.searchpath || [];
		if(folder){
			config.cwd = config.cwd || folder.uri.fsPath;
			config.searchpath.push(config.cwd);
		}

		if ((config.bootstrapper === "current_open_file")  && config.request === "launch") {
			// use the current file.
			const editor = vscode.window.activeTextEditor;
			if (editor && (editor.document.languageId === 'lua' || editor.document.languageId === 'npl')) {
				let fullpath:string = editor.document.uri.fsPath;
				if(fullpath && folder && folder.uri.fsPath){
					fullpath = fullpath.replace(folder.uri.fsPath, "");
					fullpath = fullpath.replace(/\\/g, "/");
					if(fullpath && fullpath[0] == '/'){
						fullpath = fullpath.substr(1, fullpath.length-1);
					}
					config.bootstrapper = fullpath;
				}
			}
		}

		if (config.debugServer && EMBED_DEBUG_ADAPTER) {
			// start port listener on launch of first debug session
			if (!this._server) {

				// start listening on a random port
				this._server = Net.createServer(socket => {
					const session = new NPLDebugSession();
					session.setRunAsServer(true);
					session.start(<NodeJS.ReadableStream>socket, socket);
				}).listen(0);
			}
			// make VS Code connect to debug server instead of launching debug adapter
			config.debugServer = this._server.address().port;
		}

		return config;
	}

	dispose() {
		if (this._server) {
			this._server.close();
		}
	}
}
