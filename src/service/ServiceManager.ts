import { Emitted } from "../IPC";
import Master from "../Master";
import Logger from "logger";
import { Colors, EmbedBuilder } from "core";
import { Worker, fork } from "cluster";

export interface ServiceDefaultEvents {
	"serviceCommand": Emitted<{ responsive: boolean; cmdData: unknown; id: string; }, "cluster" | "master">;
	"getStats": Emitted<null, "master">;
	"evalAtService": Emitted<string, "master">;
	"shutdown": Emitted<boolean, "master">;
}

export interface ServiceCreator {
	name: string;
	path: string;
}

export default class ServiceManager {
	master: Master;
	list: Array<ServiceCreator>;
	workers = [] as Array<Worker>;
	workersByName = new Map<string, Worker>();
	private started = false;
	private shutdown = [] as Array<string>;
	constructor(list: Array<ServiceCreator>, master: Master) {
		this.list = list;
		this.master = master;
	}

	async start() {
		return new Promise<void>((resolve, reject) => {
			if (this.started === true) reject(new TypeError("Services have already been started."));
			Logger.info("ServiceManager", "Launching services...");
			const toStart = this.list.map(v => v.name);
			if (toStart.length === 0) {
				Logger.info("ServiceManager", "No services to start.");
				return resolve();
			}
			this.master.ipc.on("serviceSetupDone", (data, messageId, { name }) => {
				Logger.info("ServiceManager", `The service ${name} has finished launching.`);
				this.master.options.webhooks.filter(w => w.type === "service").forEach(w => this.master.eris.executeWebhook(w.id, w.token, {
					username: w.username,
					avatarURL: w.avatar,
					embeds: [
						new EmbedBuilder("en")
							.setTitle("Service Ready")
							.setDescription(`The service **${name}** is ready.`)
							.setTimestamp(new Date().toISOString())
							.setColor(Colors.green)
							.setFooter(`Service: ${name}`)
							.toJSON()
					]
				}));
				toStart.shift();
				if (toStart.length === 0) {
					this.master.ipc.removeAllListeners("serviceSetupDone");
					Logger.info("ServiceManager", "Finished launching services.");
					return resolve();
				} else this.startService(toStart[0], this.getPath(toStart[0])!);
			});
			this.startService(toStart[0], this.getPath(toStart[0])!);
		});
	}

	get(name: string) {
		return this.workersByName.get(name);
	}
	has(name: string) {
		return this.get(name) !== undefined;
	}

	getPath(name: string) {
		return this.list.find(v => v.name === name)?.path;
	}

	private startService(name: string, path: string) {
		const w = fork({
			TYPE: "SERVICE",
			NODE_ENV: process.env.NODE_ENV,
			NAME: name,
			JS_PATH: path
		});
		w
			.on("message", this.master.ipc.messageHandler.bind(this.master.ipc))
			.on("exit", (code, signal) => {
				console.log(`exit[service-${name}]`, code, signal);
				let shutdown = false;
				if (this.shutdown.includes(name)) {
					shutdown = true;
					this.shutdown.splice(this.shutdown.indexOf(name), 1);
				}
				this.master.options.webhooks.filter(v => v.type === "service").forEach(v => this.master.eris.executeWebhook(v.id, v.token, {
					username: v.username,
					avatarURL: v.avatar,
					embeds: [
						new EmbedBuilder("en")
							.setTitle(`Service ${shutdown ? "Shutdown" : "Death"}`)
							.setDescription(`The service **${name}** has ${shutdown ? "been shutdown" : "died"}.`)
							.setTimestamp(new Date().toISOString())
							.setColor(Colors.red)
							.setFooter(`Service: ${name} | Signal: ${signal}`)
							.toJSON()
					]
				}));
				this.startService(name, path);
			});
		this.workers.push(w);
		this.workersByName.set(name, w);
		Logger.info("ServiceManager", `Launching the service ${name} (PID: ${w.process.pid}).`);
		this.master.options.webhooks.filter(v => v.type === "service").forEach(v => this.master.eris.executeWebhook(v.id, v.token, {
			username: v.username,
			avatarURL: v.avatar,
			embeds: [
				new EmbedBuilder("en")
					.setTitle("Service Starting")
					.setDescription(`The service **${name}** is starting.`)
					.setTimestamp(new Date().toISOString())
					.setColor(Colors.gold)
					.setFooter(`Service: ${name}`)
					.toJSON()
			]
		}));
	}

	restartService(name: string, force = false) {
		const c = this.get(name);
		const l = this.list.find(v => v.name === name);
		if (!c) throw new Error(`Unknown service "${name}".`);
		if (!l) throw new Error(`Unable to find information for service ${name}.`);
		Logger.warn("ServiceManager", `Restarting the service "${name}" (force: ${force ? "Yes" : "No"})`);
		if (force) c.kill("SIGKILL");
		else this.master.ipc.sendMessage("shutdown", force, `service.${name}`);
	}

	restartAllServices(force = false) {
		this.list.forEach(({ name }) => this.restartService(name, force));
	}

	shutdownService(name: string, force = false) {
		const c = this.get(name);
		const l = this.list.find(v => v.name === name);
		if (!c) throw new Error(`Unknown service "${name}".`);
		if (!l) throw new Error(`Unable to find information for service ${name}.`);
		this.shutdown.push(name);
		Logger.warn("ServiceManager", `Restarting the service "${name}" (force: ${force ? "Yes" : "No"})`);
		if (force) c.kill("SIGKILL");
		else this.master.ipc.sendMessage("shutdown", force, `service.${name}`);
	}

	shutdownAllServices(force = false) {
		this.list.forEach(({ name }) => this.shutdownService(name, force));
	}
}
