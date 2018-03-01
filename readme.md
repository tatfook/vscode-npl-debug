# VS Code NPL Debug

**NPL Debug** uses [NPL HTTP Debugger](https://github.com/LiXizhi/NPLRuntime/wiki/DebugAndLog) adapter for Visual Studio Code.
It supports *step*, *continue*, *breakpoints*, etc.

More information about how to develop a new debug adapter can be found
[here](https://code.visualstudio.com/docs/extensions/example-debuggers). Here is a good reference of [chrome debugger](https://github.com/Microsoft/vscode-chrome-debug-core/blob/master/src/chrome/chromeDebugAdapter.ts)

## Using NPL Debug In Attach Mode

* Install the **NPL Debug** extension in VS Code.
* Run NPL program in the current workspace directory with HTTP debug enabled.
* Switch to the debug viewlet and press the gear dropdown.
* Select the debug environment "NPL Debug Attach".
* Press the green 'play' button to start debugging.

One can specify searchpath for additional folders when opening source files. Your `launch.json` could look like this one:
The `${workspaceFolder}` is always added to search path by default.
```js
  {
    "type": "NPL",
    "request": "attach",
    "name": "NPL Http Attach",
    "port": 8099,
    "trace": false,
    "searchpath": [
      "${workspaceFolder}/npl_packages/main",
      "${workspaceFolder}/npl_packages/paracraft"
    ]
  }
```

> vscode support multiple debug sessions, so one can install `Chrome Debugger` and start it alongside `NPL debugger`,
so that one can debug both frontend and backend code in the same vscode ide.

parameters:
- port: this is the NPL http debugger port on the target running application.
- searchpath: where the debugger should look for corresponding source code when a breakpoint is hit.
- trace: output more information to the debug console.

### Using Launch Mode
Attach mode is always recommended for advanced users. Because, when no debugger is detached, the app is running in full speed. And one can attach,detach multiple times to the same running application.

For users who want to debug the first script loaded, we also provide the launch mode. The difference is that one no longer needs to start the NPL runtime manually, instead one must specify the runtimeExecutable, bootstrapper, etc in `launch.json` like below.

```json
{
    "type": "NPL",
    "request": "launch",
    "name": "Launch NPL",
    "runtimeExecutable": "D:\\lxzsrc\\ParaCraftSDK\\redist\\paraengineclient.exe",
    "bootstrapper": "script/apps/Aries/main_loop.lua", // or use "current_open_file"
    "cmdlineParams": "mc=true noupdate=true",
    "port": 8099,
    "searchpath": [
      "${workspaceFolder}/npl_packages/main",
      "${workspaceFolder}/npl_packages/paracraft"
    ],
    "exitAppOnStop": true,
    "trace": false
},
```

parameters:
- runtimeExecutable: if not specified or "npl", we will search in environment path variable for a installed NPL runtime executable. Under linux or mac, this is usually `/usr/local/bin/npl`
- bootstrapper: the main NPL script file relative to working directory, such as main_loop.lua. if this is `current_open_file`, it will use the file that is currently open in the editor.
- cmdlineParams: additional command line parameters without bootstrapper and port.
- exitAppOnStop: whether to exit the application when the user stopped debugging

## Build and Debug

```bash
git clone https://github.com/tatfook/vscode-npl-debug.git
cd vscode-npl-debug
npm install
```

* Open the project folder in VS Code.
* In debug panel, select `Extension + Server`,  Press `F5` to build and launch NPL Debug in another VS Code window. In that window:
  * Run NPL program in the current workspace directory with HTTP debug enabled.
  * Switch to the debug viewlet and press the gear dropdown.
  * Select the debug environment "NPL Debug Attach" (add `debugServer:4711` to `launch.json`).
  * Press `F5` to start debugging.

Or in `launch.json`
```js
  {
    "type": "NPL",
    "request": "launch",
    "name": "NPL Sample",
    "port": 8099,
    "debugServer": 4711,
    "trace": true,
    "program": "${workspaceFolder}/readme.md",
    "stopOnEntry": true
  }
```
It is very important to enable `debugServer` on port 4711, otherwise you can not debug the NPL adapter.
If you are not debugging the server, you should remove `debugServer` line.
For more information, please read carefully [this doc](https://code.visualstudio.com/docs/extensions/example-debuggers)

### Publish the extension
Refer to [this](https://code.visualstudio.com/docs/extensions/publish-extension)
We need to register a token and create a publisher called `tatfook`.
```
npm install -g vsce
vsce package
vsce publish minor
```