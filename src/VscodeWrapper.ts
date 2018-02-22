/**
 * author: LiXizhi
 * email: lixizhi@yeah.net
 * date: 2018/2.22
 * desc: because typescript does not support conditional import, the vscode module is not available when adapter is
 * running in server mode, so we have to fake it here.
 * The implementation is filled when extension.ts is loaded, otherwise all functions are just fake ones
 */


/**
 * wrapping a few vscode functions for use in NPL adapter.
 */

var vscode_imp: any;

/** the implementation is filled when extension.ts is loaded, otherwise all functions are just fake*/
export function SetVsCodeImplementation(vscode: any) {
	vscode_imp = vscode;
}

export function showInformationMessage(text: string, button?: string, callback?: any) {
	if (vscode_imp) {
		vscode_imp.window.showInformationMessage(text, "OK").then((item) => {
			if (item == "OK" && callback) {
				callback();
			}
		});
	}
}

export function  open_url(url:string){
	if (vscode_imp) {
		vscode_imp.commands.executeCommand('vscode.open', vscode_imp.Uri.parse(url));
	}
}
