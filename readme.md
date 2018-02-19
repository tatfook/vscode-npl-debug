# VS Code NPL Debug

**NPL Debug** uses `NPL HTTP Debugger` adapter for Visual Studio Code.
It supports *step*, *continue*, *breakpoints*, *exceptions*

More information about how to develop a new debug adapter can be found
[here](https://code.visualstudio.com/docs/extensions/example-debuggers).

## Using NPL Debug

* Install the **NPL Debug** extension in VS Code.
* Create a new 'program' file `readme.md` and enter several lines of arbitrary text.
* Switch to the debug viewlet and press the gear dropdown.
* Select the debug environment "NPL Debug".
* Press the green 'play' button to start debugging.

You can now 'step through' the `readme.md` file, set and hit breakpoints, and run into exceptions (if the word exception appears in a line).

## Build and Debug

```bash
git clone https://github.com/tatfook/vscode-npl-debug.git
cd vscode-npl-debug
npm install
## in case of root user, use following
npm install --unsafe-perm
```

* Open the project folder in VS Code.
* In debug panel, select `Extension + Server`,  Press `F5` to build and launch NPL Debug in another VS Code window. In that window:
  * Open a new workspace, create a new 'program' file `readme.md` and enter several lines of arbitrary text.
  * Switch to the debug viewlet and press the gear dropdown.
  * Select the debug environment "NPL Debug".
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
