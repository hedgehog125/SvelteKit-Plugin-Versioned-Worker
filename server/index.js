/*
TODO


*/

import path from "sandboxed-path";
import moreFS from "fs";
const fs = moreFS.promises;

import ipPackage from "ip";
const IP = ipPackage.address();

import express from "express";
const app = express();

const state = {};
let config; // It'll be loaded from the disk
let PORT; // Loaded as part of config or from the environment variable

const loadConfig = async _ => {
	config = JSON.parse(await fs.readFile(path.accessLocal("config.json")));

	PORT = process.env.PORT?? config.port;
};

const startServer = _ => {
	app.get("/info", (req, res) => {
		res.json({
			type: "**Insert value**"
		});
	});

	app.listen(PORT, _ => {
		console.log(
			`Running on port ${PORT} using IP ${IP}.
	
For access on the same machine: http://localhost:${PORT}/
And for other devices on your LAN: http://${IP}:${PORT}/
`
		);
	});
};

const start = async _ => {
	await loadConfig();

	startServer();
};
start();