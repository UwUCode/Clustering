/// <reference types="node" />
import { Options } from "../Master";
import Master from "..";
import { Worker } from "cluster";
interface ClusterCreator {
    id: number;
    shards: Array<number>;
    firstShard: number;
    lastShard: number;
}
export default class ClusterManager {
    master: Master;
    list: Array<ClusterCreator>;
    private options;
    workers: Worker[];
    workersById: Map<number, Worker>;
    private started;
    private firstReady;
    private shutdown;
    constructor(opt: Options, master: Master);
    start(clusters: Array<ClusterCreator>): Promise<void>;
    get(id: number): Worker | undefined;
    has(id: number): boolean;
    startCluster(id: number, shards: Array<number>, shardStart: number, shardEnd: number): void;
    restartCluster(id: number, force?: boolean): void;
    restartAllClusters(force?: boolean): void;
    private shutdownClusterStep;
    shutdownCluster(id: number, force?: boolean): void;
    shutdownAllClusters(force?: boolean): void;
}
export {};
