import Cluster from "./Cluster";
import { ShutdownCallback } from "../Master";

export interface BaseInitalizer {
	cluster: Cluster;
}

export type BaseWithSignature = BaseInitalizer & (new(d: BaseInitalizer) => Base);
export default abstract class Base {
	cluster: Cluster;
	constructor({ cluster }: BaseInitalizer) {
		this.cluster = cluster;
		this.ipc.on("shutdown", () => {
			this.shutdown(() => {
				process.kill(process.pid, "SIGTERM");
			});
		});
	}

	get ipc() {
		return this.cluster.ipc;
	}
	get clusterId() {
		return this.cluster.id;
	}
	get client() {
		return this.cluster.client;
	}
	get bot() {
		return this.client;
	}

	abstract launch(): Promise<void>;
	abstract shutdown(cb: ShutdownCallback): void;
}
