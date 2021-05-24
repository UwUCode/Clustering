import Cluster from "./Cluster";
import { ShutdownCallback } from "../Master";
export interface BaseInitalizer {
    cluster: Cluster;
}
export declare type BaseWithSignature = BaseInitalizer & (new (d: BaseInitalizer) => Base);
export default abstract class Base {
    cluster: Cluster;
    constructor({ cluster }: BaseInitalizer);
    get ipc(): import("..").IPC<import("./Cluster").ClusterDefaultEvents>;
    get clusterId(): number;
    get client(): import("eris").Client;
    get bot(): import("eris").Client;
    abstract launch(): Promise<void>;
    abstract shutdown(cb: ShutdownCallback): void;
}
