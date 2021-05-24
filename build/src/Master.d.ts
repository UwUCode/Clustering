import ServiceManager, { ServiceCreator } from "./service/ServiceManager";
import { Emitted } from "./IPC";
import IPCMaster, { Stats } from "./IPCMaster";
import ClusterManager from "./cluster/ClusterManager";
import { SomePartial } from "utilities";
import { DefaultEventMap, EventEmitter } from "tsee";
import { BotActivityType, Client, ClientOptions, Status } from "eris";
export interface BuiltInIPCEvents extends DefaultEventMap {
    "serviceStart": Emitted<null, "service">;
    "serviceSetupDone": Emitted<null, "service">;
    "clusterStart": Emitted<null, "cluster">;
    "clusterReady": Emitted<null, "cluster">;
    "shardConnect": Emitted<number, "cluster">;
    "shardReady": Emitted<number, "cluster">;
    "shardDisconnect": Emitted<{
        error: Error;
        id: number;
    }, "cluster">;
    "shardResume": Emitted<number, "cluster">;
}
export declare type ShutdownCallback = () => void;
export interface StartingStatus {
    status: Status;
    game?: {
        name: string;
        type: BotActivityType;
        url?: string;
    };
}
export interface WebhookConfig {
    type: "cluster" | "shard" | "service";
    id: string;
    token: string;
    username?: string;
    avatar?: string;
}
export interface Options {
    path: string;
    token: string;
    shardCount: number | "auto";
    clusterCount: number | "auto";
    clientOptions: ClientOptions;
    clusterTimeout: number;
    serviceTimeout: number;
    killTimeout: number;
    nodeArgs: Array<string>;
    statsInterval: number;
    fetchTimeout: number;
    startingStatus: StartingStatus | null;
    services: Array<ServiceCreator>;
    webhooks: Array<WebhookConfig>;
    pid: false | string;
}
export default class Manager extends EventEmitter {
    ipc: IPCMaster<BuiltInIPCEvents>;
    options: Omit<Options, "shardCount" | "clusterCount"> & Record<"shardCount" | "clusterCount", number>;
    services: ServiceManager;
    clusters: ClusterManager;
    eris: Client;
    statsPaused: boolean;
    private launched;
    private current;
    private statsInterval;
    stats?: Stats;
    constructor(opts: SomePartial<Options, "path" | "token">);
    launch(): Promise<void>;
    private chunkShards;
    startStats(): void;
    stopStats(): void;
    private getStats;
}
