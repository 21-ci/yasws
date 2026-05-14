![](misc/images/banner.png)

[![npm version](https://img.shields.io/npm/v/yasws.svg)](https://www.npmjs.com/package/yasws)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Socket Badge](https://socket.dev/api/badge/npm/package/yasws)](https://socket.dev/npm/package/yasws)
[![TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](https://www.typescriptlang.org/)
![Unsecure for production](https://img.shields.io/badge/not%20production--ready-red.svg)

> **Y**et **A**nother **S**imple **W**eb **S**erver - the first cool-sounding 
> abbreviation that came to mind

YASWS is a small, transport-agnostic TypeScript web framework (so you can use 
multiple sources to passthrough requests to the server).

It's used to write simple apps for [Web Assembly](https://webassembly.org) 
and uses [Web Assembly System Interface](https://wasi.dev/interfaces) for http calls,
making it **simple, secure and optimized way to package and run your 
backend on multiple environments**.

We're thinking on extending it use above only writing some apps - the plan is to
build an ecosystem around YASWS and [worker service](https://github.com/21-ci/worker), 
to build, distribute and run backend services with WASM.

## How?

First of all, YASWS is distributed via [npm](https://npmjs.com/package/yasws), 
so you can install it with `npm i yasws`.

Additionaly, there is a [GUIDE.md](./GUIDE.md) file, which provides some examples on 
how to use YASWS for your applications. You can also utilize [AGENTS.md](./AGENTS.md) 
(which was written by Claude, so I'm not sure how good it is) for development with AI.

Also read the [CHANGELOG.md](./CHANGELOG.md) to see new functionality or breaking
changes to the project.

## Contributing

We'd love for you to create pull requests for this project from the development 
branch (or use feat/X for separate functionality, that can be useful but not prod 
ready or tested). 
Releases are created from the main branch.
