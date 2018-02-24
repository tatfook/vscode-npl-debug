/**
 * author: LiXizhi
 * email: lixizhi@yeah.net
 * date: 2018/2.19
 */
import { DebugProtocol } from 'vscode-debugprotocol';

/**
 * This interface describes the NPL-debug specific launch attributes
 * (which are not part of the Debug Adapter Protocol).
 * The schema for these attributes lives in the package.json of the NPL-debug extension.
 * The interface should always match this schema.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	/** port number */
	port: number;
	/** An absolute path to the "program" to debug. */
	program: string;
	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
	/** array of search paths */
	searchpath?: Array<string>;
	runtimeExecutable?:string;
	bootstrapper?:string;
	cwd?:string;
	timeout?:number;
}

export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
	/** port number */
	port: number;
	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
	/** array of search paths */
	searchpath?: Array<string>;
	timeout?:number;
}