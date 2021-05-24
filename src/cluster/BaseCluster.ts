import Cluster from "./Cluster";
import { ShutdownCallback } from "../Master";

export interface BaseClusterInitializer {
	cluster: Cluster;
}

export type BaseClusterWithSignature = BaseClusterInitializer & (new(d: BaseClusterInitializer) => BaseCluster);
export default abstract class BaseCluster {
	cluster: Cluster;
	constructor({ cluster }: BaseClusterInitializer) {
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
