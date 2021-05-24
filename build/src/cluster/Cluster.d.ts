import Base from "./Base";
import IPC, { Emitted } from "../IPC";
import { Options } from "../Master";
import Eris from "eris";
export interface ClusterDefaultEvents {
    "clusterSetup": Emitted<{
        options: Options;
        shards: Array<number>;
        shardStart: number;
        shardEnd: number;
    }, "master">;
    "getStats": Emitted<null, "master">;
    "evalAtCluster": Emitted<string, "master">;
    "launch": Emitted<null, "master">;
    "shutdown": Emitted<boolean, "master">;
}
export default class Cluster {
    ipc: IPC<ClusterDefaultEvents>;
    id: number;
    path: string;
    class: Base;
    client: Eris.Client;
    options: Options;
    shards: Array<number>;
    shardStart: number;
    shardEnd: number;
    constructor(id: number, path: string);
    private start;
}
