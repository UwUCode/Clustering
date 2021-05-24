import BaseCluster from "./cluster/BaseCluster";
import Cluster from "./cluster/Cluster";
import ClusterManager from "./cluster/ClusterManager";
import BaseService from "./service/BaseService";
import ServiceManager from "./service/ServiceManager";
import IPC from "./IPC";
import Master from "./Master";
export * from "./cluster/BaseCluster";
export * from "./cluster/Cluster";
export * from "./cluster/ClusterManager";
export * from "./service/BaseService";
export * from "./service/ServiceManager";
export * from "./Constants";
export * from "./IPC";
export * from "./Master";
import { version as VERSION } from "../package.json";


export {
	BaseCluster,
	Cluster,
	ClusterManager,
	BaseService,
	ServiceManager,
	IPC,
	Master,
	VERSION
};
export default Master;
