# VS Code NPL Debug

**NPL Debug** uses [NPL HTTP Debugger](https://github.com/LiXizhi/NPLRuntime/wiki/DebugAndLog) adapter for Visual Studio Code.
It supports *step*, *continue*, *breakpoints*, etc.

More information about how to develop a new debug adapter can be found
[here](https://code.visualstudio.com/docs/extensions/example-debuggers). Here is a good reference of [chrome debugger](https://github.com/Microsoft/vscode-chrome-debug-core/blob/master/src/chrome/chromeDebugAdapter.ts)

## Using NPL Debug

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
