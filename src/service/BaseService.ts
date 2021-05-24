import { ServiceDefaultEvents } from "./ServiceManager";
import IPC, { ClusterMessageRoute } from "../IPC";
import { ShutdownCallback } from "../Master";
import { performance } from "perf_hooks";

export interface ServiceInitalizer {
	ipc: IPC<ServiceDefaultEvents>;
	name: string;
}

export type BaseServiceWithSignature = BaseService & (new(d: ServiceInitalizer) => BaseService);
export default abstract class BaseService {
	ipc: IPC<ServiceDefaultEvents>;
	name: string;
	protected processedCommands = 0;
	constructor({ ipc, name }: ServiceInitalizer) {
		this.ipc = ipc;
		this.name = name;
		this.ipc
			.on("serviceCommand", async(data, messageId, from) => {
				this.processedCommands++;
				if (data.responsive === false) void this.handleCommand(data.cmdData, from);
				else {
					void this.handleCommand(data.cmdData, from)
						.then(res =>
							this.ipc.sendMessage(messageId, res, from === "master" ? "master" : `cluster.${from.id}`)
						)
						.catch(err =>
							this.ipc.sendMessage(messageId, err, from === "master" ? "master" : `cluster.${from.id}`)
						);
				}
			})
			.on("getStats", () => this.ipc.sendMessage("stats", {
				name: this.name,
				memory: process.memoryUsage(),
				uptime: process.uptime(),
				processedCommands: this.processedCommands
			}))
			.on("evalAtService", async(data, messageId, from) => {
				const start = parseFloat(performance.now().toFixed(3));
				let res: unknown, error = false;
				try {
					// eslint-disable-next-line no-eval
					res = await eval(data);
				} catch (e) {
					error = true;
					res = e;
				}
				const end = parseFloat(performance.now().toFixed(3));
				this.ipc.sendMessage(messageId, { time: { start, end, total: parseFloat((end - start).toFixed(3)) }, result: { error, data: res } }, from);
			})
			.on("shutdown", () => {
				this.shutdown(() => {
					process.kill(process.pid, "SIGTERM");
				});
			})
			.sendMessage("serviceStart", null, "master");
	}

	get [Symbol.toStringTag]() {
		return `Service[${this.name}]`;
	}
	toString() {
		return `[Service ${this.name}]`;
	}

	get done() { return this.ready; }
 	ready() {
		this.ipc.sendMessage("serviceSetupDone", null, "master");
	}

	abstract shutdown(cb: ShutdownCallback): void;

	abstract handleCommand(data: unknown, from: "master" | ClusterMessageRoute): Promise<unknown>;
}
